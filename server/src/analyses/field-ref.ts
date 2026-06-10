/**
 * fieldRef validation (issue #42 / 4.5): suggestions point at real places in
 * the snapshot. Supports dot + bracket notation ("work[0].highlights").
 * LLM-invented paths are dropped (with a warning) rather than persisted.
 */
export function resolveFieldRef(snapshot: unknown, ref: string): boolean {
  if (!/^[A-Za-z0-9_.[\]]+$/.test(ref)) return false;
  const parts = ref
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  let node: unknown = snapshot;
  for (const part of parts) {
    if (node === null || node === undefined) return false;
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return false;
      node = node[idx];
      continue;
    }
    if (typeof node !== 'object') return false;
    if (!(part in (node as Record<string, unknown>))) {
      // allow refs onto declared-but-empty sections one level deep (additions)
      return ALLOWED_NEW_SECTIONS.has(parts[0] as string) && parts.indexOf(part) === 0;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

/** Suggestion targets that may not exist yet (e.g. "add a projects section"). */
const ALLOWED_NEW_SECTIONS = new Set([
  'basics',
  'work',
  'skills',
  'projects',
  'education',
  'certificates',
  'awards',
  'languages',
  'interests',
  'volunteer',
  'publications',
  'references',
]);
