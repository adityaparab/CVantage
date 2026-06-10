import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { http } from '@/api/http';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { Button, ProgressSteps, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/cn';

const ACCEPTED = ['.pdf', '.doc', '.docx'];
const MIME_OK = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_BYTES = 10 * 1024 * 1024;

type Phase =
  | { kind: 'idle'; error?: string }
  | { kind: 'uploading'; name: string; percent: number }
  | { kind: 'parsing'; resumeId: string; slow: boolean }
  | { kind: 'failed'; resumeId: string; error: string };

/** Client-side pre-checks - the server re-validates everything (#35). */
export function precheck(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ACCEPTED.includes(ext)) return 'Only .pdf, .doc and .docx files are supported.';
  if (file.type && !MIME_OK.has(file.type))
    return 'That file does not look like a PDF or Word document.';
  if (file.size > MAX_BYTES) return 'Files can be at most 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Upload flow (issue #68 / 8.4): dropzone -> upload progress -> AI parse. */
export default function UploadScreen() {
  usePageTitle('Upload resume');
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback((file: File) => {
    const problem = precheck(file);
    if (problem) {
      setPhase({ kind: 'idle', error: problem });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'uploading', name: file.name, percent: 0 });
    const form = new FormData();
    form.append('file', file);
    http
      .post<Types.ResumeDetail>('/resumes/upload', form, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
          setPhase((p) => (p.kind === 'uploading' ? { ...p, percent } : p));
        },
      })
      .then((res) => {
        const detail = res.data;
        if (detail.uploadParse?.status === 'failed') {
          setPhase({
            kind: 'failed',
            resumeId: detail.id,
            error: detail.uploadParse.error ?? 'The file could not be read.',
          });
        } else {
          setPhase({ kind: 'parsing', resumeId: detail.id, slow: false });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          setPhase({ kind: 'idle' });
          return;
        }
        setPhase({ kind: 'idle', error: normalizeApiError(err).message });
      });
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-ink">Upload your resume</h1>
      <p className="mt-1 text-sm text-muted">
        PDF or Word, up to 10 MB. The AI turns it into an editable resume.
      </p>

      {phase.kind === 'idle' ? (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a resume file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) start(file);
            }}
            className={cn(
              'mt-6 grid cursor-pointer place-items-center rounded-card border-2 border-dashed px-6 py-16 text-center transition-colors',
              dragOver
                ? 'border-accent bg-accent-soft'
                : 'border-line-2 bg-canvas-2 hover:border-accent',
            )}
          >
            <div>
              <p aria-hidden="true" className="text-3xl">
                📤
              </p>
              <p className="mt-2 font-semibold text-ink">Drag & drop your resume here</p>
              <p className="mt-1 text-sm text-muted">
                or click to choose a file (.pdf, .doc, .docx)
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="sr-only"
              aria-label="Choose resume file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) start(file);
                e.target.value = '';
              }}
            />
          </div>
          {phase.error ? (
            <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              {phase.error}
            </p>
          ) : null}
        </>
      ) : null}

      {phase.kind === 'uploading' ? (
        <div className="mt-6 rounded-card border border-line bg-card p-6 shadow-card">
          <p className="font-semibold text-ink">Uploading {phase.name}…</p>
          <div
            role="progressbar"
            aria-valuenow={phase.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-canvas-3"
          >
            <div
              className="bg-gradient-brand h-full transition-[width]"
              style={{ width: `${phase.percent}%` }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {phase.kind === 'parsing' ? (
        <ParsePhase
          resumeId={phase.resumeId}
          onSlow={() => setPhase((p) => (p.kind === 'parsing' ? { ...p, slow: true } : p))}
          slow={phase.slow}
          onDone={() => navigate(`/resumes/${phase.resumeId}/review`)}
          onFailed={(error) => setPhase({ kind: 'failed', resumeId: phase.resumeId, error })}
        />
      ) : null}

      {phase.kind === 'failed' ? (
        <div className="mt-6 rounded-card border border-danger/40 bg-card p-6 shadow-card">
          <p className="font-semibold text-danger">We could not read that resume</p>
          <p className="mt-1 text-sm text-muted">{humanizeParseError(phase.error)}</p>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => {
                void resumesApi.reparse(phase.resumeId).then(() => {
                  setPhase({ kind: 'parsing', resumeId: phase.resumeId, slow: false });
                });
              }}
            >
              Retry
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
              Choose another file
            </Button>
            <Link to="/resumes/new">
              <Button variant="ghost">Build it manually</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function humanizeParseError(raw: string): string {
  if (/ENCRYPTED_PDF/.test(raw))
    return 'The PDF is password-protected - remove the password and try again.';
  if (/EMPTY_TEXT/.test(raw))
    return 'No text could be extracted - the file may be a scanned image.';
  if (/No extracted text/.test(raw)) return 'No text could be extracted from this file.';
  if (/CORRUPT_FILE/.test(raw)) return 'The file appears to be corrupted or not a real document.';
  return raw;
}

function ParsePhase({
  resumeId,
  slow,
  onSlow,
  onDone,
  onFailed,
}: {
  resumeId: string;
  slow: boolean;
  onSlow: () => void;
  onDone: () => void;
  onFailed: (error: string) => void;
}) {
  const detail = useQuery({
    queryKey: keys.resumes.detail(resumeId),
    queryFn: () => resumesApi.get(resumeId),
    refetchInterval: 1500, // polling fallback; SSE invalidation accelerates it
  });
  useEffect(() => {
    const t = setTimeout(onSlow, 30_000);
    return () => clearTimeout(t);
  }, [onSlow]);
  useEffect(() => {
    const status = detail.data?.uploadParse?.status;
    if (status === 'completed') onDone();
    if (status === 'failed') onFailed(detail.data?.uploadParse?.error ?? 'Parsing failed.');
  }, [detail.data, onDone, onFailed]);

  return (
    <div className="mt-6 rounded-card border border-line bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <Spinner label="AI is processing" />
        <p className="font-semibold text-ink">AI is processing your resume…</p>
      </div>
      <div className="mt-4">
        <ProgressSteps
          steps={[
            { key: 'upload', label: 'Uploaded', status: 'completed' },
            { key: 'parse', label: 'AI parsing', status: 'in_progress' },
            { key: 'review', label: 'Review & edit', status: 'pending' },
          ]}
        />
      </div>
      {slow ? (
        <p role="status" className="mt-4 rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
          Still working - longer resumes can take a minute. You can safely keep this tab open.
        </p>
      ) : null}
    </div>
  );
}
