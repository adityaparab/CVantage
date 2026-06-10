import { useRef } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import type { ArrayPath, FieldArray, FieldValues } from 'react-hook-form';

/**
 * Array sections (work/education/skills/...; issue #62 / 7.5):
 * add/remove/reorder with stable RHF keys plus focus management - newly
 * added rows focus their first input; removals return focus to the section.
 */
export function useArrayField<T extends FieldValues>(name: ArrayPath<T>) {
  const { control } = useFormContext<T>();
  const { fields, append, remove, move } = useFieldArray<T>({ control, name });
  const containerRef = useRef<HTMLDivElement>(null);

  const focusRow = (index: number) => {
    requestAnimationFrame(() => {
      const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-array-row]');
      rows?.[index]
        ?.querySelector<HTMLElement>('input, textarea, select, [tabindex]:not([tabindex="-1"])')
        ?.focus();
    });
  };

  return {
    containerRef,
    fields,
    add: (value: FieldArray<T, ArrayPath<T>>) => {
      append(value);
      focusRow(fields.length);
    },
    removeAt: (index: number) => {
      remove(index);
      requestAnimationFrame(() => containerRef.current?.focus());
    },
    moveUp: (index: number) => {
      if (index > 0) {
        move(index, index - 1);
        focusRow(index - 1);
      }
    },
    moveDown: (index: number) => {
      if (index < fields.length - 1) {
        move(index, index + 1);
        focusRow(index + 1);
      }
    },
  };
}
