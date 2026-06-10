#!/usr/bin/env node
/**
 * Bundle budget gate (issue #86 / 10.3): the INITIAL JS payload (entry chunk
 * + css) must stay under budget gzipped. Lazy route chunks are reported but
 * only the critical path is gated. Red on regression - by design.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../frontend/dist/assets', import.meta.url).pathname;
const BUDGET_INITIAL_JS_GZ = 250 * 1024; // 250 KB
const BUDGET_CSS_GZ = 40 * 1024;

const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let files;
try {
  files = readdirSync(DIST).filter((f) => statSync(join(DIST, f)).isFile());
} catch {
  console.error('frontend/dist missing - run `yarn workspace @cvantage/frontend build` first');
  process.exit(2);
}

const entryJs = files.filter((f) => f.startsWith('index-') && f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
const lazy = files.filter((f) => f.endsWith('.js') && !f.startsWith('index-'));

const initialJsGz = entryJs.reduce((sum, f) => sum + gz(join(DIST, f)), 0);
const cssGz = css.reduce((sum, f) => sum + gz(join(DIST, f)), 0);

console.log('— bundle budget report —');
console.log(`initial JS (gz): ${kb(initialJsGz)} / ${kb(BUDGET_INITIAL_JS_GZ)}  [${entryJs.join(', ')}]`);
console.log(`css       (gz): ${kb(cssGz)} / ${kb(BUDGET_CSS_GZ)}  [${css.join(', ')}]`);
for (const f of lazy.sort()) console.log(`  lazy: ${f} ${kb(gz(join(DIST, f)))} gz`);

let failed = false;
if (initialJsGz > BUDGET_INITIAL_JS_GZ) {
  console.error(`FAIL: initial JS ${kb(initialJsGz)} exceeds the ${kb(BUDGET_INITIAL_JS_GZ)} budget`);
  failed = true;
}
if (cssGz > BUDGET_CSS_GZ) {
  console.error(`FAIL: css ${kb(cssGz)} exceeds the ${kb(BUDGET_CSS_GZ)} budget`);
  failed = true;
}
process.exit(failed ? 1 : 0);
