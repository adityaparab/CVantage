import { useId } from 'react';
import type { ReactNode } from 'react';
import { get, useFormContext } from 'react-hook-form';

import { cn } from '@/lib/cn';

/**
 * Accessible field shell (issue #62 / 7.5): label, optional description,
 * error message wired through aria-describedby/aria-invalid, required marker.
 * Children receive the computed ids via render-prop.
 */
export function Field({
  name,
  label,
  description,
  required,
  className,
  children,
}: {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
    'aria-required': true | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const {
    formState: { errors },
  } = useFormContext();
  const error = get(errors, name) as { message?: string } | undefined;
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {description ? (
        <p id={descId} className="text-[0.78rem] text-muted">
          {description}
        </p>
      ) : null}
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [descId, errId].filter(Boolean).join(' ') || undefined,
        'aria-required': required ? true : undefined,
      })}
      {error?.message ? (
        <p id={errId} role="alert" className="text-[0.78rem] font-medium text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

/** Submit-time error summary, announced to screen readers (aria-live). */
export function FormErrorSummary() {
  const {
    formState: { errors, isSubmitted },
  } = useFormContext();
  const count = Object.keys(errors).length;
  return (
    <div aria-live="assertive" className="contents">
      {isSubmitted && count > 0 ? (
        <div className="rounded-card border border-danger/40 bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {count === 1 ? 'One field needs attention.' : `${count} fields need attention.`}
        </div>
      ) : null}
    </div>
  );
}
