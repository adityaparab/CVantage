import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { keys } from '@/api/keys';

/**
 * Live updates (issue #67 / 8.3): one EventSource on the bell stream; ANY
 * event (analysis progress, parse completion, bell change) invalidates the
 * affected queries so badges/stats flip without refresh. Cookie-authed,
 * auto-reconnect is native EventSource behavior; polling stays the fallback
 * because the queries refetch on focus anyway.
 */
export function useLiveInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource('/api/v1/notifications/events');
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: keys.resumes.all() });
      void queryClient.invalidateQueries({ queryKey: keys.analyses.all() });
      void queryClient.invalidateQueries({ queryKey: keys.notifications.all() });
    };
    source.addEventListener('bell', invalidate);
    source.addEventListener('snapshot', () => undefined);
    return () => source.close();
  }, [queryClient]);
}
