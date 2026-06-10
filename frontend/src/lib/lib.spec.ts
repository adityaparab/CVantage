import { afterEach, describe, expect, it, vi } from 'vitest';

import { cn } from './cn';
import {
  applyTheme,
  currentTheme,
  getStoredTheme,
  initTheme,
  systemTheme,
  toggleTheme,
} from './theme';

describe('cn', () => {
  it('joins truthy classes only', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });
});

describe('theme manager (issue #59 / 7.2)', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('applies + persists + toggles', () => {
    applyTheme('dark');
    expect(currentTheme()).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(toggleTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('initTheme honors stored choice over system preference', () => {
    localStorage.setItem('cvantage.theme', 'dark');
    initTheme();
    expect(currentTheme()).toBe('dark');
  });

  it('initTheme falls back to system preference on first visit', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as MediaQueryList);
    expect(systemTheme()).toBe('dark');
    initTheme();
    expect(currentTheme()).toBe('dark');
    expect(getStoredTheme()).toBeNull(); // first visit is not persisted
    vi.unstubAllGlobals();
  });
});
