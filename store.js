// HYSCORE 1124 — THE ANDERS & PARTNERS STORE in the walk (blender/store1124.py; packed by tools/store1124_pack.py).
// OFF unless the page is opened with ?store (the local STORE PREVIEW launcher in walk/) AND data/store.json
// exists. When on, it merges the store into the level before the walk starts: its two stops, the moves through the
// new doorway, the Palace panoramas/moves that now show that doorway, the rings to and from it, its inspect cards and
// its map zone. Nothing else changes; without ?store the walk is exactly the shipped one.
'use strict';
(function () {
  const ON = /[?&]store(=1|&|$)/.test(location.search);
  if (!ON || !window.GW) return;
  const orig = GW.init.bind(GW);
  GW.init = async function (L) {
    await orig(L);
    let S = null;
    try { const r = await fetch('data/store.json'); if (!r.ok) return; S = await r.json(); } catch (e) { return; }
    Object.assign(L.clips = L.clips || {}, S.clips);
    Object.assign(L.exhibits = L.exhibits || {}, S.exhibits);
    for (const [id, n] of Object.entries(S.nodes)) L.nodes[id] = Object.assign({ id }, n);
    for (const [id, p] of Object.entries(S.pano_override || {})) if (L.nodes[id]) L.nodes[id].pano = p;
    const swap = (o) => {             // every move that now sees the doorway plays its re-render
      if (Array.isArray(o)) return o.forEach(swap);
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        if (k === 'clip' && S.clip_override[o[k]]) o[k] = S.clip_override[o[k]]; else swap(o[k]);
      }
    };
    for (const id of Object.keys(L.nodes)) if (!S.nodes[id]) swap(L.nodes[id]);
    for (const [id, add] of Object.entries(S.add || {})) {
      const n = L.nodes[id]; if (!n) continue;
      if (add.nav) n.nav = (n.nav || []).concat(add.nav);
      if (add.hotspots) n.hotspots = (n.hotspots || []).concat(add.hotspots);
    }
    if (S.zone) (L.zones = L.zones || []).push(S.zone);
    Object.assign(L.rooms = L.rooms || {}, S.rooms || {});
    console.log('[store] merged', Object.keys(S.nodes).length, 'stops');
  };
})();
