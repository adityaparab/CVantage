import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { adminApi } from '@/api/endpoints/admin';
import { keys } from '@/api/keys';
import { Button, Skeleton } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const CARDS = [
  { key: 'users', label: 'Registered users', to: '/admin/users', icon: '👥' },
  { key: 'resumes', label: 'Resumes (created + uploaded)', to: '/admin/users', icon: '📄' },
  { key: 'analyses', label: 'Analyses run', to: '/admin/users', icon: '🧠' },
] as const;

/** Admin dashboard (issue #78 / 9.1). */
export default function AdminDashboardScreen() {
  usePageTitle('Admin · Dashboard');
  const stats = useQuery({ queryKey: keys.admin.stats(), queryFn: adminApi.stats });

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-ink">Platform overview</h1>
      {stats.isError ? (
        <div className="mt-5 rounded-card border border-danger/40 bg-card p-5 shadow-card">
          <p className="text-sm font-semibold text-danger">Could not load platform stats.</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => void stats.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {CARDS.map((card) => (
              <div
                key={card.key}
                className="rounded-card border border-line bg-card p-5 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[0.78rem] font-semibold tracking-wide text-muted uppercase">
                    {card.label}
                  </p>
                  <span aria-hidden="true">{card.icon}</span>
                </div>
                {stats.isPending ? (
                  <Skeleton className="mt-2 h-9 w-20" />
                ) : (
                  <p className="mt-1 text-3xl font-extrabold text-ink">
                    {stats.data?.[card.key].toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
          {stats.data ? (
            <p className="mt-2 text-[0.74rem] text-muted">
              As of {new Date(stats.data.generatedAt).toLocaleTimeString()} (cached up to 60s)
            </p>
          ) : null}
        </>
      )}
      <div className="mt-8 flex gap-2">
        <Link to="/admin/users">
          <Button variant="soft">Manage users</Button>
        </Link>
        <Link to="/admin/settings">
          <Button variant="ghost">AI model settings</Button>
        </Link>
      </div>
    </div>
  );
}
