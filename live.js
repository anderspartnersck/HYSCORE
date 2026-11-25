// HYSCORE WALK — THE POP-UP's WINDOW (1119 live window; 1125 Joe: the HEROES / GO COUGARS cafeteria with the kid Billy
// "is redundant" — the kid is retired and never appears). Through the pass-through window in the pop-up's back wall: the
// PATTY MELT DINER as it ships now (the live 3D game's kitchen | dining room, data/live/diner_window.webp, captured from
// anderspartnersck.github.io/PATTYMELT/3d/ and cut by tools/fogfire1125_prep.py). The panorama under it carries the same
// still (Blender's window quad, refs/live_popup_window.png), so the pre-rendered moves match; this layer only keeps it crisp.
// level.json `live`: [{id, quad: [[x,y,z] TL, TR, BR, BL] in metres, nodes: [ids that see it unobstructed]}].
'use strict';
(function () {
  const W = 1024, H = 320;
  let IM = null, ready = null;
  function load(base) {
    if (ready) return ready;
    ready = new Promise((res) => { const i = new Image(); i.onload = () => { IM = i; res(); }; i.onerror = () => res(); i.src = base + 'diner_window.webp'; });
    return ready;
  }
  function frame(c) {
    if (IM) c.drawImage(IM, 0, 0, W, H); else { c.fillStyle = '#120c0a'; c.fillRect(0, 0, W, H); }
    const v = c.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.30)'); v.addColorStop(.15, 'rgba(0,0,0,0)'); v.addColorStop(.88, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.25)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }
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
  let canvas = null, ctx = null, cur = null, raf = 0;
  function el() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; canvas.id = 'live';
    canvas.style.cssText = `position:absolute;inset:auto;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;pointer-events:none;display:none;`;   // (the page's canvas rule stretches canvases to the frame)
    const hots = document.getElementById('hots'); hots.parentNode.insertBefore(canvas, hots); ctx = canvas.getContext('2d'); return canvas;
  }
  function tick() {                                       // a still: drawn once per placement (no per-frame work)
    raf = 0; if (!cur || canvas.style.display === 'none') return; frame(ctx);
  }
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
