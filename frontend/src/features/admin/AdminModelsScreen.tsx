import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminApi } from '@/api/endpoints/admin';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Modal,
  Skeleton,
  Table,
  statusTone,
  useConfirm,
  useToast,
} from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const USAGES = [
  { value: 'resume_parsing', label: 'Resume parsing' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'fallback', label: 'Fallback' },
] as const;

const EMPTY_FORM = { provider: 'openai', modelName: '', apiKey: '', usages: ['analysis'] as string[] };

/** AI model settings (issue #80 / 9.3) over the #55 admin endpoints. */
export default function AdminModelsScreen() {
  usePageTitle('Admin · Settings');
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [rotating, setRotating] = useState<Types.AdminModel | null>(null);
  const [rotateKey, setRotateKey] = useState('');

  const models = useQuery({ queryKey: keys.admin.models(), queryFn: adminApi.models });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.admin.models() });

  const add = useMutation({
    mutationFn: () => adminApi.addModel(form),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setFormError(null);
      toast('success', 'Model added', 'The key validated and is now encrypted at rest.');
      refresh();
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      // inline; other fields preserved
      setFormError(
        e.status === 409 ? 'That provider/model combination already exists.' : e.message,
      );
    },
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminApi.patchModel(id, { status }),
    onSuccess: refresh,
  });

  const rotate = useMutation({
    mutationFn: () => adminApi.rotateModelKey(rotating!.id, rotateKey),
    onSuccess: () => {
      setRotating(null);
      setRotateKey('');
      toast('success', 'Key rotated');
      refresh();
    },
    onError: (err) => toast('danger', 'Rotation failed', normalizeApiError(err).message),
  });

  const remove = useMutation({
    mutationFn: adminApi.removeModel,
    onSuccess: refresh,
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 409) {
        const orphaned = (e.details as { orphanedUsages?: string[] } | undefined)?.orphanedUsages;
        toast(
          'danger',
          'Cannot delete the last active model',
          `No fallback exists for: ${(orphaned ?? []).join(', ')}. Add or activate another model first.`,
        );
        return;
      }
      toast('danger', 'Delete failed', e.message);
    },
  });

  const toggleUsage = (value: string) =>
    setForm((f) => ({
      ...f,
      usages: f.usages.includes(value) ? f.usages.filter((u) => u !== value) : [...f.usages, value],
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">AI models</h1>
        <p className="text-sm text-muted">
          Keys are validated live, then AES-encrypted - only the last 4 characters stay visible.
        </p>
      </div>

      {models.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table<Types.AdminModel>
          columns={[
            { key: 'modelName', header: 'Model', render: (m) => <span className="font-semibold">{m.modelName}</span> },
            { key: 'provider', header: 'Provider', render: (m) => m.provider },
            {
              key: 'key',
              header: 'API key',
              render: (m) => <code className="font-mono text-[0.8rem]">{m.apiKeyMasked}</code>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (m) => <Badge tone={statusTone(m.status)}>{m.status}</Badge>,
            },
            {
              key: 'usages',
              header: 'Usages',
              render: (m) => (
                <span className="flex flex-wrap gap-1">
                  {m.usages.map((u) => (
                    <Badge key={u} tone="accent">
                      {u.replace('_', ' ')}
                    </Badge>
                  ))}
                </span>
              ),
            },
            {
              key: 'lastUsedAt',
              header: 'Last used',
              render: (m) => (m.lastUsedAt ? new Date(m.lastUsedAt).toLocaleString() : '—'),
            },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              className: 'text-right',
              render: (m) => (
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      patch.mutate({ id: m.id, status: m.status === 'active' ? 'disabled' : 'active' })
                    }
                  >
                    {m.status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRotating(m)}>
                    Rotate key
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${m.modelName}`}
                    onClick={() => {
                      void (async () => {
                        if (
                          await confirm({
                            title: `Remove ${m.provider}/${m.modelName}?`,
                            confirmLabel: 'Remove',
                            tone: 'danger',
                          })
                        ) {
                          remove.mutate(m.id);
                        }
                      })();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          rows={models.data ?? []}
          rowKey={(m) => m.id}
          empty="No models yet - the env fallback serves requests until you add one."
        />
      )}

      {/* add model */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Add a model</h2>
        <form
          noValidate
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Provider
            <Input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="openai"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
            Model name
            <Input
              value={form.modelName}
              onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
              placeholder="gpt-4o"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink sm:col-span-2">
            API key
            <Input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-…"
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-ink">Usages</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {USAGES.map((u) => (
                <Checkbox
                  key={u.value}
                  id={`usage-${u.value}`}
                  label={u.label}
                  checked={form.usages.includes(u.value)}
                  onChange={() => toggleUsage(u.value)}
                />
              ))}
            </div>
          </fieldset>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              type="submit"
              loading={add.isPending}
              disabled={!form.provider || !form.modelName || form.apiKey.length < 8 || form.usages.length === 0}
            >
              Validate & add model
            </Button>
          </div>
        </form>
      </section>

      {/* rotate modal */}
      <Modal
        open={rotating !== null}
        onClose={() => setRotating(null)}
        title={`Rotate key for ${rotating?.modelName ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRotating(null)}>
              Cancel
            </Button>
            <Button loading={rotate.isPending} disabled={rotateKey.length < 8} onClick={() => rotate.mutate()}>
              Validate & rotate
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          New API key
          <Input
            type="password"
            autoComplete="off"
            value={rotateKey}
            onChange={(e) => setRotateKey(e.target.value)}
            placeholder="sk-…"
          />
        </label>
        <p className="mt-2 text-[0.78rem] text-muted">
          The new key is pinged before anything is stored; the old ciphertext is overwritten.
        </p>
      </Modal>
    </div>
  );
}
