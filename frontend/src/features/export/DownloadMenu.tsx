import { useEffect, useRef, useState } from 'react';

import { normalizeApiError } from '@/api/errors';
import { http } from '@/api/http';
import { Button, useToast } from '@/components/ui';

const filenameFrom = (disposition: string | undefined, fallback: string): string => {
  const match = /filename="([^"]+)"/.exec(disposition ?? '');
  return match?.[1] ?? fallback;
};

/** Download dropdown (issue #82 / 9.5) - live now that #81 shipped. */
export function DownloadMenu({ resumeId, resumeName }: { resumeId: string; resumeName: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'pdf' | 'docx'>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const download = async (format: 'pdf' | 'docx') => {
    setBusy(format);
    setOpen(false);
    try {
      const res = await http.get<Blob>(`/resumes/${resumeId}/export`, {
        params: { format },
        responseType: 'blob',
        timeout: 120_000,
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(
        res.headers['content-disposition'] as string | undefined,
        `${resumeName}.${format}`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const e = normalizeApiError(err);
      toast(
        'danger',
        `${format.toUpperCase()} export failed`,
        e.status === 503 ? 'PDF export is not configured on this deployment yet.' : e.message,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        loading={busy !== null}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        Download ▾
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="Download formats"
          className="absolute right-0 z-50 mt-1 w-44 rounded-card border border-line bg-card p-1 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-canvas-3"
            onClick={() => void download('pdf')}
          >
            PDF (.pdf)
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-canvas-3"
            onClick={() => void download('docx')}
          >
            Word (.docx)
          </button>
        </div>
      ) : null}
    </div>
  );
}
