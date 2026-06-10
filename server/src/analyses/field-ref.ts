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

export type ApplyOutcome = 'set' | 'appended';

/**
 * Apply a suggestion's proposedValue at fieldRef on a live jsonResume
 * (issue #43 / 4.6). Semantics:
 *  - ref resolves to an array        -> append the value
 *  - ref resolves to a scalar/leaf   -> replace it
 *  - leaf missing but parent exists  -> create the leaf
 *  - parent missing                  -> not auto-applicable (throws)
 * Returns what happened so callers can report it.
 */
export function applyAtFieldRef(
  target: Record<string, unknown>,
  ref: string,
  value: string,
): ApplyOutcome {
  if (!/^[A-Za-z0-9_.[\]]+$/.test(ref)) throw new FieldRefApplyError('malformed fieldRef');
  const parts = ref
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((p) => p.length > 0);
  if (parts.length === 0) throw new FieldRefApplyError('empty fieldRef');

  let node: unknown = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] as string;
    const next = Array.isArray(node)
      ? (node as unknown[])[Number(part)]
      : (node as Record<string, unknown>)[part];
    if (next === null || next === undefined || typeof next !== 'object') {
      throw new FieldRefApplyError(
        `cannot apply automatically - "${parts.slice(0, i + 1).join('.')}" does not exist`,
      );
    }
    node = next;
  }
  const leaf = parts[parts.length - 1] as string;
  const current = Array.isArray(node)
    ? (node as unknown[])[Number(leaf)]
    : (node as Record<string, unknown>)[leaf];

  if (Array.isArray(current)) {
    current.push(value);
    return 'appended';
  }
  if (Array.isArray(node)) {
    const idx = Number(leaf);
    if (!Number.isInteger(idx) || idx < 0 || idx > (node as unknown[]).length) {
      throw new FieldRefApplyError(`array index out of range in "${ref}"`);
    }
    (node as unknown[])[idx] = value;
    return 'set';
  }
  if (typeof node !== 'object' || node === null) {
    throw new FieldRefApplyError(`cannot apply at "${ref}"`);
  }
  (node as Record<string, unknown>)[leaf] = value;
  return 'set';
}

export class FieldRefApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldRefApplyError';
  }
}
