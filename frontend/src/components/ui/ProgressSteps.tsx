import { cn } from '@/lib/cn';

export interface StepView {
  key: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** The 3-step analysis progress strip (also reused for upload parsing). */
export function ProgressSteps({ steps }: { steps: StepView[] }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2" aria-label="Progress">
      {steps.map((step, i) => (
        <li key={step.key} className="flex flex-1 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold',
              step.status === 'completed' && 'bg-success text-white',
              step.status === 'in_progress' && 'bg-accent text-white animate-pulse',
              step.status === 'failed' && 'bg-danger text-white',
              step.status === 'pending' && 'bg-canvas-3 text-muted',
            )}
          >
            {step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : i + 1}
          </span>
          <span
            className={cn(
              'text-sm',
              step.status === 'pending' ? 'text-muted' : 'font-medium text-ink',
            )}
          >
            {step.label}
            <span className="sr-only">: {step.status.replace('_', ' ')}</span>
          </span>
          {i < steps.length - 1 ? (
            <span aria-hidden="true" className="mx-1 hidden h-px flex-1 bg-line-2 sm:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
