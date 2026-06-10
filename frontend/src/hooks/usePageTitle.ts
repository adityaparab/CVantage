import { useEffect } from 'react';

/** Per-route document titles (issue #60 / 7.3). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · CVantage` : 'CVantage';
    return () => {
      document.title = prev;
    };
  }, [title]);
}
