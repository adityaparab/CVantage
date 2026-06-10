import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { adminApi } from '@/api/endpoints/admin';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
  Table,
  useConfirm,
  useToast,
} from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

/** Admin users list (issue #79 / 9.2): search + the PROMPT.md columns. */
export default function AdminUsersScreen() {
  usePageTitle('Admin · Users');
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ sortBy: string; order: 'asc' | 'desc' }>({
    sortBy: 'createdAt',
    order: 'desc',
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query: Types.AdminUserListQuery = {
    page,
    limit: 10,
    search: search || undefined,
    sortBy: sort.sortBy as Types.AdminUserListQuery['sortBy'],
    order: sort.order,
  };
  const users = useQuery({
    queryKey: keys.admin.users(query),
    queryFn: () => adminApi.users(query),
    placeholderData: (prev) => prev,
  });

  const deactivate = useMutation({
    mutationFn: adminApi.deactivate,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: () => toast('danger', 'Could not deactivate that account'),
  });

  const rows = users.data?.items ?? [];
  const total = users.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  const onSort = (key: string) =>
    setSort((s) => ({
      sortBy: key,
      order: s.sortBy === key && s.order === 'desc' ? 'asc' : 'desc',
    }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Users</h1>
        <p className="text-sm text-muted">{total.toLocaleString()} registered</p>
      </div>
      <Input
        aria-label="Search users"
        placeholder="Search by name, email prefix or exact user id…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-md"
      />
      {users.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No users match"
          description="Try a different name, email or id."
        />
      ) : (
        <>
          <Table<Types.AdminUserRow>
            columns={[
              {
                key: 'fullName',
                header: 'Full name',
                sortable: true,
                render: (u) => (
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="font-semibold text-ink hover:text-accent-ink"
                  >
                    {u.fullName}
                  </Link>
                ),
              },
              { key: 'email', header: 'Email', sortable: true, render: (u) => u.email },
              {
                key: 'createdAt',
                header: 'Registered',
                sortable: true,
                render: (u) => fmt(u.createdAt),
              },
              {
                key: 'lastActiveAt',
                header: 'Last active',
                sortable: true,
                render: (u) => fmt(u.lastActiveAt),
              },
              {
                key: 'resumeCount',
                header: 'Resumes',
                sortable: true,
                render: (u) => u.resumeCount,
              },
              {
                key: 'analysisCount',
                header: 'Analyses',
                sortable: true,
                render: (u) => u.analysisCount,
              },
              {
                key: 'actions',
                header: <span className="sr-only">Actions</span>,
                className: 'text-right',
                render: (u) => (
                  <div className="flex items-center justify-end gap-1.5">
                    {u.status === 'deactivated' ? <Badge tone="neutral">deactivated</Badge> : null}
                    <Link to={`/admin/users/${u.id}`}>
                      <Button size="sm" variant="ghost">
                        Details
                      </Button>
                    </Link>
                    {u.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Deactivate ${u.fullName}`}
                        onClick={() => {
                          void (async () => {
                            if (
                              await confirm({
                                title: `Deactivate ${u.fullName}?`,
                                body: 'They are signed out everywhere immediately and cannot log in until reactivated.',
                                confirmLabel: 'Deactivate',
                                tone: 'danger',
                              })
                            ) {
                              deactivate.mutate(u.id);
                            }
                          })();
                        }}
                      >
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={rows}
            rowKey={(u) => u.id}
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
