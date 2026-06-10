#!/usr/bin/env node
/**
 * Pre-commit related-tests runner.
 * Receives staged file paths from lint-staged and runs only the tests related
 * to them, per workspace:
 *   - server/**  → jest --findRelatedTests   (active once #19 / 1.10 lands)
 *   - frontend/** → vitest related --run     (active once #63 / 7.6 lands)
 * Until those harnesses exist (placeholder test scripts), this is a no-op so
 * commits stay fast and unblocked.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const staged = process.argv.slice(2);
if (staged.length === 0) process.exit(0);

const hasRealTests = (ws) => {
  try {
    const pkg = JSON.parse(readFileSync(`${ws}/package.json`, 'utf8'));
    return Boolean(pkg.scripts?.test) && !pkg.scripts.test.startsWith('echo ');
  } catch {
    return false;
  }
};

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd,
    shell: process.platform === 'win32',
    // langchain loaders dynamic-import ESM inside jest (#36)
    env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const rel = (prefix) =>
  staged.filter((f) => f.includes(`${prefix}/`)).map((f) => f.split(`${prefix}/`)[1]);

const serverFiles = rel('server');
if (serverFiles.length && hasRealTests('server')) {
  run(
    'yarn',
    ['--cwd', 'server', 'jest', '--findRelatedTests', '--passWithNoTests', ...serverFiles],
    '.',
  );
}

const frontendFiles = rel('frontend');
if (frontendFiles.length && hasRealTests('frontend')) {
  run('yarn', ['--cwd', 'frontend', 'vitest', 'related', '--run', ...frontendFiles], '.');
}

process.exit(0);
