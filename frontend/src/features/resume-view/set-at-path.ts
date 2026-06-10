/** Immutable deep-set for jsonResume paths like "work.0.highlights" (#70). */
export function setAtPath<T>(target: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const clone = structuredClone(target) as Record<string, unknown>;
  let node: Record<string, unknown> | unknown[] = clone;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const idx = Number(key);
    const container = Array.isArray(node) ? node : (node as Record<string, unknown>);
    const slot = Array.isArray(container) ? container[idx] : container[key];
    if (slot === undefined || slot === null || typeof slot !== 'object') {
      const next = /^\d+$/.test(parts[i + 1]!) ? [] : {};
      if (Array.isArray(container)) container[idx] = next;
      else container[key] = next;
    }
    node = (Array.isArray(container) ? container[idx] : container[key]) as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1]!;
  if (Array.isArray(node)) node[Number(leaf)] = value;
  else node[leaf] = value;
  return clone as T;
}
