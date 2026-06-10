import { Link } from 'react-router';

import { Button } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

function ErrorShell({ code, title, body }: { code: string; title: string; body: string }) {
  usePageTitle(title);
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="text-center">
        <p className="font-mono text-5xl font-extrabold text-gradient">{code}</p>
        <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="ghost">Back to safety</Button>
        </Link>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <ErrorShell
      code="404"
      title="Page not found"
      body="That link goes nowhere. Check the address or head back home."
    />
  );
}

export function ForbiddenPage() {
  return (
    <ErrorShell
      code="403"
      title="No access"
      body="Your account does not have permission to view this area."
    />
  );
}
