// GNOME PUSHER — the coin-pusher game logic (no rendering, no DOM). Pure + seeded: web/gnome_pusher.html draws it,
// web/test/selftest.mjs plays thousands of coins headless.
//
// The machine, top-down (metres). x across the playfield (0 = centre), y = depth from the front LIP (+y = back).
//   LOWER DECK  fixed floor, lip at y = 0 (coins whose centre passes it fall into the WIN TRAY = tickets).
//               Side walls only behind y = GUT; in front of that the deck's sides are open gutters (the house cut).
//   PUSHER      a block sliding on the lower deck; its FACE sweeps y = PF_MIN..PF_MAX and shoves the lower coins.
//   SHELF       the pusher's top = the upper deck. It carries its coins; the fixed back WALL holds them when it pulls
//               back, so they creep forward and drop off the shelf's front edge onto the lower deck.
//   DROP LANE   coins enter along the back wall: you aim the carriage (x), the coin falls past the MUSHROOM GATE
//               (sliding on the wall). Through the gate = a seeded GNOME BONUS (coin shower / a prize gnome).
// Coins are quasi-static discs (no momentum: real pusher coins only move when shoved), solved position-based with a
// spatial grid. Two layers: a coin squeezed hard enough rides up onto its neighbours (layer 1) and is carried by them:
// that is what makes the overhanging walls of coins, the near-misses and the cascades.
import { rng } from './rng.js';

export const GP = {
  W: 0.52, R: 0.014, GR: 0.026, GUT: 0.15,
  PF_MIN: 0.16, PF_MAX: 0.28, PERIOD: 2.6, WALL: 0.55,
  DROP_Y: 0.533, FALL_T: 0.42, GATE_T: 0.24, GATE_HALF: 0.011, GATE_PERIOD: 3.1,
  DT: 1 / 30, ITERS: 4, STACK: 0.42,
  COIN_TICKETS: 1, GNOME_TICKETS: 25, START_CREDITS: 25, DROP_GAP: 0.28,
};

const BONUS = [  // weight, outcome  (the GNOME BONUS wheel)
  [50, { name: 'GNOME SHOWER', coins: 3 }], [26, { name: 'GNOME SHOWER', coins: 6 }], [14, { name: 'GNOME DROP', gnome: 1 }],
  [8, { name: 'WIN BIG', coins: 12 }], [2, { name: 'JACKPOT', coins: 30, gnome: 1 }],
];

export function pfAt(t) { return GP.PF_MIN + (GP.PF_MAX - GP.PF_MIN) * (0.5 + 0.5 * Math.cos(2 * Math.PI * t / GP.PERIOD)); }
export function gateAt(t) { return (GP.W / 2 - 0.05) * Math.sin(2 * Math.PI * t / GP.GATE_PERIOD); }

let NEXT_ID = 1;
function item(kind, x, y, tier) {
  const g = kind === 'gnome';
  return { id: NEXT_ID++, kind, r: g ? GP.GR : GP.R, im: g ? 0.3 : 1, x, y, tier, layer: 0, px: x, py: y, yaw: 0 };
}

export function createPusher(seed = 1, opt = {}) {
  const R = rng(seed);
  const S = {
    seed, R, t: 0, acc: 0, pf: GP.PF_MAX, gx: 0, items: [], pending: [], events: [],
    credits: opt.credits ?? GP.START_CREDITS, tickets: 0, gnomesWon: 0, lastDrop: -9,
    stats: { inserted: 0, house: 0, initial: 0, wonCoins: 0, lostCoins: 0, wonGnomes: 0, lostGnomes: 0, bonuses: 0, houseGnomes: 0, initialGnomes: 0 },
  };
  // the operator's fill: a packed lower deck, a half-full shelf, prize gnomes on both
  const place = (tier, y0, y1, n, kind = 'coin') => {
    let tries = 0, got = 0;
    while (got < n && tries++ < n * 60) {
      const r = kind === 'gnome' ? GP.GR : GP.R, x = R.range(-GP.W / 2 + r, GP.W / 2 - r), y = R.range(y0 + r, y1 - r);
      if (S.items.some((o) => o.tier === tier && (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r + 0.001) ** 2)) continue;
      const it = item(kind, x, y, tier); it.yaw = R() * 6.283; S.items.push(it); got++;
    }
    return got;
  };
  S.stats.initialGnomes += place(0, 0.05, GP.PF_MAX - 0.02, 2, 'gnome');
  S.stats.initialGnomes += place(1, GP.PF_MAX + 0.02, GP.WALL - 0.03, 1, 'gnome');
  // coins: a jittered hex carpet with gaps (RSA alone cannot pack a deck the way a night of play does)
  const hex = (tier, y0, y1, fillP) => {
    let n = 0; const dx = GP.R * 2.06, dy = dx * 0.866;
    for (let row = 0, y = y0 + GP.R; y < y1 - GP.R; row++, y += dy) {
      for (let x = -GP.W / 2 + GP.R + (row % 2) * dx / 2; x < GP.W / 2 - GP.R; x += dx) {
        if (R() > fillP) continue;
        const jx = x + R.range(-0.004, 0.004), jy = y + R.range(-0.004, 0.004);
        if (S.items.some((o) => o.tier === tier && (o.x - jx) ** 2 + (o.y - jy) ** 2 < (o.r + GP.R) ** 2)) continue;
        const it = item('coin', jx, jy, tier); it.yaw = R() * 6.283; S.items.push(it); n++;
      }
    }
    return n;
  };
  S.stats.initial += hex(0, 0.004, GP.PF_MAX, opt.fillLo ?? 0.8);
  S.stats.initial += hex(1, GP.PF_MAX, GP.WALL, opt.fillUp ?? 0.75);
  // settle (the machine has been running all night): coins already hanging at the lip, nothing counted
  // settle with the operator feeding it (the deck finds its working level: coins over the lip, walls on the shelf)
  const warm = opt.warm ?? 30, lim = GP.W / 2 - GP.R - 0.004;
  for (let i = 0; i < warm / GP.DT; i++) {
    if (i % 6 === 0) S.pending.push({ kind: 'coin', x: R.range(-lim, lim), t0: S.t, land: S.t + GP.FALL_T, house: true });
    tick(S);
  }
  resetCounters(S);
  return S;
}

export function resetCounters(S) {
  const st = S.stats, coins = S.items.filter((o) => o.kind === 'coin').length + S.pending.filter((p) => p.kind === 'coin').length;
  const gn = S.items.filter((o) => o.kind === 'gnome').length + S.pending.filter((p) => p.kind === 'gnome').length;
  Object.assign(st, { inserted: 0, house: 0, initial: coins, wonCoins: 0, lostCoins: 0, wonGnomes: 0, lostGnomes: 0, bonuses: 0, houseGnomes: 0, initialGnomes: gn });
  S.tickets = 0; S.gnomesWon = 0; S.events.length = 0;
}

export function addCredits(S, n) { S.credits += n; S.events.push({ type: 'credit', n }); }

/** feed one coin into the drop lane at x (the carriage). false = no credit / chute busy */
export function drop(S, x) {
  if (S.credits <= 0 || S.t - S.lastDrop < GP.DROP_GAP) return false;
  S.credits--; S.lastDrop = S.t; S.stats.inserted++;
  const lim = GP.W / 2 - GP.R - 0.004; x = Math.max(-lim, Math.min(lim, x));
  const jx = Math.max(-lim, Math.min(lim, x + S.R.normal() * 0.004));
  S.pending.push({ kind: 'coin', x: jx, aim: x, t0: S.t, land: S.t + GP.FALL_T, pass: S.t + GP.GATE_T, gate: true });
  S.events.push({ type: 'drop', x: jx });
  return true;
}

function bonus(S, x) {
  const b = S.R.pick(BONUS); S.stats.bonuses++;
  S.events.push({ type: 'bonus', name: b.name, coins: b.coins || 0, gnome: b.gnome || 0, x });
  const lim = GP.W / 2 - GP.R - 0.004;
  for (let i = 0; i < (b.coins || 0); i++) {
    const xx = S.R.range(-lim, lim);
    S.pending.push({ kind: 'coin', x: xx, t0: S.t + 0.5 + i * 0.12, land: S.t + 0.5 + i * 0.12 + GP.FALL_T, house: true });
    S.stats.house++;
  }
  for (let i = 0; i < (b.gnome || 0); i++) {
    S.pending.push({ kind: 'gnome', x: S.R.range(-GP.W / 2 + 0.06, GP.W / 2 - 0.06), t0: S.t + 0.6, land: S.t + 0.6 + GP.FALL_T, house: true });
    S.stats.houseGnomes++;
  }
}

/** advance real time (fixed 30 Hz inside) */
export function step(S, dt) {
  S.acc += Math.min(dt, 0.25);
  while (S.acc >= GP.DT) { S.acc -= GP.DT; tick(S); }
}

// ---------------------------------------------------------------- the solver
// a flat spatial grid (linked lists in typed arrays): cell >= the largest contact distance (gnome + coin)
const CELL = 0.042, GX0 = -0.32, GY0 = -0.12, NX = 16, NY = 18, NC = NX * NY;
const HEAD = new Int32Array(NC), NEXT = new Int32Array(2048), CI = new Int32Array(2048);
function cellOf(o) {
  let cx = Math.floor((o.x - GX0) / CELL), cy = Math.floor((o.y - GY0) / CELL);
  cx = cx < 0 ? 0 : cx >= NX ? NX - 1 : cx; cy = cy < 0 ? 0 : cy >= NY ? NY - 1 : cy; return cy * NX + cx;
}
function build(list) {
  HEAD.fill(-1);
  for (let i = 0; i < list.length; i++) { const c = cellOf(list[i]); CI[i] = c; NEXT[i] = HEAD[c]; HEAD[c] = i; }
}
// visit every pair (i<j) of list that shares a 3x3 neighbourhood
function pairs(list, fn) {
  for (let i = 0; i < list.length; i++) {
    const c = CI[i], cx = c % NX, cy = (c / NX) | 0, a = list[i];
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy; if (yy < 0 || yy >= NY) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx; if (xx < 0 || xx >= NX) continue;
        for (let j = HEAD[yy * NX + xx]; j !== -1; j = NEXT[j]) if (j > i) fn(a, list[j]);
      }
    }
  }
}

function bounds(S, o) {
  const half = GP.W / 2 - o.r;
  if (o.tier === 1) {
    if (o.y > GP.WALL - o.r) o.y = GP.WALL - o.r;
    if (o.x > half) o.x = half; else if (o.x < -half) o.x = -half;
  } else {
    if (o.y > S.pf - o.r) o.y = S.pf - o.r;
    if (o.y > GP.GUT) { if (o.x > half) o.x = half; else if (o.x < -half) o.x = -half; }
  }
}

function sep(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 1e-12) return;
  const d = Math.sqrt(d2), pen = rr - d, w = a.im + b.im, nx = dx / d, ny = dy / d;
  a.x -= nx * pen * a.im / w; a.y -= ny * pen * a.im / w; b.x += nx * pen * b.im / w; b.y += ny * pen * b.im / w;
}

function solveLayer(S, list) {
  for (let it = 0; it < GP.ITERS; it++) {
    build(list); pairs(list, sep);
    for (const a of list) bounds(S, a);
  }
}

function solveTier(S, tier) {
  const L0 = [], L1 = [];
  for (const o of S.items) if (o.tier === tier) (o.layer ? L1 : L0).push(o);
  for (const o of L0) { o.px = o.x; o.py = o.y; }
  solveLayer(S, L0);
  // layer 1 rides its supports (the coins under it); unsupported = it drops back to the deck
  if (L1.length) {
    const all = L0.concat(L1); build(all);
    for (const c of L1) { c.sn = 0; c.sdx = 0; c.sdy = 0; }
    pairs(all, (a, b) => {
      const c = a.layer ? a : b, s = a.layer ? b : a;
      if (a.layer === b.layer || s.kind !== 'coin') return;
      if ((s.x - c.x) ** 2 + (s.y - c.y) ** 2 < (s.r + c.r) ** 2 * 0.72) { c.sn++; c.sdx += s.x - s.px; c.sdy += s.y - s.py; }
    });
    const up = [];
    for (const c of L1) { if (c.sn) { c.x += c.sdx / c.sn; c.y += c.sdy / c.sn; up.push(c); } else c.layer = 0; }
    solveLayer(S, up);
  }
  // squeezed hard = it rides up (the coin nearer the pusher / the wall climbs onto the one in front)
  build(L0);
  const lim = GP.STACK * GP.R;
  pairs(L0, (a, b) => {
    if (a.kind !== 'coin' || b.kind !== 'coin' || a.layer || b.layer) return;
    const pen = a.r + b.r - Math.hypot(b.x - a.x, b.y - a.y);
    if (pen > lim) (a.y > b.y ? a : b).layer = 1;
  });
}

function emit(S, type, o, extra) { S.events.push(Object.assign({ type, id: o.id, kind: o.kind, x: o.x, y: o.y, tier: o.tier, layer: o.layer }, extra || {})); }

export function tick(S) {
  S.t += GP.DT;
  const pf0 = S.pf; S.pf = pfAt(S.t); const dpf = S.pf - pf0;
  S.gx = gateAt(S.t);
  // coins in the air: the gate check as they pass it, the landing on the shelf
  for (let i = S.pending.length - 1; i >= 0; i--) {
    const p = S.pending[i];
    if (p.gate && S.t >= p.pass) {
      p.gate = false;
      if (Math.abs(p.x - gateAt(p.pass)) < GP.GATE_HALF) bonus(S, p.x);
    }
    if (S.t >= p.land) {
      S.pending.splice(i, 1);
      const o = item(p.kind, p.x, Math.min(GP.DROP_Y, GP.WALL - (p.kind === 'gnome' ? GP.GR : GP.R)), 1); o.yaw = S.R() * 6.283;
      S.items.push(o); emit(S, 'land', o);
    }
  }
  for (const o of S.items) if (o.tier === 1) o.y += dpf;        // the shelf carries its coins
  solveTier(S, 1); solveTier(S, 0);
  // edges: off the shelf onto the deck, over the lip = WIN, off the open sides = the house
  const stay = [];
  for (const o of S.items) {
    if (o.tier === 1 && o.y < S.pf) {
      o.tier = 0; o.layer = 0; o.y = Math.min(o.y, S.pf - o.r - 0.002); emit(S, 'shelf', o); stay.push(o); continue;
    }
    if (o.tier === 0 && o.y < 0) {
      emit(S, 'win', o);
      if (o.kind === 'coin') { S.stats.wonCoins++; S.tickets += GP.COIN_TICKETS; }
      else { S.stats.wonGnomes++; S.gnomesWon++; S.tickets += GP.GNOME_TICKETS; }
      continue;
    }
    if (o.tier === 0 && o.y < GP.GUT && Math.abs(o.x) > GP.W / 2) {
      emit(S, 'lost', o); if (o.kind === 'coin') S.stats.lostCoins++; else S.stats.lostGnomes++; continue;
    }
    stay.push(o);
  }
  S.items = stay;
}

/** coins + gnomes accounted for: start + in == field + air + won + lost */
export function audit(S) {
  const st = S.stats;
  const coinsField = S.items.filter((o) => o.kind === 'coin').length, coinsAir = S.pending.filter((p) => p.kind === 'coin').length;
  const gnField = S.items.filter((o) => o.kind === 'gnome').length, gnAir = S.pending.filter((p) => p.kind === 'gnome').length;
  const coinIn = st.initial + st.inserted + st.house, coinOut = coinsField + coinsAir + st.wonCoins + st.lostCoins;
  const gnIn = st.initialGnomes + st.houseGnomes, gnOut = gnField + gnAir + st.wonGnomes + st.lostGnomes;
  return { ok: coinIn === coinOut && gnIn === gnOut, coinIn, coinOut, gnIn, gnOut, coinsField, coinsAir };
}

/** coins hanging over the lip (centre within 40% of a radius of it): the near-miss the player stares at */
export function hangers(S) { return S.items.filter((o) => o.tier === 0 && o.y < GP.R * 0.4).length; }
