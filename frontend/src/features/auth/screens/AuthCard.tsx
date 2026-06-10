import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-card border border-line bg-card p-7 shadow-card">
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <p className="mt-4 text-center text-sm text-muted">{footer}</p> : null}
    </main>
  );
}

export function AuthSwitchLink({ to, label, cta }: { to: string; label: string; cta: string }) {
  return (
    <>
      {label}{' '}
      <Link to={to} className="font-semibold text-accent-ink hover:underline">
        {cta}
      </Link>
    </>
  );
}
