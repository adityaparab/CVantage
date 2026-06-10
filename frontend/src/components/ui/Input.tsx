import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const fieldBase =
  'w-full rounded-[10px] border border-line-2 bg-card px-3.5 py-2.5 text-[0.9rem] text-ink placeholder:text-muted/70 focus:border-accent disabled:opacity-55 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return (
    <textarea ref={ref} rows={rows} className={cn(fieldBase, 'resize-y', className)} {...rest} />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, 'pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(function Checkbox({ className, label, id, ...rest }, ref) {
  const checkbox = (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className={cn('size-4 accent-(--accent) rounded border-line-2', className)}
      {...rest}
    />
  );
  if (!label) return checkbox;
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
      {checkbox}
      {label}
    </label>
  );
});
