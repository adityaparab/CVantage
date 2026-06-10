import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { FieldValues, UseFormProps, UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * The one way to build a form (issue #62 / 7.5): validated by the SAME zod
 * schemas the server uses (@cvantage/shared), so client and server can never
 * disagree about what is valid. Focuses the first errored field on submit.
 */
export function useZodForm<T extends FieldValues>(
  schema: ZodType<T>,
  options?: Omit<UseFormProps<T>, 'resolver'>,
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema as never) as never,
    mode: 'onTouched',
    shouldFocusError: true,
    ...options,
  });
}
