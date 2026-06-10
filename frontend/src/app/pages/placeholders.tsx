import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

function Placeholder({ title, note, icon }: { title: string; note: string; icon?: ReactNode }) {
  usePageTitle(title);
  return (
    <div className="py-4">
      <h1 className="mb-4 text-xl font-extrabold text-ink">{title}</h1>
      <EmptyState title={`${title} arrives with the next phase`} description={note} icon={icon} />
    </div>
  );
}

export function NewAnalysisPage() {
  return (
    <Placeholder title="New analysis" note="Analysis creation lands with #72 (8.8)." icon="🧪" />
  );
}
export function AnalysesPage() {
  return (
    <Placeholder
      title="Analyses"
      note="Analysis list + detail land with Phase 8 (#71+)."
      icon="🧠"
    />
  );
}
export function AdminDashboardPage() {
  return (
    <Placeholder title="Admin dashboard" note="Admin stats land with Phase 9 (#78)." icon="🛠️" />
  );
}
export function AdminUsersPage() {
  return (
    <Placeholder
      title="Users"
      note="Admin user management UI lands with Phase 9 (#79)."
      icon="👥"
    />
  );
}
export function AdminModelsPage() {
  return (
    <Placeholder title="AI models" note="Model settings UI lands with Phase 9 (#81)." icon="🤖" />
  );
}
