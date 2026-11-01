// Integer-mixing hash (bit-identical to the previous engine's) and value noise. The
// only randomness chunk generation may use.

export function hash(x: number, y: number, s: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, sc: number, s: number): number {
  const gx = x / sc,
    gy = y / sc,
    x0 = Math.floor(gx),
    y0 = Math.floor(gy);
  const fx = gx - x0,
    fy = gy - y0,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (
    (hash(x0, y0, s) * (1 - u) + hash(x0 + 1, y0, s) * u) * (1 - v) +
    (hash(x0, y0 + 1, s) * (1 - u) + hash(x0 + 1, y0 + 1, s) * u) * v
  );
}

/** Two-octave value noise in [0, 1], tile coordinates (akl:33). */
export function noise(x: number, y: number, s: number): number {
  return vnoise(x, y, 9, s) * 0.6 + vnoise(x + 61, y + 61, 3.3, s + 7) * 0.4;
}

/** Sequential per-chunk RNG: hash(cx, cy, seed + 1000 + k++). */
export function chunkRng(cx: number, cy: number, seed: number): () => number {
  let k = 0;
  return () => hash(cx, cy, seed + 1000 + k++);
}
