// HYSCORE WALK — LIVE WINDOWS (1119, Joe: "replace that with a window of game action with our game sprites cooking
// burgers and billy grabbing burgers and disappearing out the back or serving an area of patrons you cant access").
// The pop-up's kitchen is a pass-through window in its back wall. Through it: the PATTY MELT HEROES ink cast at work,
// drawn live from the game's own sprites (data/live/*.webp): Chrissy at the flat-top with TWO spatulas (cheese, flip),
// Patty on the second griddle, the burgers stacking on the pass under the heat lamp, and BILLY coming in the back door,
// grabbing a burger off the pass, then either ducking out the back again or carrying it off to the student section
// (out of frame: a place you can see served, never walk to). One 512x160 canvas, 12 drawings a second, a 10 s loop.
// The panorama under it carries a still of the same scene (Blender's window quad), so moves (pre-rendered clips) match.
// level.json `live`: [{id, quad: [[x,y,z] TL, TR, BR, BL] in metres, nodes: [ids that see it unobstructed]}].
'use strict';
(function () {
  const W = 512, H = 160, FPS = 12, LOOP = 10;
  const NAMES = ['chrissyB-cheese', 'chrissy-cheese', 'patty-serve', 'patty-idle', 'billyH-serve', 'billyH-turn', 'patty-done', 'patty-seared', 'patty-raw',
                 'bread', 'cheese-melting'].concat([0, 1, 2, 3, 4, 5].map((i) => 'billyH-walk-' + i));
  const SP = {}; let ready = null;
  function load(base) {
    if (ready) return ready;
    ready = Promise.all(NAMES.map((n) => new Promise((res) => { const i = new Image(); i.onload = () => { SP[n] = i; res(); }; i.onerror = () => res(); i.src = base + n + '.webp'; })));
    return ready;
  }
  const ease = (t) => t * t * (3 - 2 * t), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function spr(c, n, x, y, h, flip = false, alpha = 1) {      // x = centre, y = feet (bottom)
    const im = SP[n]; if (!im) return; const w = im.width * h / im.height;
    c.save(); c.globalAlpha = alpha; c.translate(x, y); if (flip) c.scale(-1, 1); c.drawImage(im, -w / 2, -h, w, h); c.restore();
  }
  function burger(c, x, y, s = 1) {                          // a cheeseburger built from the game's own grill pieces
    const b = SP.bread, p = SP['patty-done'], ch = SP['cheese-melting'];
    const bw = 30 * s;
    if (b) c.drawImage(b, x - bw / 2, y - 7 * s, bw, 7 * s);
    if (p) c.drawImage(p, x - bw * 0.48, y - 14 * s, bw * 0.96, 8 * s);
    if (ch) c.drawImage(ch, x - bw * 0.5, y - 16 * s, bw, 5 * s);
    if (b) { c.save(); c.translate(x, y - 16 * s); c.scale(1, -1); c.drawImage(b, -bw / 2, -9 * s, bw, 9 * s); c.restore(); }
  }
  function room(c, t) {
    // back wall: COUGARS navy tile, gold grout, the hood's light falling down it
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b2a55'); g.addColorStop(1, '#0c1430'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(214,170,70,.13)'; c.lineWidth = 1;
    for (let x = 0; x <= W; x += 18) { c.beginPath(); c.moveTo(x + .5, 22); c.lineTo(x + .5, H); c.stroke(); }
    for (let y = 22; y <= H; y += 18) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(W, y + .5); c.stroke(); }
    const hood = c.createLinearGradient(0, 0, 0, 24); hood.addColorStop(0, '#5b6068'); hood.addColorStop(.6, '#9aa0a8'); hood.addColorStop(1, '#3a3e45');
    c.fillStyle = hood; c.fillRect(0, 0, W, 22);
    const lt = c.createRadialGradient(250, 20, 10, 250, 40, 260); lt.addColorStop(0, 'rgba(255,214,150,.30)'); lt.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = lt; c.fillRect(0, 0, W, H);
    // the back door (right): Billy's way in and out
    c.fillStyle = '#3a2416'; c.fillRect(440, 34, 58, H - 34); c.fillStyle = '#07080c'; c.fillRect(446, 40, 46, H - 40);
    const dl = c.createLinearGradient(446, 0, 492, 0); dl.addColorStop(0, 'rgba(120,150,200,.10)'); dl.addColorStop(1, 'rgba(120,150,200,.02)'); c.fillStyle = dl; c.fillRect(446, 40, 46, H - 40);
    c.font = 'bold 10px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ff3b30'; c.shadowColor = '#ff3b30'; c.shadowBlur = 8; c.fillText('EXIT', 469, 31); c.shadowBlur = 0;
    // the GO COUGARS pennant
    c.fillStyle = '#e2b13c'; c.beginPath(); c.moveTo(214, 30); c.lineTo(296, 38); c.lineTo(214, 48); c.closePath(); c.fill();
    c.fillStyle = '#13214a'; c.font = 'bold 8px Helvetica, Arial, sans-serif'; c.textAlign = 'left'; c.fillText('GO COUGARS!', 218, 42);
    // the pass (left) under its heat lamp
    const hl = c.createRadialGradient(62, 52, 4, 62, 80, 90); hl.addColorStop(0, 'rgba(255,140,40,.55)'); hl.addColorStop(1, 'rgba(255,120,30,0)'); c.fillStyle = hl; c.fillRect(0, 22, 160, 120);
    c.fillStyle = '#2b2b2f'; c.fillRect(56, 22, 12, 16); c.fillStyle = '#ffb04a'; c.fillRect(46, 38, 32, 4);
    c.fillStyle = '#b9bec6'; c.fillRect(8, 100, 112, 5); c.fillStyle = '#6d7279'; c.fillRect(8, 105, 112, 3);
  }
  function grill(c, t) {                                   // Patty's griddle (Chrissy's sprite brings her own)
    c.fillStyle = '#16171a'; c.fillRect(300, 112, 128, 10);
    const stages = ['patty-raw', 'patty-seared', 'patty-done'];
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.35 + i * 0.27) % 1, st = stages[Math.min(2, Math.floor(ph * 3))], im = SP[st];
      if (im) c.drawImage(im, 306 + i * 30, 104, 26, 9);
    }
    const f = c.createLinearGradient(0, 122, 0, H); f.addColorStop(0, '#8f949b'); f.addColorStop(1, '#3f4349'); c.fillStyle = f; c.fillRect(296, 122, 136, H - 122);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(296, 122, 136, 2);
  }
  function steam(c, t) {
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.4 + i * 0.37) % 1, x = (i < 4 ? 196 + i * 18 : 300 + (i - 4) * 28) + Math.sin(t * 2 + i) * 4, y = 108 - ph * 70;
      c.fillStyle = `rgba(235,235,240,${0.16 * (1 - ph)})`; c.beginPath(); c.arc(x, y, 6 + ph * 10, 0, Math.PI * 2); c.fill();
    }
  }
  function billy(c, t, loop) {
    const walk = (k) => 'billyH-walk-' + (Math.floor(k * 10) % 6), Hb = 112, Y = H - 2;
    let onPass = 3;
    if (t < 2.6) { const x = 470 - ease(t / 2.6) * 340; spr(c, walk(t), x, Y, Hb, true, clamp((470 - x) / 18, 0, 1)); }
    else if (t < 3.8) { spr(c, t < 3.0 ? 'billyH-turn' : 'billyH-serve', 128, Y, Hb, true); if (t >= 3.0) onPass = 2; }
    else if (t < 6.6) {
      onPass = 2; const k = ease((t - 3.8) / 2.8);
      if (loop % 2 === 0) {                                // out the back door with it
        const x = 128 + k * 342, a = clamp((470 - x) / 24, 0, 1);
        spr(c, walk(t), x, Y, Hb, false, a); c.save(); c.globalAlpha = a; burger(c, x + 26, Y - Hb * 0.62, 0.8); c.restore();
      } else {                                             // off to the student section (out of frame, left)
        const x = 128 - k * 200; spr(c, walk(t), x, Y, Hb, true); burger(c, x - 26, Y - Hb * 0.62, 0.8);
      }
    } else onPass = t < 7.6 ? 2 : 3;
    return onPass;
  }
  function frame(c, time) {
    const T = time % LOOP, loop = Math.floor(time / LOOP);
    room(c, T);
    // Patty works the second griddle (shifting her weight), Chrissy cheeses + flips at the first, two spatulas each
    spr(c, Math.floor(time * 0.8) % 2 ? 'patty-serve' : 'patty-idle', 364, H + 34, 150);
    grill(c, time);
    spr(c, Math.floor(time * 3) % 2 ? 'chrissyB-cheese' : 'chrissy-cheese', 232, H + 6, 128);
    steam(c, time);
    const n = billy(c, T, loop);
    // the pass: the burgers waiting (drawn over Billy's legs: he reaches over the shelf)
    for (let i = 0; i < n; i++) burger(c, 30 + i * 34, 100, 0.95);
    // the window's own depth: a soft inner shadow so the scene sits behind the glass line
    const v = c.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(.18, 'rgba(0,0,0,0)'); v.addColorStop(.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.3)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }
  // ---------------------------------------------------------------- the overlay in the walk
  function homography(src, dst) {   // 4 point pairs -> 3x3 (row-major), solving the 8x8 system
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let i = 0; i < 8; i++) {      // gaussian elimination
      let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = 0; r < 8; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let k = i; k < 8; k++) A[r][k] -= f * A[i][k]; b[r] -= f * b[i]; }
    }
    const h = b.map((v, i) => v / A[i][i]); return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  let canvas = null, ctx = null, cur = null, raf = 0, last = 0, t0 = performance.now();
  function el() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.id = 'live';
    canvas.style.cssText = `position:absolute;inset:auto;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;pointer-events:none;display:none;`;   // (the page's canvas rule stretches canvases to the frame)
    const hots = document.getElementById('hots'); hots.parentNode.insertBefore(canvas, hots); ctx = canvas.getContext('2d'); return canvas;
  }
  function tick(now) {
    raf = 0; if (!cur || canvas.style.display === 'none') return;
    if (now - last >= 1000 / FPS) { last = now; frame(ctx, (now - t0) / 1000); }
    raf = requestAnimationFrame(tick);
  }
  // place(project): project(yaw, pitch) -> [fx, fy] screen fraction or null; called on every redraw of the panorama
  function place(node, project, busy) {
    const L = window.WALK && WALK.LEVEL; el();
    cur = node && L && (L.live || []).find((w) => w.nodes.indexOf(node.id) >= 0) || null;
    if (!cur || busy) { canvas.style.display = 'none'; return; }
    const fr = document.getElementById('hots').getBoundingClientRect(), p = node.pos, pts = [];
    for (const q of cur.quad) {
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
      const yaw = Math.atan2(dx, dy) * 180 / Math.PI, pitch = Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI;
      const s = project((yaw + 360) % 360, pitch, true); if (!s) { canvas.style.display = 'none'; return; }
      pts.push([s[0] * fr.width, s[1] * fr.height]);
    }
    const h = homography([[0, 0], [W, 0], [W, H], [0, H]], pts);
    canvas.style.transform = `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,${h[8]})`;
    canvas.style.display = '';
    load('data/live/').then(() => { if (!raf) raf = requestAnimationFrame(tick); });
  }
  window.LIVE = { place, frame, load, W, H };
})();
