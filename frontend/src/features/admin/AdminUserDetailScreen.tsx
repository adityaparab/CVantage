import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { adminApi } from '@/api/endpoints/admin';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import {
  Badge,
  Button,
  Input,
  Modal,
  Skeleton,
  Table,
  statusTone,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { usePageTitle } from '@/hooks/usePageTitle';

/** Admin user details (issue #79 / 9.2). */
export default function AdminUserDetailScreen() {
  const { id = '' } = useParams();
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ fullName: '', email: '' });
  const [resetOpen, setResetOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const user = useQuery({ queryKey: keys.admin.user(id), queryFn: () => adminApi.user(id) });
  const resumes = useQuery({
    queryKey: keys.admin.userResumes(id, 1),
    queryFn: () => adminApi.userResumes(id),
  });
  usePageTitle(user.data ? `Admin · ${user.data.fullName}` : 'Admin · User');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };

  const patch = useMutation({
    mutationFn: () => adminApi.updateUser(id, draft),
    onSuccess: () => {
      setEditing(false);
      toast('success', 'Profile updated');
      refresh();
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      toast(
        'danger',
        e.status === 409 ? 'That email is already in use' : 'Could not update',
        e.message,
      );
    },
  });

  const reset = useMutation({
    mutationFn: (mode: 'temporary' | 'email') => adminApi.resetPassword(id, mode),
    onSuccess: (out) => {
      setResetOpen(false);
      if (out.temporaryPassword) setTempPassword(out.temporaryPassword);
      else toast('success', 'Reset email sent');
    },
    onError: () => toast('danger', 'Password reset failed'),
  });

  const setStatus = useMutation({
    mutationFn: (action: 'deactivate' | 'reactivate') =>
      action === 'deactivate' ? adminApi.deactivate(id) : adminApi.reactivate(id),
    onSuccess: refresh,
    onError: (err) => toast('danger', 'Status change failed', normalizeApiError(err).message),
  });

  const cascade = useMutation({
    mutationFn: adminApi.deleteResume,
    onSuccess: (out) => {
      toast('success', 'Resume deleted', `${out.analysesDeleted} analyses removed with it.`);
      refresh();
    },
    onError: () => toast('danger', 'Delete failed'),
  });

  if (user.isPending) return <Skeleton className="h-72 w-full" />;
  if (!user.data) return <p className="text-muted">User not found.</p>;
  const u = user.data;
  const isSelf = me?.id === u.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-ink">{u.fullName}</h1>
          <Badge tone={statusTone(u.status)}>{u.status}</Badge>
          {u.role === 'admin' ? <Badge tone="accent">admin</Badge> : null}
        </div>
        <Link to="/admin/users">
          <Button variant="ghost">Back to users</Button>
        </Link>
      </div>

      {/* profile */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Profile</h2>
          {!editing ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({ fullName: u.fullName, email: u.email });
                setEditing(true);
              }}
            >
              Edit
            </Button>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-3 flex flex-col gap-3 sm:max-w-md">
            <Input
              aria-label="Full name"
              value={draft.fullName}
              onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
            />
            <Input
              aria-label="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={patch.isPending} onClick={() => patch.mutate()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="font-medium text-ink">{u.email}</dd>
            </div>
            <div>
              <dt className="text-muted">Registered</dt>
              <dd className="font-medium text-ink">{new Date(u.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-muted">Last active</dt>
              <dd className="font-medium text-ink">
                {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Resumes / analyses</dt>
              <dd className="font-medium text-ink">
                {u.resumeCount} / {u.analysisCount}
              </dd>
            </div>
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button size="sm" variant="soft" onClick={() => setResetOpen(true)}>
            Reset password
          </Button>
          {!isSelf ? (
            u.status === 'active' ? (
              <Button
                size="sm"
                variant="danger"
                loading={setStatus.isPending}
                onClick={() => {
                  void (async () => {
                    if (
                      await confirm({
                        title: `Deactivate ${u.fullName}?`,
                        body: 'They are signed out everywhere immediately.',
                        confirmLabel: 'Deactivate',
                        tone: 'danger',
                      })
                    ) {
                      setStatus.mutate('deactivate');
                    }
                  })();
                }}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                size="sm"
                loading={setStatus.isPending}
                onClick={() => setStatus.mutate('reactivate')}
              >
                Reactivate
              </Button>
            )
          ) : (
            <p className="self-center text-[0.78rem] text-muted">This is your own account.</p>
          )}
        </div>
      </section>

      {/* resumes - metadata ONLY, never content */}
      <section>
        <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">
          Resumes (metadata only - content is never visible to admins)
        </h2>
        {resumes.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <Table<Types.AdminResumeRow>
            columns={[
              { key: 'name', header: 'Name', render: (r) => r.name },
              { key: 'source', header: 'Source', render: (r) => r.source },
              {
                key: 'analysisStatus',
                header: 'Status',
                render: (r) => (
                  <Badge tone={statusTone(r.analysisStatus)}>
                    {r.analysisStatus.replace('_', ' ')}
                  </Badge>
                ),
              },
              { key: 'analysisCount', header: 'Analyses', render: (r) => r.analysisCount },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                className: 'text-right',
                render: (r) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete resume ${r.name}`}
                    onClick={() => {
                      void (async () => {
                        if (
                          await confirm({
                            title: `Delete "${r.name}"?`,
                            body: `This cascades: the resume AND its ${r.analysisCount} analyses are removed for the user.`,
                            confirmLabel: 'Delete everything',
                            tone: 'danger',
                          })
                        ) {
                          cascade.mutate(r.id);
                        }
                      })();
                    }}
                  >
                    Delete
                  </Button>
                ),
              },
            ]}
            rows={resumes.data?.items ?? []}
            rowKey={(r) => r.id}
            empty="No resumes."
          />
        )}
      </section>

      {/* reset-password modal */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset password"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="soft" loading={reset.isPending} onClick={() => reset.mutate('email')}>
              Send reset email
            </Button>
            <Button loading={reset.isPending} onClick={() => reset.mutate('temporary')}>
              Generate temporary password
            </Button>
          </>
        }
      >
        Choose how to reset {u.fullName}&rsquo;s password: send them the standard reset email, or
        generate a temporary password to hand over - it is shown exactly once and they must change
        it at next login.
      </Modal>

      {/* temp password - shown exactly once */}
      <Modal
        open={tempPassword !== null}
        onClose={() => setTempPassword(null)}
        title="Temporary password"
        footer={<Button onClick={() => setTempPassword(null)}>Done - I copied it</Button>}
      >
        <p className="text-sm text-muted">
          This is shown ONCE and cannot be retrieved again. All their sessions were signed out.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-canvas-3 px-3 py-2 font-mono text-sm text-ink">
            {tempPassword}
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(tempPassword ?? '').then(
                () => toast('success', 'Copied'),
                () => toast('danger', 'Copy failed - select it manually'),
              );
            }}
          >
            Copy
          </Button>
        </div>
      </Modal>
    </div>
  );
}
