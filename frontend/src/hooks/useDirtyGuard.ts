import { useEffect } from 'react';
import { useBlocker } from 'react-router';

import { useConfirm } from '@/components/ui';

/**
 * Dirty-form navigation guard (issue #62 / 7.5): in-app navigation asks via
 * the confirm dialog; hard reloads/tab closes get the native beforeunload.
 * Clean forms never prompt.
 */
export function useDirtyGuard(isDirty: boolean): void {
  const confirm = useConfirm();
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void (async () => {
      const leave = await confirm({
        title: 'Discard unsaved changes?',
        body: 'You have edits that are not saved yet. Leaving now will lose them.',
        confirmLabel: 'Discard changes',
        tone: 'danger',
      });
      if (leave) blocker.proceed();
      else blocker.reset();
    })();
  }, [blocker, confirm]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
}
