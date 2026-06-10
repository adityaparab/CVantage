import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  content: ReactNode;
}

/** Accessible tabs: roving tabindex, Arrow/Home/End keyboard semantics. */
export function Tabs({ items, initial }: { items: TabItem[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? items[0]?.key ?? '');
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + items.length) % items.length;
    setActive(items[next]!.key);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {items.map((item, i) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.key)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') move(i, 1);
                if (e.key === 'ArrowLeft') move(i, -1);
                if (e.key === 'Home') move(i, -i);
                if (e.key === 'End') move(i, items.length - 1 - i);
              }}
              className={cn(
                'rounded-t-lg px-4 py-2 text-sm font-medium',
                selected ? 'border-b-2 border-accent text-accent-ink' : 'text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${baseId}-panel-${item.key}`}
          aria-labelledby={`${baseId}-tab-${item.key}`}
          hidden={item.key !== active}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
