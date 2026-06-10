import { lazy, Suspense } from 'react';

import { env } from '@/lib/env';

const Showcase = lazy(() => import('@/features/showcase/Showcase'));

/** Root - replaced by the real router in #60 (7.3). In dev, /showcase works. */
export default function App() {
  if (env.dev && window.location.pathname.startsWith('/showcase')) {
    return (
      <Suspense fallback={null}>
        <Showcase />
      </Suspense>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="bg-gradient-brand mx-auto mb-4 grid size-12 place-items-center rounded-xl text-lg font-extrabold text-white">
          CV
        </div>
        <h1 className="text-2xl font-extrabold text-ink">CVantage</h1>
        <p className="mt-1 text-sm text-muted">Routing and screens land with #60-#63.</p>
      </div>
    </main>
  );
}
