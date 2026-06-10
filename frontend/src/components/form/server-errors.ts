import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import type { FieldIssue } from '@/api/errors';

/** "work[0].startDate" (server) -> "work.0.startDate" (react-hook-form). */
export const toFormPath = (apiPath: string): string =>
  apiPath.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');

/**
 * Map a 422 envelope's field issues back onto the exact fields
 * (issue #62 / 7.5). Unknown paths fall back to a root error.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  issues: FieldIssue[] | undefined,
): void {
  if (!issues || issues.length === 0) return;
  let focused = false;
  for (const issue of issues) {
    const path = toFormPath(issue.path) as Path<T>;
    form.setError(path, { type: 'server', message: issue.message }, { shouldFocus: !focused });
    focused = true;
  }
}
