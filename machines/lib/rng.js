// Seeded RNG (mulberry32) for every payout roll, jitter and restock: same seed + same inputs = same game.
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (n) => Math.floor(next() * n);
  next.normal = () => { let u = 0, v = 0; while (u === 0) u = next(); v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  next.pick = (table) => {            // [[weight, value], ...]
    let s = 0; for (const [w] of table) s += w;
    let r = next() * s;
    for (const [w, v] of table) { if ((r -= w) < 0) return v; }
    return table[table.length - 1][1];
  };
  return next;
}
