import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button, DatePartInput, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

export type EditableKind = 'text' | 'textarea' | 'date' | 'lines';

/**
 * In-place editing affordance (issue #70 / 8.6): hover/focus shows a pencil;
 * Enter/click swaps to the right control with inline Save/Cancel; Escape
 * cancels. Values render as-is; 'lines' edits string[] as one-per-line.
 */
export function Editable({
  label,
  value,
  kind = 'text',
  onSave,
  display,
  className,
  busy = false,
}: {
  label: string;
  value: string | string[];
  kind?: EditableKind;
  onSave: (next: string | string[]) => void;
  display?: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const open = () => {
    setDraft(Array.isArray(value) ? value.join('\n') : value);
    setEditing(true);
  };
  const commit = () => {
    const next =
      kind === 'lines'
        ? draft
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : draft.trim();
    onSave(next);
    setEditing(false);
  };
  const cancel = () => setEditing(false);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    }
    if (e.key === 'Enter' && kind !== 'textarea' && kind !== 'lines') {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    return (
      <span className={cn('flex w-full flex-col gap-2', className)}>
        {kind === 'textarea' || kind === 'lines' ? (
          <Textarea
            // eslint-disable-next-line jsx-a11y/no-autofocus -- user explicitly entered edit mode; moving focus IS the accessible behavior
            autoFocus
            aria-label={`Edit ${label}`}
            value={draft}
            rows={kind === 'lines' ? 4 : 3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
        ) : kind === 'date' ? (
          <DatePartInput
            // eslint-disable-next-line jsx-a11y/no-autofocus -- see above
            autoFocus
            aria-label={`Edit ${label}`}
            value={draft}
            onChange={setDraft}
            onKeyDown={onKeyDown}
          />
        ) : (
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- see above
            autoFocus
            aria-label={`Edit ${label}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
        <span className="flex gap-2">
          <Button size="sm" onClick={commit} loading={busy}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </span>
      </span>
    );
  }

  const isEmpty = Array.isArray(value) ? value.length === 0 : value === '';
  return (
    <span className={cn('group/edit inline-flex max-w-full items-start gap-1.5', className)}>
      <span className={cn('min-w-0 break-words', isEmpty && 'text-muted/60 italic')}>
        {display ??
          (isEmpty
            ? `Add ${label.toLowerCase()}`
            : Array.isArray(value)
              ? value.join(' · ')
              : value)}
      </span>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity group-hover/edit:opacity-100 focus:opacity-100 hover:text-accent-ink"
      >
        ✎
      </button>
    </span>
  );
}
