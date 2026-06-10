import { Link } from 'react-router';

import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { usePageTitle } from '@/hooks/usePageTitle';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI resume parsing',
    body: 'Drop in a PDF or Word file - CVantage reads it into a clean, structured resume you can edit anywhere.',
  },
  {
    icon: '🎯',
    title: 'Job-description matching',
    body: 'Paste any JD and get an overall match score, an ATS score, and the exact skills you are missing.',
  },
  {
    icon: '✍️',
    title: 'One-click suggestions',
    body: 'Concrete, targeted improvements - apply them to your resume with a single click.',
  },
  {
    icon: '🎤',
    title: 'Interview preparation',
    body: 'Likely interview questions with strong suggested answers, grounded in your actual experience.',
  },
];

const STEPS = [
  { n: '1', title: 'Add your resume', body: 'Upload a file or build one in the editor.' },
  { n: '2', title: 'Paste the job description', body: 'Any role, any company - 30 seconds.' },
  {
    n: '3',
    title: 'Get your vantage point',
    body: 'Scores, gaps, suggestions and interview prep.',
  },
];

/** Landing page (issue #65 / 8.1). CVantage = "CV + vantage point". */
export default function LandingPage() {
  usePageTitle('');
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const primaryTo = authed ? '/dashboard' : '/register';

  return (
    <>
      {/* hero - no images, gradient text only: zero CLS by construction */}
      <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 text-center sm:pt-28">
        <p className="font-mono text-[0.72rem] font-semibold tracking-[0.14em] text-accent-ink uppercase">
          cv + vantage point
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-6xl">
          See your resume from the <span className="text-gradient">hiring side</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
          CVantage analyzes your resume against any job description with AI - match scores, skill
          gaps, one-click improvements and interview prep, in under a minute.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={primaryTo}>
            <Button size="lg">{authed ? 'Go to dashboard' : 'Analyze my resume - free'}</Button>
          </Link>
          {!authed ? (
            <Link to="/login">
              <Button size="lg" variant="ghost">
                Sign in
              </Button>
            </Link>
          ) : null}
        </div>
        <p className="mt-4 text-[0.78rem] text-muted">No credit card. Your resume stays yours.</p>
      </section>

      {/* features */}
      <section
        aria-labelledby="features-heading"
        className="border-t border-line bg-canvas-2 py-16"
      >
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="features-heading" className="text-center text-2xl font-extrabold text-ink">
            Everything between you and the interview
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-card border border-line bg-card p-5 shadow-card"
              >
                <div aria-hidden="true" className="text-2xl">
                  {f.icon}
                </div>
                <h3 className="mt-3 text-base font-bold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section aria-labelledby="how-heading" className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="how-heading" className="text-center text-2xl font-extrabold text-ink">
            How it works
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="text-center">
                <span className="bg-gradient-brand mx-auto grid size-10 place-items-center rounded-full text-base font-extrabold text-white">
                  {s.n}
                </span>
                <h3 className="mt-3 font-bold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 text-center">
            <Link to={primaryTo}>
              <Button size="lg">{authed ? 'Open CVantage' : 'Get started'}</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-[0.8rem] text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} CVantage - AI-powered resume analysis.</p>
          <p className="font-mono">cv + vantage point</p>
        </div>
      </footer>
    </>
  );
}
