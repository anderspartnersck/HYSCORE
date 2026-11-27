// HYSCORE — THE WALK-THROUGH player. data/level.json (from blender/level.py + tools/pack_walk.py):
//   nodes{id:{pos, heading, pano, hotspots:[{kind:'walk'|'cut'|'inspect', to|exhibit, yaw, pitch, clip}]}},
//   exhibits{id:{title, game, pitch, controls, launch[], clip, frames}}, clips{path:frames}
// Panorama convention: equirect, centre column = north (+y), u = 0.5 + heading/360 (heading clockwise from north).
// Moves are pre-rendered at the same horizontal FOV, on twos (12 drawings per second).
'use strict';
const $ = (id) => document.getElementById(id);
const gl = $('gl').getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
const cctx = $('clip').getContext('2d');
let SEEN_SECRET = false;
const SETTINGS = { sound: true, skipCuts: false };   // 1110: the pause/settings menu (ui.js); session only, nothing saved
let LEVEL = null, NODE = null, YAW = 0, PITCH = 0, HFOV = 75, BUSY = false, TEX = null;
const FPS = 12, RAD = Math.PI / 180;
const cache = new Map();            // url -> Image (decoded)

function img(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => { LOADED.add(url); res(i); }; i.onerror = rej; i.src = url; });
  p.catch(() => cache.delete(url));            // a dropped request is retried next time, never a stuck rejection
  cache.set(url, p); return p;
}
function frames(base, n) { const out = []; for (let i = 0; i < n; i++) out.push(`${base}/${String(i).padStart(3, '0')}.webp`); return out; }

// ------------------------------------------------------------------ WebGL equirect viewer
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0., 1.); }`;
const FS = `precision highp float; varying vec2 v; uniform sampler2D t; uniform float yaw, pitch, tx, ty;
const float PI = 3.14159265358979;
void main(){
  float x = v.x * tx, y = v.y * ty;
  vec3 f = vec3(sin(yaw) * cos(pitch), cos(yaw) * cos(pitch), sin(pitch));
  vec3 r = vec3(cos(yaw), -sin(yaw), 0.);
  vec3 u = vec3(-sin(yaw) * sin(pitch), -cos(yaw) * sin(pitch), cos(pitch));
  vec3 d = normalize(f + x * r + y * u);
  float lon = atan(d.x, d.y), lat = asin(clamp(d.z, -1., 1.));
  gl_FragColor = texture2D(t, vec2(fract(0.5 + lon / (2. * PI)), 0.5 - lat / PI));
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const ap = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
const U = { yaw: gl.getUniformLocation(prog, 'yaw'), pitch: gl.getUniformLocation(prog, 'pitch'), tx: gl.getUniformLocation(prog, 'tx'), ty: gl.getUniformLocation(prog, 'ty') };

function setTexture(image) {
  if (!TEX) TEX = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, TEX);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}
function resize() {
  const c = $('gl'), k = Math.min(2, window.devicePixelRatio || 1);
  for (const el of [c, $('clip')]) { el.width = Math.round(c.clientWidth * k); el.height = Math.round(c.clientHeight * k); }
  gl.viewport(0, 0, c.width, c.height);
}
function tanH() { return Math.tan(HFOV * RAD / 2); }
function draw() {
  if (!TEX) return;
  const c = $('gl'), a = c.width / c.height;
  gl.uniform1f(U.yaw, YAW * RAD); gl.uniform1f(U.pitch, PITCH * RAD); gl.uniform1f(U.tx, tanH()); gl.uniform1f(U.ty, tanH() / a);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); placeHots();
  if (window.LIVE) LIVE.place(NODE, project, BUSY);      // 1119: the pop-up's live window rides the panorama
}

// ------------------------------------------------------------------ hotspots
function project(yaw, pitch, free) {   // world direction -> screen fraction (or null if behind; free = no off-screen cut)
  const y = yaw * RAD, p = pitch * RAD, cy = YAW * RAD, cp = PITCH * RAD;
  const d = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), Math.sin(p)];
  const f = [Math.sin(cy) * Math.cos(cp), Math.cos(cy) * Math.cos(cp), Math.sin(cp)];
  const r = [Math.cos(cy), -Math.sin(cy), 0], u = [-Math.sin(cy) * Math.sin(cp), -Math.cos(cy) * Math.sin(cp), Math.cos(cp)];
  const dz = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (dz < 0.15) return null;
  const c = $('gl'), a = c.clientWidth / c.clientHeight;
  const x = (d[0] * r[0] + d[1] * r[1]) / dz / tanH(), yy = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / dz / (tanH() / a);
  if (!free && (Math.abs(x) > 1.1 || Math.abs(yy) > 1.1)) return null;
  return [(x + 1) / 2, (1 - yy) / 2];
}
// 1119 (Joe: "streamline the clickable waypoints to the rooms"): the walk rings are the node's `nav` (tools/walk_nav.py):
// one labelled ring per neighbouring ROOM (one click walks every clip of the way, back to back) + small rings for the
// same room's stops. The raw per-edge rings only show for a level packed before nav existed.
const AREA_COL = { 'LOBBY': '#ff3fb4', 'MERC ZEBRA ROW': '#ff3fb4', 'MAIN FLOOR': '#c99bff', "PATTY'S POP-UP": '#ff8a3d', 'BLACKLIGHT AREA': '#a06bff',
                   'GNOME GROVE': '#d27bff', 'HYSCORE FOREST': '#53ff8a', "COLEMAN'S PALACE": '#f0b04c', 'THE HALLWAY': '#e8c066', 'HYSCORE GATEWAY': '#e8c066' };
function navRings() {
  if (NODE.nav && NODE.nav.length) return NODE.nav.map((r) => Object.assign({}, r, { kind: 'walk', navKind: r.kind }));
  return NODE.hotspots.filter((h) => h.kind === 'walk');
}
function buildHots() {
  const h = $('hots'); h.innerHTML = '';
  if (!NODE) return;
  const list = navRings().concat(NODE.hotspots.filter((x) => x.kind !== 'walk'));
  for (const hs of list) {
    if (hs.hidden) continue;
    const el = document.createElement('div'); el.className = 'hot ' + hs.kind + (hs.navKind ? ' ' + hs.navKind : '');
    const icon = hs.kind === 'inspect' ? '◎' : (hs.kind === 'cut' ? '✦' : (hs.pitch > 5 ? '⇡' : (hs.pitch < -5 && Math.abs(hs.pitch) > 25 ? '⇣' : '▲')));
    const lab = hs.kind === 'inspect' ? (LEVEL.exhibits[hs.exhibit] || {}).title : (hs.label || (LEVEL.nodes[hs.to] || {}).area || '');
    const col = AREA_COL[hs.area || (LEVEL.nodes[hs.to] || {}).area] || '';
    if (col && hs.kind === 'walk') el.style.setProperty('--c', col);
    el.innerHTML = `<div class="ring"><span class="g">${icon}</span></div><div class="lab"><b>${esc(lab || '')}</b>${hs.sub ? `<i>${esc(hs.sub)}</i>` : ''}</div>`;
    el.onclick = (e) => { e.stopPropagation(); act(hs); };
    el._hs = hs; el._icon = icon; h.appendChild(el);
  }
  placeHots();
}
function hotPitch(hs) { return hs.kind === 'inspect' ? hs.pitch : (hs.kind === 'walk' && Math.abs(hs.pitch) < 5 ? -18 : hs.pitch); }
function placeHots() {
  const els = [...$('hots').children], parked = { l: [], r: [], b: [] }, shown = [];
  for (const el of els) {
    const hs = el._hs; el.classList.remove('flip', 'nolab');
    if (BUSY) { el.style.display = 'none'; continue; }
    const s = project(hs.yaw, hotPitch(hs));
    el.classList.toggle('edge', !s); el.style.display = '';
    if (s) { el.querySelector('.g').textContent = el._icon; el.style.left = (s[0] * 100) + '%'; el.style.top = (s[1] * 100) + '%'; shown.push(el); continue; }
    // off-screen: park it at the edge it lies toward, so every way on is always findable (inspect rings stay in the room)
    if (hs.kind === 'inspect') { el.style.display = 'none'; continue; }
    const d = angDiff(YAW, hs.yaw);
    (Math.abs(d) > 150 ? parked.b : d < 0 ? parked.l : parked.r).push([Math.abs(d), el]);
  }
  for (const [side, arr] of Object.entries(parked)) {        // each edge in turn order, nearest first
    arr.sort((a, b) => a[0] - b[0]);
    arr.forEach(([, el], i) => {
      if (side === 'b') { el.style.left = (50 + (i - (arr.length - 1) / 2) * 24) + '%'; el.style.top = '86%'; el.querySelector('.g').textContent = '▼'; }
      else { el.style.left = (side === 'l' ? 5 : 95) + '%'; el.style.top = (28 + i * 16) + '%'; el.querySelector('.g').textContent = side === 'l' ? '◀' : '▶'; }
      shown.push(el);
    });
  }
  declutter(shown);
}
// nothing sits on top of anything: rooms place first, then stops, then exhibits. A ring that would land on a placed
// ring / label steps up or down until it is clear; its label goes below, else above, else hides until hovered.
function declutter(els) {
  const rank = (el) => (el._hs.kind === 'walk' ? (el._hs.navKind === 'spot' ? 1 : 0) : 2) + (el.classList.contains('edge') ? 0.5 : 0);
  els.sort((a, b) => rank(a) - rank(b));
  const F = $('hots').getBoundingClientRect(), placed = [];
  const hit = (r) => placed.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
  const pad = (r, p) => ({ left: r.left - p, right: r.right + p, top: r.top - p, bottom: r.bottom + p });
  for (const el of els) {
    const ring = el.querySelector('.ring'), top0 = parseFloat(el.style.top) / 100 * F.height;
    const step = ring.getBoundingClientRect().height + 8;
    let r = pad(ring.getBoundingClientRect(), 3);
    for (let k = 1; hit(r) && k <= 8; k++) {        // 0, +1, -1, +2, -2 ... ring heights, kept on the frame
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step, y = top0 + off;
      if (y < 20 || y > F.height - 20) continue;
      el.style.top = (y / F.height * 100) + '%'; r = pad(ring.getBoundingClientRect(), 3);
    }
    placed.push(r);
    const lab = el.querySelector('.lab'); if (!lab.textContent) continue;
    let lr = lab.getBoundingClientRect();
    if (hit(lr)) { el.classList.add('flip'); lr = lab.getBoundingClientRect(); if (hit(lr)) { el.classList.remove('flip'); el.classList.add('nolab'); continue; } }
    placed.push(lr);
  }
}

// ------------------------------------------------------------------ moving
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function angDiff(a, b) { return ((b - a + 540) % 360) - 180; }
async function turnTo(yaw, pitch = 0, ms = 380) {
  const y0 = YAW, p0 = PITCH, dy = angDiff(y0, yaw), dp = pitch - p0, t0 = performance.now();
  return new Promise((res) => { (function step(now) {
    const t = Math.min(1, (now - t0) / ms), e = t * t * (3 - 2 * t);
    YAW = (y0 + dy * e + 360) % 360; PITCH = p0 + dp * e; draw();
    if (t < 1) requestAnimationFrame(step); else res(); })(t0); });
}
async function playFrames(urls, reverse = false) {
  const ims = await Promise.all(urls.map(img)); const c = $('clip');
  if (reverse) ims.reverse();
  c.style.opacity = 1;
  for (const im of ims) {
    const W = c.width, H = c.height, k = Math.max(W / im.width, H / im.height);
    cctx.drawImage(im, (W - im.width * k) / 2, (H - im.height * k) / 2, im.width * k, im.height * k);
    await sleep(1000 / FPS);
  }
}
function hideClip() { $('clip').style.opacity = 0; }
function clipFrames(path) { if (window.GW && GW.on) path = GW.clip(path); const n = (LEVEL.clips || {})[path]; return n ? frames(path, n) : null; }
function panoOf(n) { return (window.GW && GW.on && GW.pano(n)) || n.pano; }     // 1119: the GATEWAY atrium shows its current variant (gateway.js)

async function goNode(id, yaw = null, instant = false) {
  const n = LEVEL.nodes[id]; if (!n) return;
  $('load').textContent = 'loading…';
  const im = await img(panoOf(n)); setTexture(im); $('load').textContent = '';
  const prev = NODE; NODE = n; YAW = yaw == null ? n.heading : yaw; PITCH = n.pitch0 || 0;
  if (/^(stairs_|keep)/.test(id)) SEEN_SECRET = true;            // the map shows the Keep only after the secret door
  const room = (LEVEL.rooms || {})[id];
  $('area').textContent = room ? room.name : n.area; $('sub').textContent = room ? room.sub : '';
  if (window.GW && GW.on) GW.arrive(n, prev);
  buildHots(); draw(); hideClip(); preload(n);
  setHash(id);
}
// 1125: the address bar is always a link to where you stand (#node) or the card you have open (#node/exhibit)
function setHash(node, ex) {
  const h = window.HYPLACES ? HYPLACES.hashFor(node, ex) : '#' + node + (ex ? '/' + ex : '');
  try { history.replaceState(null, '', h); } catch (e) {}
}
// open a game card at the current stop: through its pink ring (turn + push-in) when the stop has one, else straight up
async function openCard(exId) {
  const ex = LEVEL.exhibits[exId]; if (!ex || !NODE) return false;
  const hs = NODE.hotspots.find((h) => h.kind === 'inspect' && h.exhibit === exId);
  if (hs) await act(hs); else { BUSY = false; showCard(ex, null, null); }
  return true;
}
const LOADED = new Set();         // urls whose image has decoded (so a passing-through panorama is used only if it is ready)
function preload(n) {
  // 1119: a room ring preloads its FIRST leg + where it lands; the later legs load the moment it is clicked
  for (const r of n.nav || []) {
    const last = LEVEL.nodes[r.route[r.route.length - 1].to]; if (last) img(panoOf(last));
    const f = clipFrames(r.route[0].clip); if (f) f.forEach(img);
  }
  for (const hs of n.hotspots) {
    if (n.nav && n.nav.length && hs.kind === 'walk') continue;
    if (hs.to && LEVEL.nodes[hs.to]) img(panoOf(LEVEL.nodes[hs.to]));
    const f = hs.clip && clipFrames(hs.clip); if (f) f.forEach(img);
  }
}
async function act(hs) {
  if (BUSY) return; BUSY = true; draw(); $('card').style.display = 'none';
  try {
    if (hs.route && hs.route.length) {     // 1119: a room ring walks its whole route, clip after clip, then lands
      for (const leg of hs.route) { const f = clipFrames(leg.clip); if (f) f.forEach(img); if (LEVEL.nodes[leg.to]) img(panoOf(LEVEL.nodes[leg.to])); }
      for (let i = 0; i < hs.route.length; i++) {
        const leg = hs.route[i], f = clipFrames(leg.clip);
        await turnTo(leg.yaw, 0, i ? 260 : 380);
        if (f) await playFrames(f);
        if (window.UI) UI.blip('step');
        const mid = LEVEL.nodes[leg.to];
        if (i < hs.route.length - 1 && mid && LOADED.has(panoOf(mid))) {   // passing through: its panorama for the turn (if it is in)
          setTexture(await img(panoOf(mid))); YAW = leg.yaw; PITCH = 0; hideClip(); draw();
        }
      }
      await goNode(hs.route[hs.route.length - 1].to, hs.route[hs.route.length - 1].yaw);
    } else if (hs.kind === 'walk' || hs.kind === 'cut') {
      const f = clipFrames(hs.clip);
      if (hs.kind === 'walk') await turnTo(hs.yaw, 0);
      else await turnTo(LEVEL.nodes[NODE.id].heading, 0);
      if (f && !(hs.kind === 'cut' && SETTINGS.skipCuts)) await playFrames(f);
      if (window.UI) UI.blip(hs.kind === 'cut' ? 'cut' : 'step');
      const end = hs.kind === 'cut' ? LEVEL.nodes[hs.to].heading : hs.yaw;
      await goNode(hs.to, end);
    } else if (hs.kind === 'inspect') {
      if (window.GW && GW.on) await GW.inspect(hs);          // 1119: a game's table at the GATEWAY turns the atrium into its room
      const ex = LEVEL.exhibits[hs.exhibit]; const f = clipFrames(ex.clip);
      await turnTo(hs.yaw, 0);
      if (f) await playFrames(f);
      showCard(ex, hs, f);
      BUSY = false; return;
    }
  } finally { BUSY = false; placeHots(); }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function showCard(ex, hs, f) {
  const c = $('card'); BUSY = true;
  const launch = (ex.launch || []).map((l) => `<li>${esc(l.label)} <span style="opacity:.6">— ${esc(l.room)}</span></li>`).join('');
  c.innerHTML = `<div class="game">${esc(ex.game || '')}</div><h2>${esc(ex.title)}</h2>` +
    (ex.status ? `<div class="status">${esc(ex.status)}</div>` : '') +
    (ex.pitch ? `<p>${esc(ex.pitch)}</p>` : '') + (ex.controls ? `<div class="ctl">${esc(ex.controls)}</div>` : '') +
    (launch ? `<ul>${launch}</ul>` : '') +
    `<div class="row"><button id="back">◂ back</button>` +
    (ex.labs || []).map((l, i) => `<button class="play" data-i="${i}">▶ ${esc(l.label)}</button>`).join('') +
    `<button class="share" id="share">⧉ copy link</button>` +
    (ex.secret ? `<button id="secret">✦ the private stairs</button>` : '') + `</div>`;
  c.style.display = 'block'; if (NODE) setHash(NODE.id, ex.id);
  $('share').onclick = () => { if (NODE && window.HYPLACES) HYPLACES.share(NODE.id, ex.id); };
  // PLAY = the game's live site (opens in a new tab; the walk stays where you are)
  c.querySelectorAll('button.play').forEach((b) => { b.onclick = () => window.open(new URL(ex.labs[+b.dataset.i].url, location.href).href, '_blank'); });
  $('back').onclick = async () => { c.style.display = 'none'; if (NODE) setHash(NODE.id); if (f) await playFrames(f, true); hideClip(); BUSY = false; draw(); };
  if (ex.secret) $('secret').onclick = async () => {
    c.style.display = 'none'; if (f) await playFrames(f, true); BUSY = false;
    const cut = NODE.hotspots.find((h) => h.kind === 'cut'); if (cut) act(cut);
  };
}

// ------------------------------------------------------------------ input
let drag = null;
$('gl').addEventListener('pointerdown', (e) => { if (BUSY) return; drag = [e.clientX, e.clientY, YAW, PITCH]; $('gl').classList.add('drag'); $('gl').setPointerCapture(e.pointerId); });
$('gl').addEventListener('pointermove', (e) => {
  if (!drag) return; const c = $('gl'); const k = HFOV / c.clientWidth;
  YAW = (drag[2] - (e.clientX - drag[0]) * k + 360) % 360; PITCH = Math.max(-80, Math.min(80, drag[3] + (e.clientY - drag[1]) * k)); draw();
});
window.addEventListener('pointerup', () => { drag = null; $('gl').classList.remove('drag'); });
$('gl').addEventListener('wheel', (e) => { HFOV = Math.max(40, Math.min(100, HFOV + e.deltaY * 0.03)); draw(); e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', async (e) => {
  if (window.UI && UI.handleKey(e)) return;
  if (e.key === 'Escape' && !BUSY) { $('card').style.display = 'none'; await goNode(LEVEL.door, LEVEL.nodes[LEVEL.door].heading); }
  if (e.key === 'ArrowLeft') { YAW = (YAW - 5 + 360) % 360; draw(); } if (e.key === 'ArrowRight') { YAW = (YAW + 5) % 360; draw(); }
});
window.addEventListener('resize', () => { resize(); draw(); });

// ------------------------------------------------------------------ boot (1110): ui.js runs the house boot flow
// (CK logo -> attract -> title -> PRESS -> menu); nothing starts walking until the player picks ENTER THE ARCADE.
// A #node hash still drops straight in (a shareable start-anywhere link).
async function playIntro() {
  const intro = clipFrames(LEVEL.intro);
  if (!intro || SETTINGS.skipCuts) return;
  $('load').textContent = 'loading…'; const ims = await Promise.all(intro.map(img)); $('load').textContent = '';
  BUSY = true; $('skip').style.display = 'block';
  let skipped = false; $('skip').onclick = () => { skipped = true; };
  const c = $('clip'); c.style.opacity = 1;
  for (const im of ims) { if (skipped) break; const k = Math.max(c.width / im.width, c.height / im.height);
    cctx.drawImage(im, (c.width - im.width * k) / 2, (c.height - im.height * k) / 2, im.width * k, im.height * k); await sleep(1000 / FPS); }
  $('skip').style.display = 'none'; BUSY = false;
}
async function enterArcade() { await playIntro(); await goNode(LEVEL.start); }
async function showPano(id, yaw) {          // attract: a node's panorama with no hotspots
  const n = LEVEL.nodes[id]; if (!n) return; const im = await img(panoOf(n)); setTexture(im);
  NODE = null; YAW = yaw == null ? n.heading : yaw; PITCH = -2; $('hots').innerHTML = ''; hideClip(); draw();
}
function setView(yaw, pitch) { YAW = yaw; if (pitch != null) PITCH = pitch; draw(); }
window.WALK = { goNode, enterArcade, showPano, setView, draw, get LEVEL() { return LEVEL; }, get NODE() { return NODE; },
                get BUSY() { return BUSY; }, get SEEN_SECRET() { return SEEN_SECRET; }, get YAW() { return YAW; }, SETTINGS,
                openCard, closeCard: () => { if ($('card').style.display === 'block' && NODE) setHash(NODE.id); $('card').style.display = 'none'; hideClip(); BUSY = false; } };
(async function boot() {
  resize();
  LEVEL = await (await fetch('data/level.json')).json(); HFOV = LEVEL.hfov || 75;
  if (window.GW) await GW.init(LEVEL);          // 1119: the GATEWAY atrium's variants (data/gateway.json), if packed
  // 1125: #node or #node/exhibit (a card link; #exhibit alone finds its stop). Anything else boots the house flow.
  const want = deepLink(location.hash);
  if (want) { if (window.UI) UI.skipBoot(); await goNode(want.node); if (want.exhibit) await openCard(want.exhibit); }
  else if (window.UI) UI.boot(); else await enterArcade();
  window.addEventListener('hashchange', async () => {        // a pasted / edited link while the walk is open
    const w = deepLink(location.hash); if (!w) return;
    if ($('card').style.display === 'block') { $('card').style.display = 'none'; hideClip(); BUSY = false; }
    if (BUSY) return;
    if (NODE && w.node === NODE.id && !w.exhibit) return;
    if (window.UI && UI.jump) await UI.jump(w.node, w.exhibit); else { await goNode(w.node); if (w.exhibit) await openCard(w.exhibit); }
  });
})();
function deepLink(hash) {
  const p = window.HYPLACES ? HYPLACES.parse(hash) : (hash && hash.length > 1 ? { node: hash.slice(1).split('/')[0], exhibit: hash.slice(1).split('/')[1] || '' } : null);
  if (!p) return null;
  let node = p.node, ex = p.exhibit;
  if (!LEVEL.nodes[node] && LEVEL.exhibits[node]) { ex = node; node = LEVEL.exhibits[node].node; }
  if (!LEVEL.nodes[node]) return null;
  if (ex && !LEVEL.exhibits[ex]) ex = '';
  return { node, exhibit: ex };
}
