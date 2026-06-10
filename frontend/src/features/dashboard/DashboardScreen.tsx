import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError, toastMessage } from '@/api/errors';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Table,
  statusTone,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useLiveInvalidation } from '@/hooks/useLiveInvalidation';
import { usePageTitle } from '@/hooks/usePageTitle';

const STATUS_LABEL: Record<Types.ResumeAnalysisStatus, string> = {
  unanalyzed: 'Unanalyzed',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
};

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

function StatsCards() {
  const stats = useQuery({ queryKey: keys.resumes.stats(), queryFn: resumesApi.stats });
  const cards = [
    { label: 'Resumes', value: stats.data?.resumeCount },
    { label: 'Analyses run', value: stats.data?.analysisCount },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:max-w-md">
      {cards.map((c) => (
        <div key={c.label} className="rounded-card border border-line bg-card p-4 shadow-card">
          <p className="text-[0.78rem] font-semibold text-muted uppercase tracking-wide">
            {c.label}
          </p>
          {stats.isPending ? (
            <Skeleton className="mt-2 h-7 w-12" />
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-ink">{c.value ?? 0}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Candidate dashboard (issue #67 / 8.3) - the hub. */
export default function DashboardScreen() {
  usePageTitle('Dashboard');
  useLiveInvalidation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ sortBy: string; order: 'asc' | 'desc' }>({
    sortBy: 'createdAt',
    order: 'desc',
  });
  const query: Types.ResumeListQuery = {
    page,
    limit: 10,
    sortBy: sort.sortBy as Types.ResumeListQuery['sortBy'],
    order: sort.order,
  };
  const resumes = useQuery({
    queryKey: keys.resumes.list(query),
    queryFn: () => resumesApi.list(query),
    placeholderData: (prev) => prev,
  });

  const del = useMutation({
    mutationFn: resumesApi.remove,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: keys.resumes.all() });
      const snapshot = queryClient.getQueryData<Types.Page<Types.ResumeListItem>>(
        keys.resumes.list(query),
      );
      queryClient.setQueryData<Types.Page<Types.ResumeListItem>>(
        keys.resumes.list(query),
        (prev) =>
          prev ? { items: prev.items.filter((r) => r.id !== id), total: prev.total - 1 } : prev,
      );
      return { snapshot };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(keys.resumes.list(query), ctx.snapshot);
      toast('danger', 'Could not delete the resume', toastMessage(normalizeApiError(err)));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.resumes.all() });
      void queryClient.invalidateQueries({ queryKey: keys.resumes.stats() });
    },
  });

  const onSort = (key: string) =>
    setSort((s) => ({
      sortBy: key,
      order: s.sortBy === key && s.order === 'desc' ? 'asc' : 'desc',
    }));

  const rows = resumes.data?.items ?? [];
  const total = resumes.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
          <p className="text-sm text-muted">Your resumes and what the AI thinks of them.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/resumes/upload">
            <Button variant="ghost">Upload resume</Button>
          </Link>
          <Link to="/resumes/new">
            <Button>Create resume</Button>
          </Link>
        </div>
      </div>

      <StatsCards />

      {resumes.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No resumes yet"
          description="Upload an existing resume or build one from scratch - then run your first analysis."
          action={
            <div className="flex gap-2">
              <Link to="/resumes/upload">
                <Button variant="ghost" size="sm">
                  Upload
                </Button>
              </Link>
              <Link to="/resumes/new">
                <Button size="sm">Create resume</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <Table<Types.ResumeListItem>
            columns={[
              {
                key: 'name',
                header: 'Name',
                sortable: true,
                render: (r) => (
                  <Link
                    to={`/resumes/${r.id}/edit`}
                    className="font-semibold text-ink hover:text-accent-ink"
                  >
                    {r.name}
                  </Link>
                ),
              },
              {
                key: 'createdAt',
                header: 'Uploaded',
                sortable: true,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'lastAnalyzedAt',
                header: 'Last analysis',
                sortable: true,
                render: (r) => fmtDate(r.lastAnalyzedAt),
              },
              {
                key: 'analysisStatus',
                header: 'Status',
                sortable: true,
                render: (r) => (
                  <Badge tone={statusTone(r.analysisStatus)}>
                    {STATUS_LABEL[r.analysisStatus]}
                  </Badge>
                ),
              },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                className: 'text-right',
                render: (r) => (
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => navigate(`/analyses/new?resumeId=${r.id}`)}
                    >
                      Analyze
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/resumes/${r.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => {
                        void (async () => {
                          if (
                            await confirm({
                              title: `Delete "${r.name}"?`,
                              body: 'The resume and its analyses will be removed from your dashboard.',
                              confirmLabel: 'Delete',
                              tone: 'danger',
                            })
                          ) {
                            del.mutate(r.id);
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
            rows={rows}
            rowKey={(r) => r.id}
            sort={sort}
            onSort={onSort}
          />
          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-end gap-2 text-sm">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-muted">
                Page {page} of {pages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
