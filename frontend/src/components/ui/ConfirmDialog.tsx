import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}

type Confirmer = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirmer | null>(null);

export function useConfirm(): Confirmer {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

/** Promise-based confirm: `if (await confirm({title: 'Delete?'})) ...` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(null);

  const confirm = useCallback<Confirmer>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    setOpts(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={opts !== null}
        onClose={() => settle(false)}
        title={opts?.title ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button
              variant={opts?.tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {opts?.body ?? 'Are you sure?'}
      </Modal>
    </ConfirmContext.Provider>
  );
}
