/** Theme manager (issue #59 / 7.2): class strategy on <html data-theme>,
 *  system-preference default, persisted choice. The matching pre-hydration
 *  snippet in index.html prevents FOUC. */
export type Theme = 'light' | 'dark';

const KEY = 'cvantage.theme';

export function getStoredTheme(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme | undefined) ?? 'light';
}

export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme(): void {
  applyTheme(getStoredTheme() ?? systemTheme(), false);
}
