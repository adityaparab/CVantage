#!/usr/bin/env node
/**
 * CVantage — GitHub issue bootstrapper
 * ------------------------------------
 * Creates labels, milestones, epics and task issues (linked as sub-issues)
 * on github.com/adityaparab/CVantage from `issues.md` (same directory).
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node create-issues.mjs [--dry-run] [--repo owner/name] [--file path]
 *   node create-issues.mjs --token-file ../../.secrets/github.pat
 *
 * Properties:
 *   - Idempotent: existing labels/milestones/issues (matched by exact title) are reused, never duplicated.
 *   - Two-pass: after creation, `{{key}}` tokens in bodies are replaced with real `#numbers`.
 *   - Sub-issues: tasks are attached to their epic via the REST sub-issues API.
 *   - Rate-limit aware: paced writes + retry on secondary-rate-limit responses.
 *   - `--dry-run`: parse + validate + print summary; zero network calls.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- CLI ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const DRY = flag('--dry-run');
const REPO = opt('--repo', 'adityaparab/CVantage');
const [OWNER, NAME] = REPO.split('/');
const FILE = opt('--file', resolve(dirname(fileURLToPath(import.meta.url)), 'issues.md'));
const TOKEN_FILE = opt('--token-file', null);
const TOKEN =
  process.env.GITHUB_TOKEN ??
  (TOKEN_FILE ? readFileSync(TOKEN_FILE, 'utf8').trim() : undefined);

const API = 'https://api.github.com';
const WRITE_DELAY_MS = 1300; // stay under secondary rate limits for content creation
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Parser ----------
/** Parses issues.md into { labels, milestones, issues }. */
function parse(text) {
  const labels = [];
  const milestones = []; // { key, title, description }
  const issues = []; // { key, type, title, labels[], milestoneKey, parentKey|null, body }
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
      i++; // skip ---
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

// ---------- Validation ----------
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
  const epics = issues.filter((x) => !x.parentKey);
  const tasks = issues.filter((x) => x.parentKey);
  return { errors, epics, tasks };
}

// ---------- GitHub client ----------
async function gh(method, path, body, attempt = 1) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cvantage-issue-bootstrapper',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403 && (await res.clone().text()).includes('Resource not accessible')) {
    throw new Error(
      `${method} ${path} → 403 permission error: the token lacks the required repo permission ` +
        `(needs Issues: Read/Write on ${OWNER}/${NAME}). Not a rate limit — fix the token, then re-run.`,
    );
  }
  if ((res.status === 403 || res.status === 429) && attempt <= 5) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
    const wait = retryAfter ? retryAfter * 1000 : attempt * 15000;
    console.warn(`  rate-limited (${res.status}); waiting ${wait / 1000}s (attempt ${attempt}/5)…`);
    await sleep(wait);
    return gh(method, path, body, attempt + 1);
  }
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 404 ? null : res.json();
}

async function ghAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const batch = await gh('GET', `${path}${sep}per_page=100&page=${page}`);
    if (!batch || batch.length === 0) return out;
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}

// ---------- Main ----------
async function main() {
  const source = readFileSync(FILE, 'utf8');
  const data = parse(source);
  const { errors, epics, tasks } = validate(data);

  console.log(`Parsed: ${data.labels.length} labels, ${data.milestones.length} milestones, ` +
    `${data.issues.length} issues (${epics.length} epics + ${tasks.length} tasks)`);
  for (const e of epics) {
    const kids = tasks.filter((t) => t.parentKey === e.key).length;
    console.log(`  ${e.key.padEnd(4)} ${e.title}  [${kids} tasks]`);
  }
  if (errors.length) {
    console.error(`\nVALIDATION FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Validation: OK');
  if (DRY) return console.log('\n--dry-run: no network calls made.');

  if (!TOKEN) {
    console.error('No token. Set GITHUB_TOKEN or pass --token-file <path>.');
    process.exit(1);
  }

  // Preflight: token + repo access
  const repo = await gh('GET', `/repos/${OWNER}/${NAME}`);
  if (!repo) throw new Error(`Repo ${REPO} not found or token lacks access`);
  console.log(`\nTarget: ${repo.full_name} (issues ${repo.has_issues ? 'enabled' : 'DISABLED'})`);

  // 1) Labels
  const existingLabels = new Set((await ghAll(`/repos/${OWNER}/${NAME}/labels`)).map((l) => l.name));
  for (const l of data.labels) {
    if (existingLabels.has(l.name)) continue;
    await gh('POST', `/repos/${OWNER}/${NAME}/labels`, l);
    console.log(`label    + ${l.name}`);
    await sleep(WRITE_DELAY_MS);
  }

  // 2) Milestones
  const existingMs = await ghAll(`/repos/${OWNER}/${NAME}/milestones?state=all`);
  const msNumber = new Map(); // key -> milestone number
  for (const m of data.milestones) {
    const found = existingMs.find((x) => x.title === m.title);
    if (found) { msNumber.set(m.key, found.number); continue; }
    const created = await gh('POST', `/repos/${OWNER}/${NAME}/milestones`, {
      title: m.title, description: m.description,
    });
    msNumber.set(m.key, created.number);
    console.log(`milestone+ ${m.title}`);
    await sleep(WRITE_DELAY_MS);
  }

  // 3) Issues (epics first — file order guarantees parents precede children)
  const existing = (await ghAll(`/repos/${OWNER}/${NAME}/issues?state=all`)).filter((x) => !x.pull_request);
  const byTitle = new Map(existing.map((x) => [x.title, x]));
  const created = new Map(); // key -> { number, id }
  for (const is of data.issues) {
    let issue = byTitle.get(is.title);
    if (!issue) {
      issue = await gh('POST', `/repos/${OWNER}/${NAME}/issues`, {
        title: is.title,
        body: is.body,
        labels: is.labels,
        milestone: msNumber.get(is.milestoneKey),
      });
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
    const linked = new Set(
      ((await ghAll(`/repos/${OWNER}/${NAME}/issues/${epicNum}/sub_issues`)) ?? []).map((s) => s.id),
    );
    for (const t of data.issues.filter((x) => x.parentKey === epic.key)) {
      const child = created.get(t.key);
      if (linked.has(child.id)) continue;
      await gh('POST', `/repos/${OWNER}/${NAME}/issues/${epicNum}/sub_issues`, { sub_issue_id: child.id });
      console.log(`link     + #${epicNum} ⊂ #${child.number}`);
      await sleep(WRITE_DELAY_MS);
    }
  }

  // 5) Token replacement pass ({{key}} → #number)
  for (const is of data.issues) {
    if (!/\{\{[^}]+\}\}/.test(is.body)) continue;
    const resolved = is.body.replace(/\{\{([^}]+)\}\}/g, (_, k) => `#${created.get(k).number}`);
    await gh('PATCH', `/repos/${OWNER}/${NAME}/issues/${created.get(is.key).number}`, { body: resolved });
    console.log(`resolve  ~ #${created.get(is.key).number} (${is.key})`);
    await sl