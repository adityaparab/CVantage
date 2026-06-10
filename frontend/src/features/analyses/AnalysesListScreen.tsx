import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { analysesApi } from '@/api/endpoints/analyses';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { Badge, Button, EmptyState, Skeleton, Table, statusTone } from '@/components/ui';
import { useLiveInvalidation } from '@/hooks/useLiveInvalidation';
import { usePageTitle } from '@/hooks/usePageTitle';

/** All analyses (part of the #76 consolidation). */
export default function AnalysesListScreen() {
  usePageTitle('Analyses');
  useLiveInvalidation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const query: Types.AnalysisListQuery = { page, limit: 10 };
  const analyses = useQuery({
    queryKey: keys.analyses.list(query),
    queryFn: () => analysesApi.list(query),
    placeholderData: (prev) => prev,
  });

  const rows = analyses.data?.items ?? [];
  const total = analyses.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));

  if (analyses.isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Analyses</h1>
          <p className="text-sm text-muted">Every run, newest first.</p>
        </div>
        <Link to="/dashboard">
          <Button variant="ghost">Pick a resume to analyze</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon="🧠"
          title="No analyses yet"
          description="Run your resume against a job description to see scores and suggestions."
          action={
            <Link to="/dashboard">
              <Button size="sm">Go to dashboard</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Table<Types.Analysis>
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (a) => (
                  <Link
                    to={`/analyses/${a.id}`}
                    className="font-semibold text-ink hover:text-accent-ink"
                  >
                    {a.name}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (a) => (
                  <Badge tone={statusTone(a.status)}>{a.status.replace('_', ' ')}</Badge>
                ),
              },
              {
                key: 'score',
                header: 'Match',
                render: (a) =>
                  a.result?.overallScore !== undefined ? `${a.result.overallScore}/100` : '—',
              },
              {
                key: 'createdAt',
                header: 'Started',
                render: (a) => new Date(a.createdAt).toLocaleString(),
              },
              {
                key: 'open',
                header: <span className="sr-only">Open</span>,
                className: 'text-right',
                render: (a) => (
                  <Button size="sm" variant="soft" onClick={() => navigate(`/analyses/${a.id}`)}>
                    Open
                  </Button>
                ),
              },
            ]}
            rows={rows}
            rowKey={(a) => a.id}
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
