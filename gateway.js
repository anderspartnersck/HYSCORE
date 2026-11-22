// HYSCORE 1119 — THE GATEWAY ATRIUM in the walk (Joe 1119: walking into the Gateway = "a more cavernous room that
// changes to your needs ... the tower or the ocean of oil ... the strand can be the building itself").
// data/gateway.json (tools/pack_gateway.py) carries the atrium's VARIANTS (ersn / oil / strand): per variant a panorama
// for each atrium node and its own moves; plus the atrium's second stop (gateway_floor) and the three game tables.
// The room you walk into = the CURRENT variant. It rotates each visit (ER$N gateway backdrops: "ENVS rotate"), and
// choosing a game (its table, or its marquee plate at the top of the view) turns the atrium into that game's.
// walk.js calls in through window.GW (pano / clip / init / arrive / inspect); without data/gateway.json nothing changes.
'use strict';
(function () {
  let G = null, VAR = null, IN = false, ROT = 0;
  const isGW = (id) => !!(G && G.nodes[id]);
  const GW = {
    get on() { return !!G; }, get variant() { return VAR; },
    pano(n) { const g = G && n && G.nodes[n.id]; return g && g.panos && g.panos[VAR] ? g.panos[VAR] : null; },
    clip(path) {                                   // a move into / inside the atrium plays the current variant's render
      if (!G) return path; const m = G.clip_map[path]; if (!m) return path;
      const p = `data/gateway/${VAR}/clips/${m}`; return G.clips[p] ? p : path;
    },
    async init(L) {
      try { const r = await fetch('data/gateway.json'); if (!r.ok) return; G = await r.json(); } catch (e) { G = null; return; }
      VAR = G.order[0];
      Object.assign(L.clips = L.clips || {}, G.clips);
      for (const [id, g] of Object.entries(G.nodes)) {          // the atrium's own stops (merged over level.json)
        const n = L.nodes[id] || (L.nodes[id] = { id, hotspots: [] });
        for (const k of ['area', 'pos', 'heading', 'pitch0']) if (g[k] != null) n[k] = g[k];
        if (!n.pano) n.pano = g.panos[VAR];
        if (g.hotspots) n.hotspots = n.hotspots.filter((h) => h.kind !== 'inspect' || !g.hotspots.some((x) => x.exhibit === h.exhibit))
          .concat(g.hotspots.filter((x) => x.kind !== 'inspect' || L.exhibits[x.exhibit]));
        if (g.nav_add) n.nav = (n.nav || []).concat(g.nav_add);
        if (g.nav_from) {          // this stop's rings = a step back to `via`, then every room ring `via` has
          const via = L.nodes[g.nav_from.via], step = g.nav_from.step;
          n.nav = [Object.assign({}, g.nav_from.spot)].concat((via.nav || []).filter((r) => r.kind === 'room')
            .map((r) => Object.assign({}, r, { route: [step].concat(r.route), dist: (r.dist || 0) + 7.5, yaw: step.yaw, aim: step.yaw })));
        }
      }
      sel();
    },
    arrive(n, prev) {                              // landing on a node: the plates show in the atrium; leaving rotates
      const inNow = isGW(n.id);
      if (IN && !inNow && G.default === 'rotate') { ROT = (ROT + 1) % G.order.length; VAR = G.order[ROT]; }
      IN = inNow; plates();
      if (inNow) for (const v of G.order) { const p = G.nodes[n.id].panos[v]; if (p) img(p); }      // the other rooms, ready
    },
    async inspect(hs) {                            // a game's table chooses its room
      const v = G && Object.keys(G.variants).find((k) => G.variants[k].exhibit === hs.exhibit);
      if (v && v !== VAR && NODE && isGW(NODE.id)) await choose(v);
    },
    choose: (v) => choose(v),
  };
  async function choose(v) {
    if (!G || !G.variants[v] || v === VAR) return;
    VAR = v; ROT = G.order.indexOf(v); plates();
    if (!NODE || !isGW(NODE.id)) return;
    const f = document.getElementById('fade'), p = GW.pano(NODE);
    const im = img(p); f.classList.add('on'); await new Promise((r) => setTimeout(r, 470));
    setTexture(await im); draw(); f.classList.remove('on');
    const s = document.getElementById('sub'); if (s) s.textContent = G.variants[v].sub;
  }
  // the selectables: three lit marquee plates (the HYSCORE cab marquee: a dark board, chasing bulbs, the game's own
  // colour), top centre, only while you stand in the atrium
  function sel() {
    if (document.getElementById('gwsel')) return;
    const st = document.createElement('style');
    st.textContent = `
#gwsel { position:absolute; left:50%; top:10px; transform:translateX(-50%); display:none; gap:8px; z-index:2; pointer-events:auto; }
#gwsel.on { display:flex; }
body:not([data-mode="walk"]) #gwsel { display:none; }
.gwp { position:relative; min-width:118px; padding:8px 14px 7px; cursor:pointer; text-align:center; user-select:none;
  background:linear-gradient(#1c130a, #070504 70%); border:2px solid var(--pc); color:#fff3d6;
  box-shadow:0 0 8px var(--pc), inset 0 0 14px rgba(0,0,0,.9); text-shadow:0 0 4px var(--pc), 0 1px 2px #000; }
.gwp::before { content:''; position:absolute; inset:3px; border:2px dotted var(--pc); opacity:.55; pointer-events:none; }
.gwp b { display:block; font-weight:900; font-size:12px; letter-spacing:.2em; }
.gwp i { display:block; font-style:normal; font-size:8.5px; letter-spacing:.28em; opacity:.75; margin-top:2px; }
.gwp:hover { filter:brightness(1.25); }
.gwp.on { box-shadow:0 0 16px var(--pc), 0 0 34px var(--pc), inset 0 0 12px rgba(0,0,0,.6); }
.gwp.on::before { opacity:1; animation:gwchase .5s steps(2) infinite; }
@keyframes gwchase { 50% { border-style:dashed; } }
@media (max-width:700px) { .gwp { min-width:84px; padding:6px 8px 5px; } .gwp b { font-size:10px; letter-spacing:.12em; } .gwp i { display:none; } }`;
    document.head.appendChild(st);
    const box = document.createElement('div'); box.id = 'gwsel';
    for (const v of G.order) {
      const d = G.variants[v], el = document.createElement('div');
      el.className = 'gwp'; el.dataset.v = v; el.style.setProperty('--pc', d.color);
      el.innerHTML = `<b>${d.label}</b><i>${d.sub}</i>`;
      el.onclick = (e) => { e.stopPropagation(); if (!BUSY) choose(v); };
      box.appendChild(el);
    }
    document.getElementById('frame').appendChild(box);
  }
  function plates() {
    const box = document.getElementById('gwsel'); if (!box) return;
    box.classList.toggle('on', IN);
    for (const el of box.children) el.classList.toggle('on', el.dataset.v === VAR);
    if (IN && NODE) { const s = document.getElementById('sub'); if (s) s.textContent = G.variants[VAR].sub; }
  }
  window.GW = GW;
})();
