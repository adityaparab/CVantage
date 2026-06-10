import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Badge, statusTone } from './Badge';
import { Button } from './Button';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { EmptyState } from './EmptyState';
import { Input, Checkbox, Select, Textarea } from './Input';
import { ProgressSteps } from './ProgressSteps';
import { Skeleton } from './Skeleton';
import { Table } from './Table';
import { ToastProvider, useToast } from './Toast';
import { Tooltip } from './Tooltip';

import { useArrayField } from '@/components/form/useArrayField';

describe('Badge + statusTone (issue #59)', () => {
  it('maps domain statuses to stable tones', () => {
    expect(statusTone('completed')).toBe('success');
    expect(statusTone('in_progress')).toBe('info');
    expect(statusTone('failed')).toBe('danger');
    expect(statusTone('cancelled')).toBe('neutral');
    render(<Badge tone="success">done</Badge>);
    expect(screen.getByText('done')).toBeInTheDocument();
  });
});

describe('Toast system (issue #59)', () => {
  function Fire() {
    const { toast } = useToast();
    return <Button onClick={() => toast('success', 'Saved!', 'All good.')}>fire</Button>;
  }
  it('shows in an aria-live region and dismisses', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    const status = screen.getByRole('status');
    expect(within(status).getByText('Saved!')).toBeInTheDocument();
    await user.click(within(status).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog (issue #59)', () => {
  function Ask({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <Button
        onClick={() => {
          void confirm({ title: 'Sure?', tone: 'danger' }).then(onResult);
        }}
      >
        ask
      </Button>
    );
  }
  it('resolves true on confirm, false on cancel', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(
      <ConfirmProvider>
        <Ask onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(results).toEqual([true, false]);
  });
});

describe('Table (issue #59)', () => {
  const rows = [
    { id: '1', name: 'Alpha' },
    { id: '2', name: 'Beta' },
  ];
  it('sortable header exposes aria-sort and fires onSort; empty state renders', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const { rerender } = render(
      <Table
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (r: (typeof rows)[number]) => r.name,
            sortable: true,
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ sortBy: 'name', order: 'asc' }}
        onSort={onSort}
      />,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(onSort).toHaveBeenCalledWith('name');
    rerender(
      <Table
        columns={[{ key: 'name', header: 'Name', render: (r: (typeof rows)[number]) => r.name }]}
        rows={[]}
        rowKey={(r: (typeof rows)[number]) => r.id}
        empty="No rows!"
      />,
    );
    expect(screen.getByText('No rows!')).toBeInTheDocument();
  });
});

describe('Drawer + Tooltip + bits (issue #59)', () => {
  it('drawer escape closes; tooltip appears on focus; bits render', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <Drawer open onClose={onClose} title="Panel">
          <p>panel body</p>
        </Drawer>
        <Tooltip label="Hint!">
          <Button>hover me</Button>
        </Tooltip>
        <Skeleton />
        <EmptyState title="Empty" />
        <ProgressSteps
          steps={[
            { key: 'a', label: 'One', status: 'completed' },
            { key: 'b', label: 'Two', status: 'failed' },
          ]}
        />
        <Input aria-label="i" />
        <Textarea aria-label="t" />
        <Select aria-label="s">
          <option>x</option>
        </Select>
        <Checkbox id="c1" label="check" />
      </>,
    );
    expect(screen.getByRole('dialog', { name: 'Panel' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).not.toBeVisible();
    fireEvent.focus(screen.getByRole('button', { name: 'hover me' }));
    expect(tip).toBeVisible();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByLabelText('check')).toBeInTheDocument();
  });
});

describe('useArrayField (issue #62)', () => {
  function ArrayHarness() {
    const form = useForm<{ items: Array<{ v: string }> }>({
      defaultValues: { items: [{ v: 'one' }] },
    });
    return (
      <FormProvider {...form}>
        <Rows />
      </FormProvider>
    );
  }
  function Rows() {
    const { containerRef, fields, add, removeAt, moveDown } = useArrayField<{
      items: Array<{ v: string }>;
    }>('items');
    return (
      <div ref={containerRef} tabIndex={-1}>
        {fields.map((f, i) => (
          <div key={f.id} data-array-row>
            <input aria-label={`row-${i}`} defaultValue={f.v} />
          </div>
        ))}
        <button type="button" onClick={() => add({ v: 'new' })}>
          add
        </button>
        <button type="button" onClick={() => removeAt(0)}>
          remove-first
        </button>
        <button type="button" onClick={() => moveDown(0)}>
          move-down
        </button>
      </div>
    );
  }
  it('add/remove/reorder keep rows consistent', async () => {
    const user = userEvent.setup();
    render(<ArrayHarness />);
    await user.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'move-down' }));
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('new');
    await user.click(screen.getByRole('button', { name: 'remove-first' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('one');
  });
});
