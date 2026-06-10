import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button, EmptyState } from '@/components/ui';
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

export function LandingPage() {
  usePageTitle('');
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="font-mono text-[0.72rem] font-semibold tracking-[0.14em] text-accent-ink uppercase">
        ai resume analysis
      </p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        Land the interview with a <span className="text-gradient">sharper resume</span>
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-muted">
        Upload or build your resume, paste a job description, and get match scores, concrete
        suggestions and interview prep - in under a minute.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/register">
          <Button size="lg">Get started free</Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="ghost">
            Sign in
          </Button>
        </Link>
      </div>
    </main>
  );
}

export function LoginPage() {
  return (
    <Placeholder title="Sign in" note="The full auth screens land with Phase 8 (#65)." icon="🔐" />
  );
}
export function RegisterPage() {
  return (
    <Placeholder
      title="Create account"
      note="The full auth screens land with Phase 8 (#65)."
      icon="✨"
    />
  );
}
export function DashboardPage() {
  return (
    <Placeholder title="Dashboard" note="Resume table + stats land with Phase 8 (#66)." icon="📊" />
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
