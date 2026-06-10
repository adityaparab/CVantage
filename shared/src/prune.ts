/**
 * Placeholder hygiene (issue #31 / 3.1): recursively strips empty strings,
 * whitespace-only values, empty arrays and empty objects. Mirrors the
 * server's mongoose pre-validate hook; the frontend applies it before
 * submitting so placeholders are NEVER sent, let alone stored.
 */
export function pruneEmpty(value: unknown): unknown {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length ? t : undefined;
  }
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = pruneEmpty(v);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}
