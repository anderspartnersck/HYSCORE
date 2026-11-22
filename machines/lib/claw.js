// HYSCORE claw machines (ATTENTION SHEEP / SUCK UP / BLUE CLAW SPECIAL) — the game logic, v2 (1121: a real claw sim).
// Pure + seeded: web/claw.html draws it, web/test/selftest.mjs + web/test/fuzz.mjs play thousands of tries headless.
//
// Frame (metres): x right, z toward the front glass (+z = you), y up from the pit floor. The pit is the glass box floor
// (|x|, |z| < HALF). The prize CHUTE is the front-left corner (x < CHUTE_X, z > CHUTE_Z): no floor, a clear guard wall
// on its two inner sides, a shaft down to the prize tray (y = TRAY) behind the prize door.
//
// THE CLAW hangs from the gantry carriage on its CABLE: a damped pendulum. The carriage has real acceleration, so
// starting, stopping and the trip home swing the claw; drop while it swings and it lands off your mark (wait for it).
// Touch-down is the cable going slack: the claw stops when its hub sits on something or the prongs stall in the heap.
//
// PRIZES are rigid bodies made of a few spheres each (position-based dynamics + shape matching): they stack, slump,
// tumble when dropped and settle; they sleep when still. The pool is the machine's own plush plus our games' prizes:
// PATTY MELT pillows, GNOME GROVE gnomes, HIGH TABLE pucks and ER$N deed plaques (deeds, never cash).
//
// THE GRIP is a real machine's two-stage claw voltage: PICKUP strength while it closes and lifts, then CARRY strength
// once it tops out (weak on most tries: the famous limp claw). The payout controller gives about one try in
// PAYOUT_EVERY full strength all the way. What holds is volts x fit (how centred, how deep the prongs got under it,
// the prize's shape) against the load (its weight x the swing's g-force). A weak carry drops it somewhere on the way:
// a centred grab next to the chute is the honest skill shot, and a prize that falls or is nudged into the chute counts.
import { rng } from './rng.js';

export const CW = {
  HALF: 0.45, CHUTE_X: -0.2, CHUTE_Z: 0.2, CHUTE_H: 0.252, WALL_T: 0.008, TRAY: -0.37, WIN_Y: -0.12,
  TOP: 0.55, ANCHOR: 0.92, HUB: 0.05, HUB_R: 0.04, PRONG: 0.115, TIP_R: 0.012, OPEN_R: 0.078, SHUT_R: 0.022,
  GX: 0.37, SPEED: 0.26, ACC: 1.3, DOWN: 0.32, UP: 0.26, CLOSE_T: 0.7, OPEN_T: 0.6, TIME: 20,
  SWING_DAMP: 1.1, CRADLE: 0.07,
  HOME: [-0.33, 0.33], G: 9.8, DT: 1 / 60, START_CREDITS: 10, PAYOUT_EVERY: 12, RESTOCK_BELOW: 18, ITER: 3,
};

// prize types: local spheres [x, y, z, r] (y up), grip (how well prongs hold it), weight (the load it puts on the claw)
const S2 = (a, r) => [[-a, 0, 0, r], [a, 0, 0, r]];
export const TYPES = {
  sheep: { name: 'ATTENTION SHEEP', parts: S2(0.03, 0.047), grip: 1.0, w: 1.0, soft: 0.18, theme: true },
  cow: { name: 'SUCK UP COW', parts: S2(0.032, 0.049), grip: 0.95, w: 1.12, soft: 0.2, theme: true },
  crab: { name: 'BLUE CLAW CRAB', parts: [[-0.04, 0, 0, 0.042], [0.0, 0, 0, 0.046], [0.04, 0, 0, 0.042]], grip: 1.0, w: 0.95, soft: 0.22, theme: true },
  patty: { name: 'PATTY MELT PILLOW', parts: [[-0.034, -0.04, 0, 0.03], [0.034, -0.04, 0, 0.03], [-0.034, 0.04, 0, 0.03], [0.034, 0.04, 0, 0.03]], grip: 0.9, w: 0.8, soft: 0.2, size: [0.13, 0.15, 0.06] },
  gnome: { name: 'GROVE GNOME', parts: [[0, 0.0, 0, 0.038], [0, 0.055, 0, 0.026]], grip: 1.15, w: 0.75, soft: 0.4 },
  puck: { name: 'HIGH TABLE PUCK', parts: [[0, 0, 0, 0.017], [0.032, 0, 0, 0.017], [-0.032, 0, 0, 0.017], [0, 0, 0.032, 0.017], [0, 0, -0.032, 0.017]], grip: 0.55, w: 0.9, soft: 0.6, size: [0.1, 0.034, 0.1] },
  deed: { name: 'ER$N DEED PLAQUE', parts: [[-0.025, 0, -0.04, 0.017], [-0.025, 0, 0, 0.017], [-0.025, 0, 0.04, 0.017], [0.025, 0, -0.04, 0.017], [0.025, 0, 0, 0.017], [0.025, 0, 0.04, 0.017]], grip: 0.6, w: 0.6, soft: 0.6, size: [0.085, 0.03, 0.12] },
};
// each machine: its own plush in bulk + a few of the house prizes
export const MACHINES = {
  sheep: { name: 'ATTENTION SHEEP', mix: [['sheep', 14], ['patty', 3], ['gnome', 3], ['puck', 3], ['deed', 3]] },
  cow: { name: 'SUCK UP', mix: [['cow', 13], ['patty', 3], ['gnome', 4], ['puck', 3], ['deed', 3]] },
  crab: { name: 'BLUE CLAW SPECIAL', mix: [['crab', 14], ['patty', 3], ['gnome', 3], ['puck', 3], ['deed', 3]] },
};
export const PLUSH = { sheep: { name: 'ATTENTION SHEEP', r: 0.066 }, cow: { name: 'SUCK UP', r: 0.072 }, crab: { name: 'BLUE CLAW SPECIAL', r: 0.07 } };

const inChuteXZ = (x, z) => x < CW.CHUTE_X && z > CW.CHUTE_Z;

// ---------------------------------------------------------------- quaternions [w, x, y, z]
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qnorm = (q) => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
function qrot(q, v) {                 // rotate v by q
  const [w, x, y, z] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
function qaxis(ax, ay, az, ang) { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), ax * s, ay * s, az * s]; }

// ---------------------------------------------------------------- machine
export function createClaw(kind = 'sheep', seed = 1, opt = {}) {
  const R = rng(seed);
  const S = {
    kind, R, M: MACHINES[kind] || MACHINES.sheep, t: 0, acc: 0, items: [], nextId: 1, events: [],
    credits: opt.credits ?? CW.START_CREDITS, won: [], plays: 0, wins: 0,
    gx: CW.HOME[0], gz: CW.HOME[1], cvx: 0, cvz: 0, sx: 0, sz: 0, svx: 0, svz: 0, hy: CW.TOP, vy: 0, open: 1,
    phase: 'idle', timer: CW.TIME, ph: 0, joy: [0, 0], held: null, fit: 0, volts: 0, strong: false, stall: 0, swingA: 0,
    ctrl: { since: 0, payAt: 0 },
    stats: { plays: 0, wins: 0, skillWins: 0, strongPlays: 0, strongWins: 0, grabs: 0, slips: 0, misses: 0, nudgeWins: 0, restocked: 0, initial: 0, byType: {} },
  };
  S.ctrl.payAt = nextPay(S);
  stock(S, opt.count ?? null, true);
  settle(S, 6);
  S.stats.initial = S.items.length; S.stats.wins = 0; S.stats.byType = {}; S.wins = 0; S.won.length = 0; S.events.length = 0;
  return S;
}
const nextPay = (S) => Math.max(3, Math.round(CW.PAYOUT_EVERY * S.R.range(0.6, 1.4)));

function makeItem(S, type, x, y, z) {
  const T = TYPES[type], q = qnorm(qmul(qaxis(0, 1, 0, S.R() * 6.283), qaxis(1, 0, 0, S.R.range(-0.5, 0.5))));
  const it = { id: S.nextId++, type, T, q, state: 'pit', sleep: 0, asleep: false, p: [] };
  const n = T.parts.length, m = [0, 1, 2].map((k) => T.parts.reduce((a, pt) => a + pt[k], 0) / n);    // local frame about the rest centroid
  it.off = m;                                                                                         // (the page puts the model back by it)
  for (const [lx0, ly0, lz0, r] of T.parts) {
    const lx = lx0 - m[0], ly = ly0 - m[1], lz = lz0 - m[2], o = qrot(q, [lx, ly, lz]);
    it.p.push({ l: [lx, ly, lz], r, x: x + o[0], y: y + o[1], z: z + o[2], px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, c: 0 });
  }
  centre(it); return it;
}

function stock(S, n, initial) {
  const bag = [];
  for (const [t, k] of S.M.mix) for (let i = 0; i < k; i++) bag.push(t);
  for (let i = bag.length - 1; i > 0; i--) { const j = S.R.int(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const list = n == null ? bag : bag.slice(0, n);
  list.forEach((t, i) => {
    let x, z, k = 0;
    do { x = S.R.range(-CW.HALF + 0.07, CW.HALF - 0.07); z = S.R.range(-CW.HALF + 0.07, CW.HALF - 0.07); } while (inChuteXZ(x + 0.1, z - 0.1) && k++ < 60);
    S.items.push(makeItem(S, t, x, 0.12 + i * 0.13 + S.R() * 0.04, z));     // spaced: spawned overlaps would launch
  });
  if (!initial) { S.stats.restocked += list.length; S.events.push({ type: 'restock', n: list.length }); }
}

function settle(S, sec) { for (let i = 0; i < sec / CW.DT; i++) physics(S); }

export function addCredits(S, n) { S.credits += n; S.events.push({ type: 'credit', n }); }

/** COIN: start a try (true) - only between tries */
export function insert(S) {
  if (S.phase !== 'idle' || S.credits <= 0) return false;
  S.credits--; S.plays++; S.stats.plays++; S.phase = 'steer'; S.timer = CW.TIME; S.held = null;
  const c = S.ctrl; c.since++;
  S.strong = c.since >= c.payAt;
  if (S.strong) S.stats.strongPlays++;
  S.events.push({ type: 'start', strong: S.strong });
  return true;
}

export function joystick(S, jx, jz) { S.joy[0] = Math.max(-1, Math.min(1, jx || 0)); S.joy[1] = Math.max(-1, Math.min(1, jz || 0)); }
export function dropClaw(S) { if (S.phase === 'steer') { S.phase = 'down'; S.joy[0] = S.joy[1] = 0; S.events.push({ type: 'drop' }); return true; } return false; }

export function step(S, dt) {
  S.acc += Math.min(dt, 0.25);
  while (S.acc >= CW.DT) { S.acc -= CW.DT; tick(S); }
}

// ---------------------------------------------------------------- the claw's geometry (world)
export const head = (S) => [S.gx + S.sx, S.hy, S.gz + S.sz];
export function tips(S) {
  const [hx, , hz] = head(S), rad = CW.SHUT_R + (CW.OPEN_R - CW.SHUT_R) * S.open, y = tipY(S), out = [];
  for (let k = 0; k < 3; k++) { const a = k * 2 * Math.PI / 3 + Math.PI / 2; out.push([hx + rad * Math.cos(a), y, hz + rad * Math.sin(a)]); }
  return out;
}
const tipY = (S) => S.hy - CW.HUB - CW.PRONG * (0.86 + 0.14 * (1 - S.open));
function clawBalls(S) {                 // the kinematic spheres the heap feels: hub + each prong's hinge, middle and tip
  const [hx, hy, hz] = head(S), T = tips(S), out = [[hx, hy - CW.HUB * 0.4, hz, CW.HUB_R]];
  for (const t of T) {
    const hx0 = hx + (t[0] - hx) * 0.45, hz0 = hz + (t[2] - hz) * 0.45, hy0 = hy - CW.HUB;
    out.push([hx0, hy0, hz0, 0.014], [(hx0 + t[0]) / 2, (hy0 + t[1]) / 2, (hz0 + t[2]) / 2, 0.013], [t[0], t[1], t[2], CW.TIP_R]);
  }
  return out;
}

// ---------------------------------------------------------------- the carriage + the cable pendulum
const towards = (v, t, m) => (Math.abs(t - v) <= m ? t : v + Math.sign(t - v) * m);
function carriage(S, tvx, tvz) {
  const dt = CW.DT, ax0 = S.cvx, az0 = S.cvz;
  S.cvx = towards(S.cvx, tvx, CW.ACC * dt); S.cvz = towards(S.cvz, tvz, CW.ACC * dt);
  let nx = S.gx + S.cvx * dt, nz = S.gz + S.cvz * dt;
  if (Math.abs(nx) > CW.GX) { nx = Math.sign(nx) * CW.GX; S.cvx = 0; }        // the rail end stop: a hard stop swings it
  if (Math.abs(nz) > CW.GX) { nz = Math.sign(nz) * CW.GX; S.cvz = 0; }
  const acx = (S.cvx - ax0) / dt, acz = (S.cvz - az0) / dt; S.gx = nx; S.gz = nz;
  // the claw head lags the carriage: s'' = -(g/L) s - a_carriage - c s'
  const L = Math.max(0.2, CW.ANCHOR - S.hy), k = CW.G / L, c = S.phase === 'close' ? 12 : CW.SWING_DAMP;
  const ax = -k * S.sx - acx - c * S.svx, az = -k * S.sz - acz - c * S.svz;
  S.svx += ax * dt; S.svz += az * dt; S.sx += S.svx * dt; S.sz += S.svz * dt;
  const lim = 0.25 * L; if (Math.abs(S.sx) > lim) { S.sx = Math.sign(S.sx) * lim; S.svx = 0; } if (Math.abs(S.sz) > lim) { S.sz = Math.sign(S.sz) * lim; S.svz = 0; }
  S.swingA = Math.hypot(ax + acx, az + acz);                                    // the sideways g the held prize feels
}
export const swing = (S) => Math.hypot(S.sx, S.sz);

// ---------------------------------------------------------------- grab / hold / release
function grab(S) {
  // caught = at least two prongs closed against it, its middle inside the cradle and above the tips
  const [hx, , hz] = head(S), ty = tipY(S), T = tips(S); let best = null, bd = 1e9, bc = null, bn = 0;
  for (const it of S.items) {
    if (it.state !== 'pit') continue;
    const c = it.c, d = Math.hypot(c[0] - hx, c[2] - hz);
    if (d > CW.CRADLE || c[1] < ty - 0.015 || c[1] > S.hy - CW.HUB + 0.03) continue;
    let n = 0;
    for (const t of T) if (it.p.some((p) => Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]) < p.r + CW.TIP_R + 0.014)) n++;
    if (n >= 2 && d < bd) { best = it; bd = d; bc = c; bn = n; }
  }
  if (!best) { S.stats.misses++; S.events.push({ type: 'miss' }); return; }
  const off = best.d0 != null ? Math.max(bd, best.d0) : bd, align = Math.max(0, 1 - off / CW.CRADLE), depth = Math.max(0, Math.min(1, (bc[1] - ty) / 0.05));
  S.fit = best.T.grip * (0.35 + 0.65 * align) * (0.55 + 0.45 * depth) * (bn === 3 ? 1 : 0.8);
  S.volts = S.strong ? 2.6 : S.R.range(1.1, 1.6);                              // PICKUP voltage (closing + lifting)
  S.carry = S.strong ? 2.6 : S.R.range(0.25, 0.75);                           // CARRY voltage once it tops out
  S.held = best; best.state = 'held'; best.asleep = false; S.stats.grabs++;
  best.hold = [bc[0] - hx, bc[1] - S.hy, bc[2] - hz];                         // where it sits in the claw (pulled snug below)
  S.events.push({ type: 'grab', id: best.id, item: best.type, fit: S.fit, align, strong: S.strong });
}

function release(S, why) {
  const it = S.held; if (!it) return;
  const vx = S.cvx + S.svx, vz = S.cvz + S.svz, vy = S.vy, spin = S.R.range(-3, 3);
  for (const p of it.p) {                                                        // the claw's own velocity + a twist off the prongs
    p.vx = vx + spin * (p.z - it.c[2]); p.vz = vz - spin * (p.x - it.c[0]); p.vy = vy;
  }
  it.state = 'pit'; it.sleep = 0; it.asleep = false; S.held = null;
  if (why === 'slip') S.stats.slips++;
  S.events.push({ type: why, id: it.id, item: it.type });
}

function holdHeld(S) {                   // the held prize rides the claw (rigid, snug), and the grip either holds or slips
  const it = S.held, [hx, hy, hz] = head(S);
  const snug = it.hold, ty0 = -(CW.HUB + CW.PRONG * 0.72);
  snug[0] *= 0.9; snug[2] *= 0.9; snug[1] += (ty0 - snug[1]) * 0.1;
  const tx = hx + snug[0], ty = hy + snug[1], tz = hz + snug[2], dx = tx - it.c[0], dy = ty - it.c[1], dz = tz - it.c[2];
  for (const p of it.p) { p.x += dx; p.y += dy; p.z += dz; p.vx = p.vy = p.vz = 0; }
  centre(it);
  if (S.phase === 'open') return;
  const volts = S.phase === 'home' ? S.carry : S.volts;
  const load = it.T.w * (1 + 0.8 * S.swingA / CW.G + (S.phase === 'up' && S.hy < S.liftFrom + 0.03 ? 0.25 : 0));
  const hold = volts * S.fit;
  if (hold < load) {
    const lam = (S.phase === 'home' ? 6 : 2.5) * (load - hold) / load + 0.3;      // slip hazard per second (the limp carry bites hardest)
    if (S.R() < lam * CW.DT) release(S, 'slip');
  }
}

// ---------------------------------------------------------------- the try
export function tick(S) {
  S.t += CW.DT; const dt = CW.DT;
  switch (S.phase) {
    case 'idle': case 'steer': {
      if (S.phase === 'steer') { S.timer -= dt; if (S.timer <= 0) { S.timer = 0; dropClaw(S); } }
      const j = S.phase === 'steer' ? S.joy : [0, 0];
      carriage(S, j[0] * CW.SPEED, j[1] * CW.SPEED); S.vy = 0;
      break;
    }
    case 'down': {
      carriage(S, 0, 0);
      S.open = towards(S.open, 1, dt / 0.3); S.vy = -CW.DOWN; S.hy += S.vy * dt;
      const [hx, , hz] = head(S); let touch = tipY(S) <= 0.012 || S.hy <= CW.HUB + CW.PRONG + 0.005;
      for (const it of S.items) {                                                  // the hub sits down on a prize: the cable goes slack
        if (it.state !== 'pit') continue;
        for (const p of it.p) if (Math.hypot(p.x - hx, p.z - hz) < p.r + 0.02 && S.hy - CW.HUB * 0.4 - CW.HUB_R <= p.y + p.r * 0.9) touch = true;
      }
      if (S.stall >= 3) touch = true;                                              // the prongs stalled in the heap
      if (touch) { S.phase = 'close'; S.ph = 0; S.vy = 0; S.stall = 0; S.svx *= 0.2; S.svz *= 0.2; S.events.push({ type: 'touch' }); }
      break;
    }
    case 'close': {
      carriage(S, 0, 0); S.vy = 0;
      S.ph += dt; S.open = Math.max(0, 1 - S.ph / CW.CLOSE_T);
      if (S.ph >= CW.CLOSE_T) { grab(S); S.phase = 'up'; S.liftFrom = S.hy; }
      break;
    }
    case 'up': {
      carriage(S, 0, 0); S.vy = CW.UP; S.hy = Math.min(CW.TOP, S.hy + S.vy * dt);
      if (S.hy >= CW.TOP) { S.phase = 'home'; S.ph = 0; S.vy = 0; if (S.held && !S.strong) S.events.push({ type: 'weak' }); }
      break;
    }
    case 'home': {                       // a trapezoid run to the chute: accelerate, cruise, brake (the brake swings it)
      const dx = CW.HOME[0] - S.gx, dz = CW.HOME[1] - S.gz, d = Math.hypot(dx, dz); S.ph += dt;
      if (S.ph > 8) { S.gx = CW.HOME[0]; S.gz = CW.HOME[1]; S.cvx = S.cvz = 0; S.phase = 'drop_wait'; S.ph = 0; break; }   // fail-safe
      const v = Math.min(CW.SPEED, Math.sqrt(2 * CW.ACC * 0.9 * d));
      if (d < 0.002 && Math.hypot(S.cvx, S.cvz) < 0.02) { S.gx = CW.HOME[0]; S.gz = CW.HOME[1]; S.cvx = S.cvz = 0; S.phase = 'drop_wait'; S.ph = 0; }
      else carriage(S, d > 1e-6 ? dx / d * v : 0, d > 1e-6 ? dz / d * v : 0);
      break;
    }
    case 'drop_wait': { carriage(S, 0, 0); S.ph += dt; if (S.ph > 0.25) { S.phase = 'open'; S.ph = 0; } break; }
    case 'open': {
      carriage(S, 0, 0);
      S.ph += dt; S.open = Math.min(1, S.ph / CW.OPEN_T * 1.5);
      if (S.held && S.open > 0.45) release(S, 'release');
      if (S.ph >= CW.OPEN_T + 0.6) {
        S.phase = 'idle'; S.open = 1; S.events.push({ type: 'end' });
        if (S.items.filter((p) => p.state === 'pit').length < CW.RESTOCK_BELOW) stock(S, 8);
      }
      break;
    }
  }
  if (S.held) holdHeld(S);
  physics(S);
}

// ---------------------------------------------------------------- physics: PBD spheres + shape matching
function centre(it) {
  let x = 0, y = 0, z = 0; for (const p of it.p) { x += p.x; y += p.y; z += p.z; }
  const n = it.p.length; it.c = [x / n, y / n, z / n];
}

function shapeMatch(it) {          // best-fit rotation (Mueller 2016 iterative quaternion), then snap the spheres rigid
  centre(it); const c = it.c;
  // A = sum (x - c) (l)^T
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of it.p) {
    const d = [p.x - c[0], p.y - c[1], p.z - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] += d[i] * p.l[j];
  }
  let q = it.q;
  for (let k = 0; k < 6; k++) {
    const e0 = qrot(q, [1, 0, 0]), e1 = qrot(q, [0, 1, 0]), e2 = qrot(q, [0, 0, 1]);
    const a0 = [A[0], A[3], A[6]], a1 = [A[1], A[4], A[7]], a2 = [A[2], A[5], A[8]];
    const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const c0 = cr(e0, a0), c1 = cr(e1, a1), c2 = cr(e2, a2);
    const den = Math.abs(e0[0] * a0[0] + e0[1] * a0[1] + e0[2] * a0[2] + e1[0] * a1[0] + e1[1] * a1[1] + e1[2] * a1[2] + e2[0] * a2[0] + e2[1] * a2[1] + e2[2] * a2[2]) + 1e-9;
    const om = [(c0[0] + c1[0] + c2[0]) / den, (c0[1] + c1[1] + c2[1]) / den, (c0[2] + c1[2] + c2[2]) / den], w = Math.hypot(om[0], om[1], om[2]);
    if (w < 1e-9) break;
    q = qnorm(qmul(qaxis(om[0] / w, om[1] / w, om[2] / w, Math.min(w, 0.5)), q));
  }
  it.q = q;
  for (const p of it.p) { const o = qrot(q, p.l); p.x = c[0] + o[0]; p.y = c[1] + o[1]; p.z = c[2] + o[2]; }
}

function physics(S) {
  const dt = CW.DT, live = S.items.filter((it) => it.state === 'pit'), awake = live.filter((it) => !it.asleep);
  const clawNear = S.phase === 'down' || S.phase === 'close' || (S.phase === 'up' && S.hy < 0.42);
  const balls = clawNear ? clawBalls(S) : null, heldP = S.held ? S.held.p : null;
  if (clawNear || heldP) {         // the claw (or the prize it carries) wakes whatever it reaches
    const [hx, hy, hz] = head(S);
    for (const it of live) if (it.asleep && Math.hypot(it.c[0] - hx, it.c[2] - hz) < 0.2 && it.c[1] > (heldP ? hy - 0.4 : tipY(S) - 0.12)) { it.asleep = false; it.sleep = 0; awake.push(it); }
  }
  if (!awake.length) return;
  for (const it of awake) for (const p of it.p) {
    p.vy -= CW.G * dt; p.px = p.x; p.py = p.y; p.pz = p.z;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.c = 0;
  }
  let stallHit = 0; const pinch = new Set();
  if (S.phase === 'close') {          // two or three prongs closing on one prize PINCH it: it centres in the claw (kinematic)
    const [hx, , hz] = head(S), T = tips(S);
    for (const it of awake) {
      let n = 0;
      for (const t of T) if (it.p.some((p) => Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]) < p.r + CW.TIP_R + 0.012)) n++;
      if (n < 2) continue;
      pinch.add(it); if (it.d0 == null) it.d0 = Math.hypot(hx - it.c[0], hz - it.c[2]);
      const dx = hx - it.c[0], dz = hz - it.c[2], d = Math.hypot(dx, dz), m = Math.min(d, 0.0035 * n / 3);
      if (d > 1e-6) for (const p of it.p) { const ox = dx / d * m, oz = dz / d * m; p.x += ox; p.z += oz; p.px += ox; p.pz += oz; }
    }
  }
  for (let iter = 0; iter < CW.ITER; iter++) {
    for (let a = 0; a < live.length; a++) {                 // sphere vs sphere, between prizes
      const A = live[a];
      for (let b = a + 1; b < live.length; b++) {
        const Bi = live[b]; if (A.asleep && Bi.asleep) continue;
        const dcx = A.c[0] - Bi.c[0], dcz = A.c[2] - Bi.c[2], dcy = A.c[1] - Bi.c[1];
        if (dcx * dcx + dcy * dcy + dcz * dcz > 0.05) continue;                    // > 22 cm apart: no part can touch
        const wa = A.asleep ? 0 : 1, wb = Bi.asleep ? 0 : 1, ws = wa + wb;
        for (const p of A.p) for (const q of Bi.p) {
          const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, rr = p.r + q.r, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-12) continue;
          const d = Math.sqrt(d2), k = (rr - d) / d / ws;
          if (wb === 0 && d < rr - 0.006) { Bi.asleep = false; Bi.sleep = 0; }
          if (wa === 0 && d < rr - 0.006) { A.asleep = false; A.sleep = 0; }
          p.x -= dx * k * wa; p.y -= dy * k * wa; p.z -= dz * k * wa; q.x += dx * k * wb; q.y += dy * k * wb; q.z += dz * k * wb;
          p.c = q.c = 1;
        }
      }
    }
    for (const it of awake) for (const p of it.p) {
      const soft = it.T.soft;
      if (balls && !pinch.has(it)) for (const bl of balls) {                     // the claw shoves prizes aside (kinematic)
        const dx = p.x - bl[0], dy = p.y - bl[1], dz = p.z - bl[2], rr = p.r + bl[3], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr) continue;
        // soft (prongs dig into plush) and kinematic: the shove moves it, it does not fling it (prev moves too: no velocity)
        const d = Math.sqrt(d2) || 1e-6, k = (rr - d) / d * soft, mx = dx * k, my = dy * k, mz = dz * k;
        p.x += mx; p.y += my; p.z += mz; p.px += mx; p.py += my; p.pz += mz; p.c = 1;
        if (iter === CW.ITER - 1 && S.phase === 'down' && bl[3] <= CW.TIP_R + 0.002 && (rr - d) > Math.max(0.004, p.r * 0.75 * (1 - soft))) stallHit++;   // dug in as far as it goes
      }
      if (heldP) for (const h of heldP) {                       // the carried prize drags across the heap
        const dx = p.x - h.x, dy = p.y - h.y, dz = p.z - h.z, rr = p.r + h.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.y += dy * k; p.z += dz * k; p.c = 1;
      }
      walls(p, it);
    }
    for (const it of awake) shapeMatch(it);
  }
  if (S.phase === 'down') S.stall = stallHit ? S.stall + 1 : 0;
  for (const it of awake) {
    let vmax = 0, cx = 0, cy = 0, cz = 0; const n = it.p.length;
    for (const p of it.p) {
      p.vx = (p.x - p.px) / dt; p.vy = (p.y - p.py) / dt; p.vz = (p.z - p.pz) / dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz); if (sp > 2.5) { p.vx *= 2.5 / sp; p.vy *= 2.5 / sp; p.vz *= 2.5 / sp; }   // a deep solve never launches
      cx += p.vx; cy += p.vy; cz += p.vz;
    }
    cx /= n; cy /= n; cz /= n;
    let contact = false; for (const p of it.p) if (p.c) contact = true;
    for (const p of it.p) {                                       // plush is grippy: contact bleeds slide and spin
      if (contact) { const f = 0.86; p.vx = cx * f + (p.vx - cx) * 0.8; p.vz = cz * f + (p.vz - cz) * 0.8; p.vy = cy + (p.vy - cy) * 0.8; }
      vmax = Math.max(vmax, Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.vz));
    }
    it.sleep = vmax < 0.045 && contact ? it.sleep + 1 : 0;
    if (it.sleep > 24) { it.asleep = true; for (const p of it.p) p.vx = p.vy = p.vz = 0; }
    centre(it);
    if (it.c[1] < CW.WIN_Y && inChuteXZ(it.c[0], it.c[2])) win(S, it);
  }
}

function walls(p, it) {
  const r = p.r, lim = CW.HALF - r;
  if (p.x < -lim) { p.x = -lim; p.c = 2; } if (p.x > lim) { p.x = lim; p.c = 2; }
  if (p.z < -lim) { p.z = -lim; p.c = 2; } if (p.z > lim) { p.z = lim; p.c = 2; }
  const over = inChuteXZ(p.x, p.z);
  if (!over && p.y < r && p.y > -0.05) { p.y = r; p.c = 2; }
  if (p.y < CW.TRAY + r) { p.y = CW.TRAY + r; p.c = 2; }
  // the chute's two guard walls (thin, 0..CHUTE_H): closest-point push-out; a sphere right over a wall's top edge is
  // tipped off it (to whichever side it leans), so nothing perches on the guard
  const boxes = [[CW.CHUTE_X, CW.CHUTE_X + CW.WALL_T, CW.CHUTE_Z, CW.HALF, 0], [-CW.HALF, CW.CHUTE_X, CW.CHUTE_Z - CW.WALL_T, CW.CHUTE_Z, 1]];
  for (const [x0, x1, z0, z1, ax] of boxes) {
    const cx = Math.max(x0, Math.min(x1, p.x)), cy = Math.max(-0.6, Math.min(CW.CHUTE_H, p.y)), cz = Math.max(z0, Math.min(z1, p.z));
    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz; const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    if (p.y < CW.CHUTE_H) {                                  // beside the wall: the whole prize goes to the side its middle is on
      if (ax === 0) { const side = (it ? it.c[0] : p.x) < (x0 + x1) / 2 ? -1 : 1; p.x = side < 0 ? Math.min(p.x, x0 - r) : Math.max(p.x, x1 + r); }
      else { const side = (it ? it.c[2] : p.z) < (z0 + z1) / 2 ? -1 : 1; p.z = side < 0 ? Math.min(p.z, z0 - r) : Math.max(p.z, z1 + r); }
      p.c = 2; continue;
    }
    if (dy > 0 && (ax === 0 ? Math.abs(dx) : Math.abs(dz)) < r * 0.35) {     // on the edge: lean it off
      if (ax === 0) dx += (p.x < (x0 + x1) / 2 ? -1 : 1) * r * 0.5; else dz += (p.z < (z0 + z1) / 2 ? -1 : 1) * r * 0.5;
    }
    const d = Math.hypot(dx, dy, dz);
    if (d > 1e-9) { const k = (r - d) / d; p.x += dx * k; p.y += dy * k; p.z += dz * k; } else p.y = CW.CHUTE_H + r;
    p.c = 2;
  }
  // the shaft below the pit floor: inside the chute column, nothing gets back out
  if (p.y < 0 && !over) { p.x = Math.min(p.x, CW.CHUTE_X - r * 0.5); p.z = Math.max(p.z, CW.CHUTE_Z + r * 0.5); }
}

function win(S, it) {
  it.state = 'won'; S.items = S.items.filter((q) => q !== it);
  S.wins++; S.stats.wins++; S.won.push(it.type);
  S.stats.byType[it.type] = (S.stats.byType[it.type] || 0) + 1;
  const viaClaw = S.phase === 'open' || S.phase === 'drop_wait';
  if (S.strong) S.stats.strongWins++; else if (viaClaw) S.stats.skillWins++; else S.stats.nudgeWins++;
  S.ctrl.since = 0; S.ctrl.payAt = nextPay(S);
  S.events.push({ type: 'win', id: it.id, item: it.type, name: it.T.name, x: it.c[0], y: it.c[1], z: it.c[2], q: it.q.slice() });
}

/** prizes accounted for: stocked == in the machine (pit or claw) + won */
export function audit(S) {
  const stocked = S.stats.initial + S.stats.restocked, here = S.items.length;
  return { ok: stocked === here + S.stats.wins, stocked, here, won: S.stats.wins };
}

/** anything wrong with the heap right now (the fuzz's stuck/NaN gate) */
export function problems(S) {
  const out = [];
  for (const it of S.items) {
    for (const p of it.p) if (![p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite)) { out.push(['nan', it.id]); break; }
    const c = it.c;
    if (Math.abs(c[0]) > CW.HALF || Math.abs(c[2]) > CW.HALF || c[1] > 1.2 || c[1] < CW.TRAY - 0.01) out.push(['out', it.id, c.map((v) => +v.toFixed(3))]);
    if (it.state === 'pit' && inChuteXZ(c[0], c[2]) && c[1] < CW.CHUTE_H && it.asleep) out.push(['chute', it.id, c.map((v) => +v.toFixed(3))]);
    if (it.state === 'pit' && it.asleep && c[1] > 0.5) out.push(['floating', it.id]);
  }
  return out;
}
