import { JSON_RESUME_DATE } from '@cvantage/shared';
import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

import { Input } from './Input';

export interface DatePartInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Partial-date input (issue #59 / 7.2): accepts YYYY, YYYY-MM or YYYY-MM-DD -
 * the exact json-resume formats the server enforces (shared regex, so client
 * and server can never disagree).
 */
export const DatePartInput = forwardRef<HTMLInputElement, DatePartInputProps>(
  function DatePartInput({ value = '', onChange, ...rest }, ref) {
    const [touched, setTouched] = useState(false);
    const invalid = touched && value !== '' && !JSON_RESUME_DATE.test(value);
    return (
      <Input
        ref={ref}
        inputMode="numeric"
        placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
        value={value}
        aria-invalid={invalid || undefined}
        onBlur={() => setTouched(true)}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
    );
  },
);

export const isValidDatePart = (v: string): boolean => v === '' || JSON_RESUME_DATE.test(v);
