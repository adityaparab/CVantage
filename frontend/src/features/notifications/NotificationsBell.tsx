import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { notificationsApi } from '@/api/endpoints/notifications';
import { keys } from '@/api/keys';
import { Button, Spinner } from '@/components/ui';
import { useLiveInvalidation } from '@/hooks/useLiveInvalidation';
import { cn } from '@/lib/cn';

/** The nav-bar bell (issue #73 / 8.9): persists across navigation. */
export function NotificationsBell() {
  useLiveInvalidation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const bell = useQuery({
    queryKey: keys.notifications.list(),
    queryFn: notificationsApi.list,
    refetchInterval: 30_000, // safety net; SSE invalidation is the fast path
  });

  const clear = useMutation({
    mutationFn: notificationsApi.clear,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.notifications.all() }),
  });

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

  const items = bell.data?.items ?? [];
  const count = items.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Notifications (${count} active)` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-[10px] border border-line bg-card text-muted hover:text-ink"
      >
        🔔
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-danger text-[0.62rem] font-bold text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 z-50 mt-2 w-80 rounded-card border border-line bg-card p-2 shadow-pop"
        >
          {bell.isPending ? (
            <div className="grid place-items-center p-6">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">You are all caught up.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'rounded-lg border border-transparent p-2.5 hover:bg-canvas-2',
                    n.type === 'analysis_failed' && 'border-danger/30',
                  )}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/analyses/${n.analysisId}`);
                    }}
                  >
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-[0.78rem] text-muted">{n.body}</p> : null}
                  </button>
                  <div className="mt-1 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Clear notification: ${n.title}`}
                      onClick={() => clear.mutate(n.id)}
                    >
                      Clear
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
