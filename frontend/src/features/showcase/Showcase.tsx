import { useState } from 'react';

import {
  Badge,
  Button,
  Checkbox,
  ConfirmProvider,
  DatePartInput,
  Drawer,
  EmptyState,
  Input,
  Modal,
  ProgressSteps,
  Select,
  Skeleton,
  Spinner,
  Table,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  statusTone,
  useConfirm,
  useToast,
} from '@/components/ui';
import { toggleTheme } from '@/lib/theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card p-5 shadow-card">
      <h2 className="mb-4 text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

function ShowcaseBody() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [date, setDate] = useState('2024-03');

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[0.72rem] font-semibold tracking-[0.14em] text-accent-ink uppercase">
            dev only
          </p>
          <h1 className="text-2xl font-extrabold text-ink">UI kit showcase</h1>
        </div>
        <Button variant="ghost" onClick={() => toggleTheme()}>
          Toggle theme
        </Button>
      </header>

      <Section title="Buttons">
        <Button>Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="soft">Soft</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Loading</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </Section>

      <Section title="Fields">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Input placeholder="Input" aria-label="Example input" />
          <Select aria-label="Example select" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            <option>Option A</option>
          </Select>
          <Textarea placeholder="Textarea" aria-label="Example textarea" />
          <div className="flex flex-col gap-2">
            <DatePartInput value={date} onChange={setDate} aria-label="Partial date" />
            <Checkbox id="cb" label="Checkbox with label" />
          </div>
        </div>
      </Section>

      <Section title="Status">
        {(['completed', 'in_progress', 'failed', 'cancelled'] as const).map((s) => (
          <Badge key={s} tone={statusTone(s)}>
            {s}
          </Badge>
        ))}
        <Spinner />
        <Skeleton className="h-6 w-40" />
        <Tooltip label="Helpful context">
          <Button variant="ghost" size="sm">
            Hover or focus me
          </Button>
        </Tooltip>
      </Section>

      <Section title="Progress">
        <ProgressSteps
          steps={[
            { key: 'a', label: 'Compare vs JD', status: 'completed' },
            { key: 'b', label: 'Suggestions', status: 'in_progress' },
            { key: 'c', label: 'Interview prep', status: 'pending' },
          ]}
        />
      </Section>

      <Section title="Overlays + feedback">
        <Button onClick={() => setModal(true)}>Open modal</Button>
        <Button variant="ghost" onClick={() => setDrawer(true)}>
          Open drawer
        </Button>
        <Button variant="soft" onClick={() => toast('success', 'Saved', 'Everything went well.')}>
          Toast success
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void (async () => {
              if (await confirm({ title: 'Delete this?', tone: 'danger', body: 'No undo.' })) {
                toast('danger', 'Deleted');
              }
            })();
          }}
        >
          Confirm dialog
        </Button>
      </Section>

      <Section title="Table + empty state">
        <div className="w-full">
          <Table
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (r: { name: string; status: string }) => r.name,
                sortable: true,
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
              },
            ]}
            rows={[
              { name: 'Backend Resume', status: 'completed' },
              { name: 'Design Resume', status: 'in_progress' },
            ]}
            rowKey={(r) => r.name}
            sort={{ sortBy: 'name', order: 'asc' }}
            onSort={() => toast('info', 'Sort toggled')}
          />
          <div className="mt-4">
            <EmptyState
              title="No resumes yet"
              description="Upload a resume or build one from scratch to get started."
              action={<Button size="sm">New resume</Button>}
              icon="📄"
            />
          </div>
        </div>
      </Section>

      <Section title="Tabs">
        <div className="w-full">
          <Tabs
            items={[
              { key: 'one', label: 'Overview', content: <p>First panel.</p> },
              { key: 'two', label: 'Details', content: <p>Second panel.</p> },
            ]}
          />
        </div>
      </Section>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Example modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModal(false)}>Done</Button>
          </>
        }
      >
        Focus is trapped; Escape closes; focus returns to the trigger.
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Example drawer">
        <p className="text-sm text-muted">Slides from the right; Escape closes.</p>
      </Drawer>
    </main>
  );
}

export default function Showcase() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <ShowcaseBody />
      </ConfirmProvider>
    </ToastProvider>
  );
}
