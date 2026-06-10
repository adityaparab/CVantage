import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './Spinner';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 border-transparent',
  ghost: 'bg-card border-line-2 text-ink hover:bg-canvas-3',
  danger: 'bg-danger text-white hover:brightness-110 border-transparent',
  soft: 'bg-accent-soft text-accent-ink hover:brightness-105 border-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[0.82rem] rounded-lg',
  md: 'px-[18px] py-2.5 text-[0.9rem] rounded-[10px]',
  lg: 'px-[26px] py-3.5 text-base rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 border font-semibold transition-[filter,transform] active:scale-[0.99] disabled:opacity-55 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}
