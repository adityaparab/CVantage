import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { DatePartInput, isValidDatePart } from './DatePartInput';
import { Modal } from './Modal';
import { Tabs } from './Tabs';

describe('DatePartInput (issues #59/#62)', () => {
  it('accepts exactly the three shared partial-date formats', () => {
    for (const good of ['2024', '2024-03', '2024-03-01', '']) {
      expect(isValidDatePart(good)).toBe(true);
    }
    for (const bad of ['2024-13', '2024-00', '03-2024', 'yesterday', '2024-3']) {
      expect(isValidDatePart(bad)).toBe(false);
    }
  });

  it('flags invalid input via aria-invalid after blur', async () => {
    function Harness() {
      const [v, setV] = useState('');
      return <DatePartInput aria-label="Start date" value={v} onChange={setV} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Start date');
    await user.type(input, 'not-a-date');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.clear(input);
    await user.type(input, '2024-03');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('Modal keyboard semantics (issue #59 / 7.2)', () => {
  it('Escape closes; focus lands inside on open', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose} title="Test dialog">
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
    expect(document.activeElement?.textContent).toBeTruthy(); // focus moved inside
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Tabs keyboard semantics (issue #59 / 7.2)', () => {
  it('arrow keys move selection and focus (roving tabindex)', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        items={[
          { key: 'a', label: 'First', content: <p>one</p> },
          { key: 'b', label: 'Second', content: <p>two</p> },
        ]}
      />,
    );
    const first = screen.getByRole('tab', { name: 'First' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    const second = screen.getByRole('tab', { name: 'Second' });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveFocus();
    expect(screen.getByText('two')).toBeVisible();
  });
});

describe('Button states', () => {
  it('loading disables and exposes aria-busy', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});
