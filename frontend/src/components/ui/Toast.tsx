import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastApi {
  toast: (tone: ToastTone, message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: ToastTone, message: string, detail?: string) => {
      counter.current += 1;
      const id = counter.current;
      setItems((list) => [...list, { id, tone, message, detail }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'rounded-card border bg-card p-3.5 shadow-pop',
                t.tone === 'success' && 'border-success/40',
                t.tone === 'danger' && 'border-danger/40',
                t.tone === 'info' && 'border-line-2',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{t.message}</p>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                  className="text-muted hover:text-ink"
                >
                  ✕
                </button>
              </div>
              {t.detail ? <p className="mt-0.5 text-[0.78rem] text-muted">{t.detail}</p> : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
