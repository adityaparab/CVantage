import { useId, useState } from 'react';
import type { ReactNode } from 'react';

/** Hover/focus tooltip with aria-describedby (keyboard reachable). */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        hidden={!show}
        className="absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1 text-[0.74rem] font-medium whitespace-nowrap text-canvas shadow-card"
      >
        {label}
      </span>
    </span>
  );
}
