#!/usr/bin/env node
/**
 * CVantage — GitHub issue bootstrapper (gh CLI edition)
 * -----------------------------------------------------
 * Same behavior as create-issues.mjs, but every API call goes through the
 * GitHub CLI (`gh api …`), using gh's own authentication — no PAT wrangling.
 *
 * Prereqs (run once):
 *   gh auth login            # browser flow; or set GH_TOKEN env var
 *
 * Usage:
 *   node scripts/github/create-issues-gh.mjs [--dry-run] [--repo owner/name] [--file path]
 *
 * Properties (same as the fetch edition):
 *   - Idempotent: existing labels/milestones/issues (by exact title) are reused.
 *   - Two-pass: {{key}} tokens in bodies become real #numbers after creation.
 *   - Sub-issues: tasks attached to epics via the REST sub-issues API (gh api).
 *   - Paced writes + retry on rate limits; fails fast on permission errors.
 *   - --dry-run: parse + validate only; no gh calls.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

// ---------- CLI ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const DRY = flag('--dry-run');
const REPO = opt('--repo', 'adityaparab/CVantage');
const FILE = opt('--file', resolve(dirname(fileURLToPath(import.meta.url)), 'issues.md'));
const WRITE_DELAY_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = DRY ? null : mkdtempSync(join(tmpdir(), 'cvantage-issues-'));

// ---------- Parser (identical format to create-issues.mjs) ----------
function parse(text) {
  const labels = [];
  const milestones = [];
  const issues = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  const fail = (msg) => {
    throw new Error(`Parse error at line ${i + 1}: ${msg}`);
  };
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '@@LABELS') {
      i++;
      for (; lines[i].trim() !== '@@END'; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith('#')) continue;
        const [name, color, ...desc] = t.split('|').map((s) => s.trim());
        if (!name || !/^[0-9a-fA-F]{6}$/.test(color)) fail(`bad label line: ${t}`);
        labels.push({ name, color, description: desc.join(' | ') });
      }
    } else if (line === '@@MILESTONES') {
      i++;
      for (; lines[i].trim() !== '@@END'; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith('#')) continue;
        const [key, title, ...desc] = t.split('|').map((s) => s.trim());
        if (!key || !title) fail(`bad milestone line: ${t}`);
        milestones.push({ key, title, description: desc.join(' | ') });
      }
    } else if (line === '@@ISSUE') {
      i++;
      const meta = {};
      for (; lines[i].trim() !== '---'; i++) {
        const m = lines[i].match(/^(\w+):\s*(.+)$/);
        if (!m) fail(`bad meta line in issue header: "${lines[i]}"`);
        meta[m[1]] = m[2].trim();
      }
      i++;
      const body = [];
      for (; lines[i] === undefined || lines[i].trim() !== '@@END'; i++) {
        if (lines[i] === undefined) fail('unterminated @@ISSUE block');
        body.push(lines[i]);
      }
      for (const req of ['key', 'title', 'labels', 'milestone']) {
        if (!meta[req]) fail(`issue missing "${req}"`);
      }
      issues.push({
        key: meta.key,
        title: meta.title,
        labels: meta.labels.split(',').map((s) => s.trim()).filter(Boolean),
        milestoneKey: meta.milestone,
        parentKey: meta.parent ?? null,
        body: body.join('\n').trim(),
      });
    }
    i++;
  }
  return { labels, milestones, issues };
}

function validate({ labels, milestones, issues }) {
  const errors = [];
  const labelNames = new Set(labels.map((l) => l.name));
  const msKeys = new Set(milestones.map((m) => m.key));
  const keys = new Set();
  for (const is of issues) {
    if (keys.has(is.key)) errors.push(`duplicate key ${is.key}`);
    keys.add(is.key);
  }
  for (const is of issues) {
    if (!msKeys.has(is.milestoneKey)) errors.push(`${is.key}: unknown milestone ${is.milestoneKey}`);
    for (const l of is.labels) if (!labelNames.has(l)) errors.push(`${is.key}: unknown label "${l}"`);
    if (is.parentKey && !keys.has(is.parentKey)) errors.push(`${is.key}: unknown parent ${is.parentKey}`);
    if (is.parentKey && issues.findIndex((x) => x.key === is.parentKey) > issues.findIndex((x) => x.key === is.key))
      errors.push(`${is.key}: parent ${is.parentKey} must be defined before child`);
    for (const [, ref] of is.body.matchAll(/\{\{([^}]+)\}\}/g))
      if (!keys.has(ref)) errors.push(`${is.key}: body references unknown key {{${ref}}}`);
    if (!is.body) errors.push(`${is.key}: empty body`);
  }
  return { errors, epics: issues.filter((x) => !x.parentKey), tasks: issues.filter((x) => x.parentKey) };
}

// ---------- gh wrapper ----------
function ghRaw(ghArgs) {
  const res = spawnSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (res.error) {
    throw new Error(
      res.error.code === 'ENOENT'
        ? 'gh CLI not found on PATH. Install from https://cli.github.com and run `gh auth login`.'
        : `gh failed to start: ${res.error.message}`,
    );
  }
  return { code: res.status ?? 1, out: (res.stdout ?? '').trim(), err: (res.stderr ?? '').trim() };
}

async function gh(ghArgs, { allow404 = false } = {}, attempt = 1) {
  const r = ghRaw(ghArgs);
  if (r.code === 0) return r.out ? JSON.parse(r.out) : null;
  const msg = `${r.err}\n${r.out}`;
  if (allow404 && /HTTP 404|Not Found/i.test(msg)) return null;
  if (/Resource not accessible|HTTP 403.*(permission|forbidden)/is.test(msg) && !/rate limit/i.test(msg)) {
    throw new Error(
      `Permission error from GitHub — the authenticated identity cannot perform: gh ${ghArgs.join(' ')}\n` +
        `→ run \`gh auth status\`; you need repo access with Issues write. Details: ${msg.slice(0, 300)}`,
    );
  }
  if (/rate limit|secondary/i.test(msg) && attempt <= 5) {
    const wait = attempt * 20000;
    console.warn(`  rate-limited; waiting ${wait / 1000}s (attempt ${attempt}/5)…`);
    await sleep(wait);
    return gh(ghArgs, { allow404 }, attempt + 1);
  }
  throw new Error(`gh ${ghArgs.slice(0, 4).join(' ')} … failed (exit ${r.code}): ${msg.slice(0, 400)}`);
}

async function ghPaged(pathBase) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = pathBase.includes('?') ? '&' : '?';
    const batch = await gh(['api', `${pathBase}${sep}per_page=100&page=${page}`]);
    if (!batch || batch.length === 0) return out;
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

/** POST/PATCH with a body written to a temp file (avoids shell quoting entirely). */
async function ghWrite(method, path, fields, bodyText) {
  const a = ['api', '-X', method, path];
  for (const [k, v] of Object.entries(fields)) {
    a.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
  }
  if (bodyText !== undefined) {
    const f = join(TMP, `body-${Math.random().toString(36).slice(2)}.md`);
    writeFileSync(f, bodyText, 'utf8');
    a.push('-F', `body=@${f}`);
  }
  return gh(a);
}

// ---------- Main ----------
async function main() {
  const data = parse(readFileSync(FILE, 'utf8'));
  const { errors, epics, tasks } = validate(data);
  console.log(`Parsed: ${data.labels.length} labels, ${data.milestones.length} milestones, ` +
    `${data.issues.length} issues (${epics.length} epics + ${tasks.length} tasks)`);
  if (errors.length) {
    console.error(`VALIDATION FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Validation: OK');
  if (DRY) return console.log('--dry-run: no gh calls made.');

  // Preflight
  const auth = ghRaw(['auth', 'status']);
  if (auth.code !== 0) {
    console.error('gh is not authenticated. Run: gh auth login');
    process.exit(1);
  }
  const repo = await gh(['api', `repos/${REPO}`]);
  console.log(`\nTarget: ${repo.full_name} (issues ${repo.has_issues ? 'enabled' : 'DISABLED'})`);

  // 1) Labels
  const existingLabels = new Set((await ghPaged(`repos/${REPO}/labels`)).map((l) => l.name));
  for (const l of data.labels) {
    if (existingLabels.has(l.name)) continue;
    await ghWrite('POST', `repos/${REPO}/labels`, { name: l.name, color: l.color, description: l.description });
    console.log(`label    + ${l.name}`);
    await sleep(WRITE_DELAY_MS);
  }

  // 2) Milestones
  const existingMs = await ghPaged(`repos/${REPO}/milestones?state=all`);
  const msNumber = new Map();
  for (const m of data.milestones) {
    const found = existingMs.find((x) => x.title === m.title);
    if (found) { msNumber.set(m.key, found.number); continue; }
    const created = await ghWrite('POST', `repos/${REPO}/milestones`, { title: m.title, description: m.description });
    msNumber.set(m.key, created.number);
    console.log(`milestone+ ${m.title}`);
    await sleep(WRITE_DELAY_MS);
  }

  // 3) Issues (file order: epics precede children)
  const existing = (await ghPaged(`repos/${REPO}/issues?state=all`)).filter((x) => !x.pull_request);
  const byTitle = new Map(existing.map((x) => [x.title, x]));
  const created = new Map();
  for (const is of data.issues) {
    let issue = byTitle.get(is.title);
    if (!issue) {
      const fields = { title: is.title, milestone: msNumber.get(is.milestoneKey) };
      const a = ['api', '-X', 'POST', `repos/${REPO}/issues`, '-f', `title=${fields.title}`, '-F', `milestone=${fields.milestone}`];
      for (const l of is.labels) a.push('-f', `labels[]=${l}`);
      const f = join(TMP, `body-${is.key.replace(/\W/g, '_')}.md`);
      writeFileSync(f, is.body, 'utf8');
      a.push('-F', `body=@${f}`);
      issue = await gh(a);
      console.log(`issue    + #${String(issue.number).padStart(3)} ${is.title}`);
      await sleep(WRITE_DELAY_MS);
    } else {
      console.log(`issue    = #${String(issue.number).padStart(3)} ${is.title} (exists, reused)`);
    }
    created.set(is.key, { number: issue.number, id: issue.id });
  }

  // 4) Sub-issue links
  for (const epic of data.issues.filter((x) => !x.parentKey)) {
    const epicNum = created.get(epic.key).number;
    const linked = new Set(((await ghPaged(`repos/${REPO}/issues/${epicNum}/sub_issues`)) ?? []).map((s) => s.id));
    for (const t of data.issues.filter((x) => x.parentKey === epic.key)) {
      const child = created.get(t.key);
      if (linked.has(child.id)) continue;
      await gh(['api', '-X', 'POST', `repos/${REPO}/issues/${epicNum}/sub_issues`, '-F', `sub_issue_id=${child.id}`]);
      console.log(`link     + #${epicNum} ⊂ #${child.number}`);
      await sleep(WRITE_DELAY_MS);
    }
  }

  // 5) Token replacement pass ({{key}} → #number)
  for (const is of data.issues) {
    if (!/\{\{[^}]+\}\}/.test(is.body)) continue;
    const resolved = is.body.replace(/\{\{([^}]+)\}\}/g, (_, k) => `#${created.get(k).number}`);
    await ghWrite('PATCH', `repos/${REPO}/issues/${created.get(is.key).number}`, {}, resolved);
    console.log(`resolve  ~ #${created.get(is.key).number} (${is.key})`);
    await sleep(WRITE_DELAY_MS);
  }

  console.log('\nDone. Key → issue number map:');
  for (const [k, v] of created) console.log(`  ${k.padEnd(6)} → #${v.number}`);
  console.log(`\nBrowse: https://github.com/${REPO}/issues`);
}

main()
  .catch((e) => {
    console.error(`\nFATAL: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (TMP) rmSync(TMP, { recursive: true, force: true });
  });
