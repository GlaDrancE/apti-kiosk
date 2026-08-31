/** mulberry32 — small deterministic PRNG, plenty for shuffling a question list. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates with a seed, so the same (seed, salt) always yields the same
 * order. That lets a student reload mid-attempt and see the same paper without
 * persisting the permutation.
 */
export function seededShuffle<T>(items: T[], seed: number, salt = 0): T[] {
  const next = rng(seed + salt * 0x9e3779b9);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Stable numeric salt from a string id, so per-question option order differs. */
export function saltFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
