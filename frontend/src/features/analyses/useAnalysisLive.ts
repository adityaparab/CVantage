import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { analysesApi } from '@/api/endpoints/analyses';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { useToast } from '@/components/ui';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Live analysis state (issue #73 / 8.9): SSE first (snapshot+status events
 * write straight into the query cache), 2s polling as the fallback - both
 * stop at terminal. Fires exactly one completion/failure toast on the
 * transition.
 */
export function useAnalysisLive(id: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sseHealthy = useRef(false);
  const lastStatus = useRef<string | null>(null);

  const query = useQuery({
    queryKey: keys.analyses.detail(id),
    queryFn: () => analysesApi.get(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && TERMINAL.has(status)) return false;
      return sseHealthy.current ? false : 2000; // polling fallback only
    },
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(`/api/v1/analyses/${id}/events`);
    const apply = (e: MessageEvent) => {
      sseHealthy.current = true;
      try {
        const data = JSON.parse(e.data as string) as Types.Analysis;
        queryClient.setQueryData(keys.analyses.detail(id), data);
      } catch {
        /* malformed event - polling still covers us */
      }
    };
    source.addEventListener('snapshot', apply);
    source.addEventListener('status', apply);
    source.onerror = () => {
      sseHealthy.current = false; // drop -> polling fallback takes over
    };
    return () => {
      source.close();
      sseHealthy.current = false;
    };
  }, [id, queryClient]);

  const status = query.data?.status ?? null;
  useEffect(() => {
    if (!status) return;
    const prev = lastStatus.current;
    lastStatus.current = status;
    if (prev && prev !== status) {
      if (status === 'completed') {
        toast(
          'success',
          'Analysis complete',
          'Your scores, suggestions and interview prep are ready.',
        );
      }
      if (status === 'failed') {
        toast('danger', 'Analysis failed', 'You can retry it from the analysis page.');
      }
      void queryClient.invalidateQueries({ queryKey: keys.notifications.all() });
      void queryClient.invalidateQueries({ queryKey: keys.resumes.all() });
    }
  }, [status, toast, queryClient]);

  return query;
}
