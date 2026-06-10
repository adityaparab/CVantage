import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Field, FormErrorSummary } from './fields';
import { applyServerFieldErrors, toFormPath } from './server-errors';
import { useZodForm } from './useZodForm';

import { Input } from '@/components/ui';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/, 'Bad date'),
});

function Harness({ onValid = () => undefined }: { onValid?: () => void }) {
  const form = useZodForm(schema, { defaultValues: { name: '', startDate: '' } });
  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)} noValidate>
        <FormErrorSummary />
        <Field name="name" label="Name" required>
          {(ids) => <Input {...ids} {...form.register('name')} />}
        </Field>
        <Field name="startDate" label="Start date">
          {(ids) => <Input {...ids} {...form.register('startDate')} />}
        </Field>
        <button type="submit">Submit</button>
      </form>
    </FormProvider>
  );
}

describe('forms infrastructure (issue #62 / 7.5)', () => {
  it('invalid submit focuses the first errored field and announces errors', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const name = screen.getByLabelText(/Name/);
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Name is required');
    expect(screen.getByText(/fields need attention|field needs attention/)).toBeInTheDocument();
  });

  it('server 422 paths land on the exact field (bracket -> dot)', async () => {
    expect(toFormPath('work[0].highlights[2]')).toBe('work.0.highlights.2');
    function ServerErrHarness() {
      const form = useZodForm(schema, { defaultValues: { name: 'x', startDate: '2024' } });
      return (
        <FormProvider {...form}>
          <Field name="startDate" label="Start date">
            {(ids) => <Input {...ids} {...form.register('startDate')} />}
          </Field>
          <button
            type="button"
            onClick={() =>
              applyServerFieldErrors(form, [
                { path: 'startDate', message: 'Server says: bad date' },
              ])
            }
          >
            Apply
          </button>
        </FormProvider>
      );
    }
    const user = userEvent.setup();
    render(<ServerErrHarness />);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Server says: bad date');
    expect(screen.getByLabelText(/Start date/)).toHaveFocus();
  });

  it('shared date regex accepted by the schema matches the server formats', async () => {
    const user = userEvent.setup();
    let submitted = false;
    render(
      <Harness
        onValid={() => {
          submitted = true;
        }}
      />,
    );
    await user.type(screen.getByLabelText(/Name/), 'Ada');
    await user.type(screen.getByLabelText(/Start date/), '2024-03');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submitted).toBe(true);
  });
});
