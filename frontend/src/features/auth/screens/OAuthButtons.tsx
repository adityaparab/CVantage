import { useQuery } from '@tanstack/react-query';

import { http } from '@/api/http';
import { Button } from '@/components/ui';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Continue with Google',
  linkedin: 'Continue with LinkedIn',
};

/** OAuth buttons appear ONLY for providers the backend enables (D4). */
export function OAuthButtons() {
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => http.get<Record<string, boolean>>('/auth/providers').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const enabled = Object.entries(providers.data ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name);
  if (enabled.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-2">
      {enabled.map((name) => (
        <Button
          key={name}
          variant="ghost"
          className="w-full"
          onClick={() => {
            window.location.href = `/api/v1/auth/oauth/${name}`;
          }}
        >
          {PROVIDER_LABELS[name] ?? `Continue with ${name}`}
        </Button>
      ))}
      <div className="my-1 flex items-center gap-3 text-[0.72rem] text-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
