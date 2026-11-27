// HYSCORE 1125 — PLACES: the readable names of the walk's stops, their grouping, the deep-link format and the copy-link
// helper. Shared by the walk (ui.js map + list, walk.js cards) and THE DIRECTORY (directory.html). Data only comes from
// data/level.json (+ data/gateway.json) at load; nothing here is stored anywhere (no localStorage, no cookies).
//   deep link:  index.html#<node>            = stand at that stop
//               index.html#<node>/<exhibit>  = stand there with that game card open
// Hidden stops stay hidden: the door (the intro), the store (?store only) and the private stairs + the Keep until you
// have been through the secret door (the walk passes `seen`; the directory never lists them).
'use strict';
(function () {
  const NAMES = {
    ext_101: 'OFF THE 101', ext_lot: 'THE LOT',
    lobby: 'THE LOBBY', lobby_n: 'LOBBY · NORTH', window_area: 'MERC ZEBRA ROW',
    food_entry: "POP-UP · ENTRANCE", food_court: "PATTY'S POP-UP", food_counter: 'CASTLE GRILLSCREEN',
    crossroads: 'THE MAIN FLOOR', blacklight: 'BLACKLIGHT AREA', air_hockey: 'THE AIR-HOCKEY TABLES', ht_row: 'THE HIGH TABLE ROW',
    grove_entry: 'GROVE · ENTRANCE', grove_mid: 'GNOME GROVE',
    forest_entry: 'FOREST · ENTRANCE', forest_mid: 'THE FOREST FLOOR', forest_welcome: 'THE RULES', forest_aisle: 'FOREST · AISLE',
    onetimer_1up: 'THE LONE 1-UP',
    palace_entry: 'MEAN STREETS CORNER', palace_mid: "COLEMAN'S PALACE", palace_trasimene: "TRASIMENE'S DREAM",
    hallway: 'THE HALLWAY', hallway_mid: 'THE MARBLE HALLWAY',
    gateway: 'HYSCORE GATEWAY', gateway_floor: 'THE GAME TABLES',
    stairs_bottom: 'THE STAIRS · BOTTOM', stairs_top: 'THE STAIRS · TOP', keep: "COLEMAN'S KEEP", keep_window: 'THE KEEP WINDOW',
  };
  const GROUP = { 'OFF THE 101': 'OUTSIDE', 'THE LOT': 'OUTSIDE' };
  const ORDER = ['OUTSIDE', 'LOBBY', 'MERC ZEBRA ROW', "PATTY'S POP-UP", 'MAIN FLOOR', 'BLACKLIGHT AREA', 'GNOME GROVE', 'HYSCORE FOREST',
                 "COLEMAN'S PALACE", 'THE HALLWAY', 'HYSCORE GATEWAY', 'THE PRIVATE STAIRS', "COLEMAN'S KEEP"];
  const COL = { 'OUTSIDE': '#a99cc8', 'LOBBY': '#ff3fb4', 'MERC ZEBRA ROW': '#ff3fb4', 'MAIN FLOOR': '#c99bff', "PATTY'S POP-UP": '#ff8a3d', 'BLACKLIGHT AREA': '#a06bff',
                'GNOME GROVE': '#d27bff', 'HYSCORE FOREST': '#53ff8a', "COLEMAN'S PALACE": '#f0b04c', 'THE HALLWAY': '#e8c066', 'HYSCORE GATEWAY': '#e8c066',
                'THE PRIVATE STAIRS': '#53ff8a', "COLEMAN'S KEEP": '#53ff8a' };
  const SECRET = /^(stairs_|keep)/;
  const tidy = (id) => String(id).replace(/_/g, ' ').toUpperCase();
  function label(L, id) { return NAMES[id] || ((L.rooms || {})[id] || {}).name || tidy(id); }
  function group(n) { return GROUP[n.area] || n.area || 'HYSCORE'; }
  function hidden(id, seen) { return id === 'door' || /^store_/.test(id) || (!seen && SECRET.test(id)); }
  // a public PLAY link: a live site (https) or a machine page shipped in the bundle; local dev paths never show
  function publicLabs(ex) { return (ex.labs || []).filter((l) => /^https:\/\//.test(l.url) || /^machines\//.test(l.url)); }
  // the stops, grouped by area in walking order: [{area, col, stops:[{id, name, node, cards:[exhibit]}]}]
  function groups(L, seen) {
    const by = {};
    for (const n of Object.values(L.nodes)) {
      if (hidden(n.id, seen)) continue;
      const g = group(n); (by[g] = by[g] || []).push(n);
    }
    const cards = {};
    for (const e of Object.values(L.exhibits || {})) if (e.node) (cards[e.node] = cards[e.node] || []).push(e);
    const keys = Object.keys(by).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    return keys.map((g) => ({ area: g, col: COL[g] || '#b36bff',
      stops: by[g].sort((a, b) => (a.pos ? a.pos[1] : 0) - (b.pos ? b.pos[1] : 0)).map((n) => ({ id: n.id, name: label(L, n.id), node: n,
        cards: (cards[n.id] || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title))) })) }));
  }
  // deep links
  function parse(hash) {
    const h = String(hash || '').replace(/^#/, ''); if (!h) return null;
    const [a, b] = h.split('/').map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    return { node: a || '', exhibit: b || '' };
  }
  function hashFor(node, exhibit) { return '#' + encodeURIComponent(node) + (exhibit ? '/' + encodeURIComponent(exhibit) : ''); }
  function linkFor(node, exhibit) { return location.href.split('#')[0] + hashFor(node, exhibit); }
  // copy to the clipboard (the Clipboard API; a select-and-copy fallback for older / insecure pages). Nothing is stored.
  async function copy(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }
  let toastT = 0;
  function toast(msg, host) {
    let t = document.getElementById('hy-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'hy-toast';
      t.style.cssText = 'position:absolute;left:50%;top:14%;transform:translateX(-50%);z-index:20;pointer-events:none;max-width:90%;' +
        'background:rgba(14,8,26,.94);border:1px solid #53ff8a;color:#efe6ff;border-radius:8px;padding:8px 14px;font:12px/1.4 "Helvetica Neue",Arial,sans-serif;' +
        'letter-spacing:.08em;box-shadow:0 0 14px rgba(83,255,138,.35);transition:opacity .3s;opacity:0;word-break:break-all;text-align:center';
      (host || document.getElementById('frame') || document.body).appendChild(t);
    }
    t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, 2600);
  }
  async function share(node, exhibit, host) {
    const url = linkFor(node, exhibit), ok = await copy(url);
    toast(ok ? 'LINK COPIED · ' + url : 'COPY THIS LINK · ' + url, host); return ok;
  }
  window.HYPLACES = { NAMES, COL, SECRET, label, group, hidden, groups, publicLabs, parse, hashFor, linkFor, copy, toast, share };
})();
