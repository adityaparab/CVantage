import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas-3 text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-bg text-success',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.74rem] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Domain helper: maps API statuses to tones consistently everywhere. */
export function statusTone(status: string): BadgeTone {
  if (['completed', 'active'].includes(status)) return 'success';
  if (['in_progress', 'processing', 'pending'].includes(status)) return 'info';
  if (['failed'].includes(status)) return 'danger';
  if (['cancelled', 'deactivated', 'disabled', 'unanalyzed'].includes(status)) return 'neutral';
  return 'neutral';
}
