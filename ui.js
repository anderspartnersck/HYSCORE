// HYSCORE WALK — the front end (1110). The house boot flow, kept simple:
//   CK LOGO -> ATTRACT (a slow drift through the public rooms) -> TITLE -> PRESS ENTER -> MENU
//   MENU: ENTER THE ARCADE · MAP · DIRECTORY (directory.html, 1125) · SETTINGS · QUIT (back to the logos)
// Nothing starts on its own: the walk begins only from ENTER THE ARCADE (or a MAP jump). Idle on the title/menu
// returns to attract; idle while walking does nothing. In the walk: Esc = PAUSE (resume / map / settings / back to the
// door / quit to title / copy this spot's link), M = MAP (labelled rings + a LIST of rooms, stops and cards; 1125). SETTINGS: sound on/off, skip cut scenes. Session only (the web build saves nothing).
// The MAP never shows the private stair or the Keep until you have been through the secret door.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const W = () => window.WALK;
  let MODE = 'boot', idleT = 0, attractT = null, attractRaf = 0, lastInput = performance.now();
  const PUBLIC_TOUR = ['lobby', 'forest_mid', 'blacklight', 'grove_mid', 'food_court', 'palace_mid', 'palace_trasimene', 'window_area', 'hallway_mid', 'gateway', 'forest_entry', 'air_hockey'];
  const SECRET = /^(stairs_|keep)/;
  // ---------------------------------------------------------------- sound (WebAudio, synthesized: blips + a low room tone)
  let AC = null, tone = null;
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } return AC; }
  function blip(kind) {
    if (!W() || !W().SETTINGS.sound || !ac()) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    const f = { move: 520, ok: 780, back: 330, step: 240, cut: 160 }[kind] || 600;
    o.type = kind === 'cut' ? 'sawtooth' : 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (kind === 'back' ? 0.7 : 1.4), t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'cut' ? 0.05 : 0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'cut' ? 0.5 : 0.12));
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.6);
  }
  function roomTone(on) {
    if (!ac()) return;
    if (on && !tone) {
      const len = AC.sampleRate * 2, b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(); src.buffer = b; src.loop = true;
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const hum = AC.createOscillator(); hum.frequency.value = 60; const hg = AC.createGain(); hg.gain.value = 0.006;
      const g = AC.createGain(); g.gain.value = 0.018;
      src.connect(lp).connect(g).connect(AC.destination); hum.connect(hg).connect(AC.destination); src.start(); hum.start();
      tone = { src, hum };
    } else if (!on && tone) { try { tone.src.stop(); tone.hum.stop(); } catch (e) {} tone = null; }
  }
  if (window.CKBoot) CKBoot.onUnlock(() => { const a = ac(); if (a && W() && W().SETTINGS.sound) a.resume().catch(() => {}); });   // CK BOOT: first press = sound on
  function applySound() { const on = W().SETTINGS.sound; roomTone(on && MODE !== 'boot'); if (AC) (on ? AC.resume() : AC.suspend()).catch(() => {}); }
  // ---------------------------------------------------------------- screens
  function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); document.body.dataset.mode = MODE; }
  function hideAll() { show(null); }
  function stopAttract() { clearTimeout(attractT); cancelAnimationFrame(attractRaf); attractT = null; }
  async function logos() {
    MODE = 'logos'; show('s-logos'); stopAttract();
    // CK BOOT STANDARD (ANDERS CASTLE KILLSCREEN/BOOT-STANDARD.md): the logos play out; presses are eaten (they still wake the sound)
    if (window.CKBoot) CKBoot.hold(Infinity);
    await new Promise((r) => setTimeout(r, 2600));
    if (window.CKBoot) CKBoot.release();
    if (MODE === 'logos') attract();
  }
  function attract() { MODE = 'attract'; show('s-attract'); startTour(); }
  function startTour() {
    let k = Math.floor(Math.random() * PUBLIC_TOUR.length);
    const L = W().LEVEL;
    const next = async () => {
      if (MODE !== 'attract' && MODE !== 'title' && MODE !== 'menu') return;
      const id = PUBLIC_TOUR[k++ % PUBLIC_TOUR.length]; if (!L.nodes[id]) return next();
      $('fade').classList.add('on'); await new Promise((r) => setTimeout(r, 450));
      await W().showPano(id, (L.nodes[id].heading - 40 + 360) % 360); $('fade').classList.remove('on');
      attractT = setTimeout(next, 9000);
    };
    const drift = (now) => { if (MODE === 'walk' || MODE === 'pause') return; W().setView((W().YAW + 0.045) % 360); attractRaf = requestAnimationFrame(drift); };
    stopAttract(); next(); attractRaf = requestAnimationFrame(drift);
  }
  function title() { MODE = 'title'; show('s-title'); if (!attractT) startTour(); blip('ok'); applySound(); }
  function menu() { MODE = 'menu'; show('s-menu'); focusFirst('s-menu'); blip('ok'); }
  async function startWalk() {
    MODE = 'walk'; stopAttract(); hideAll(); applySound(); blip('ok'); await W().enterArcade();
  }
  function pause() { if (MODE !== 'walk' || W().BUSY) return; MODE = 'pause'; show('s-pause'); focusFirst('s-pause'); blip('move'); }
  function resume() { MODE = 'walk'; hideAll(); blip('back'); W().draw(); }
  function quitToTitle() { W().closeCard(); MODE = 'title'; roomTone(false); show('s-title'); startTour(); blip('back'); }
  // ---------------------------------------------------------------- settings
  let settingsFrom = 'menu';
  function settings(from) { settingsFrom = from; MODE = 'settings'; renderSettings(); show('s-settings'); focusFirst('s-settings'); blip('move'); }
  function renderSettings() {
    const S = W().SETTINGS;
    $('set-sound').textContent = 'SOUND · ' + (S.sound ? 'ON' : 'OFF');
    $('set-cuts').textContent = 'CUT SCENES · ' + (S.skipCuts ? 'SKIP' : 'PLAY');
  }
  function closeSettings() { if (settingsFrom === 'pause') { MODE = 'pause'; show('s-pause'); focusFirst('s-pause'); } else menu(); }
  // ---------------------------------------------------------------- the map (jump to an area)
  const ZONE_COL = { 'LOBBY': '#ff3fb4', 'MERC ZEBRA ROW': '#ff3fb4', 'MAIN FLOOR': '#b36bff', "PATTY'S POP-UP": '#ff8a3d', 'BLACKLIGHT AREA': '#8a4dff',
                     'GNOME GROVE': '#c36bff', 'HYSCORE FOREST': '#53ff8a', "COLEMAN'S PALACE": '#e6aa46', 'THE HALLWAY': '#d8b45a', 'HYSCORE GATEWAY': '#d8b45a',
                     'THE PRIVATE STAIRS': '#53ff8a', "COLEMAN'S KEEP": '#53ff8a' };
  let mapFrom = 'menu';
  // 1125 (HS-4104): FAST TRAVEL. The map's rings carry their stop's name (HYPLACES), and a LIST (rooms -> stops -> game
  // cards) sits beside it (a tab on a narrow screen / phone). Click or tap a ring, a stop or a card = jump there (a card
  // opens on arrival). Hidden stops stay hidden exactly as before (the door; the stair + the Keep until SEEN_SECRET).
  let mapTab = null;
  function map(from) {
    mapFrom = from; MODE = 'map'; show('s-map');
    mapTab = window.innerWidth < 900 ? (mapTab === 'map' ? 'map' : 'list') : 'both';   // wide: map + list side by side
    setTab(mapTab); drawMap(); drawList(); blip('move');
    const cur = document.querySelector('#map-list .here') || document.querySelector('#map-tabs button.on') || $('map-back');
    if (cur) { cur.focus({ preventScroll: true }); if (cur.scrollIntoView) cur.scrollIntoView({ block: 'center' }); }
  }
  function setTab(t) {
    mapTab = t; const m = $('s-map'); m.dataset.tab = t;
    for (const b of document.querySelectorAll('#map-tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    if (MODE === 'map') drawMap();
  }
  function closeMap() { if (mapFrom === 'pause') { MODE = 'pause'; show('s-pause'); focusFirst('s-pause'); } else menu(); }
  const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function drawMap() {
    const L = W().LEVEL, svg = $('map-svg'), seen = W().SEEN_SECRET;
    const nodes = Object.values(L.nodes).filter((n) => n.id !== 'door' && (seen || !SECRET.test(n.id)));
    const zones = (L.zones || []).filter((z) => seen || !z.secret);
    // the walk-up outside (the lot, the 101) is tens of metres south: drawn as a short strip under the doors, so the
    // building gets the room (P = the drawn position; the floor plan itself is true)
    const inside = nodes.filter((n) => !/^ext_/.test(n.id)), floorY = Math.min(...inside.map((n) => n.pos[1]).concat(zones.map((z) => z.rect[2])));
    const outs = nodes.filter((n) => /^ext_/.test(n.id)).sort((a, b) => b.pos[1] - a.pos[1]);
    const P = (n) => { const i = outs.indexOf(n); return i < 0 ? n.pos : [n.pos[0], floorY - 3.2 * (i + 1)]; };
    // a wide, short box (a phone on its side) turns the tall plan a quarter turn: north to the right, the Grove on top
    const bw = svg.clientWidth || 600, bh = svg.clientHeight || 600;
    const wx = Math.max(...nodes.map((n) => P(n)[0])) - Math.min(...nodes.map((n) => P(n)[0])), wy = Math.max(...nodes.map((n) => P(n)[1])) - Math.min(...nodes.map((n) => P(n)[1]));
    const rot = bw / bh > 1.25 && wy > wx * 1.2;
    const T = (x, y) => (rot ? [y, x] : [x, -y]);
    const ZR = (z) => { const [a, b, c, d] = z.rect, p = T(a, c), q = T(b, d); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    const pts = nodes.map((n) => T(...P(n))).concat(zones.flatMap((z) => { const r = ZR(z); return [[r[0], r[1]], [r[2], r[3]]]; }));
    const x0 = Math.min(...pts.map((p) => p[0])) - 2, x1 = Math.max(...pts.map((p) => p[0])) + 2, y0 = Math.min(...pts.map((p) => p[1])) - 2, y1 = Math.max(...pts.map((p) => p[1])) + 2;
    svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    // label size in map units = a fixed screen size (the SVG letterboxes: preserveAspectRatio meet)
    const k = Math.min(bw / (x1 - x0), bh / (y1 - y0)) || 6;
    const fs = Math.max(0.4, 10 / k), placed = [];
    const hit = (r) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    let h = '';
    for (const z of zones) {
      const [a, b, c, d] = ZR(z), col = ZONE_COL[z.area] || '#b36bff', zw0 = c - a;
      const zf = Math.max(fs * 0.8, z.small ? 0.8 : Math.min(1.25, zw0 / (z.label.length * 0.62))), zy = b + (z.small ? 1.0 : 1.4) * zf / 1.25;
      h += `<rect x="${a}" y="${b}" width="${c - a}" height="${d - b}" fill="${col}22" stroke="${col}" stroke-width="0.12"/>`;
      const zw = z.label.length * zf * 0.62, zr = [(a + c) / 2 - zw / 2, zy - zf / 2, (a + c) / 2 + zw / 2, zy + zf / 2];
      if (zw <= (c - a) + 0.5 && !hit(zr)) { placed.push(zr); h += `<text x="${(a + c) / 2}" y="${zy}" fill="${col}" font-size="${zf}" text-anchor="middle" dominant-baseline="middle" opacity=".9">${escH(z.label)}</text>`; }
    }
    for (const [a, b] of (L.edges || [])) {
      const A = L.nodes[a], B = L.nodes[b]; if (!A || !B || nodes.indexOf(A) < 0 || nodes.indexOf(B) < 0) continue;
      const p = T(...P(A)), q = T(...P(B));
      h += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#ffffff30" stroke-width="0.1"/>`;
    }
    const here = W().NODE && W().NODE.id, R = Math.max(0.7, 7 / k);
    for (const n of nodes) { const [px, py] = T(...P(n)); placed.push([px - R, py - R, px + R, py + R]); }
    // the labels: YOU ARE HERE first, then the named rooms, then the rest; each tries right, left, below, above and is
    // dropped (still on hover + in the list) rather than drawn over another
    const order = nodes.slice().sort((a, b) => (b.id === here) - (a.id === here) || (!!(L.rooms || {})[b.id]) - (!!(L.rooms || {})[a.id]));
    const labs = {};
    for (const n of order) {
      const t = HYPLACES.label(L, n.id), w = t.length * fs * 0.6, [cx, cy] = T(...P(n)), g = R + fs * 0.35;
      const tries = [[cx + g, cy, 'start'], [cx - g, cy, 'end'], [cx, cy + g + fs * 0.55, 'middle'], [cx, cy - g - fs * 0.55, 'middle']];
      for (const [x, y, an] of tries) {
        const lx = an === 'start' ? x : an === 'end' ? x - w : x - w / 2, r = [lx - 0.1, y - fs * 0.55, lx + w + 0.1, y + fs * 0.55];
        if (r[0] < x0 || r[2] > x1 || r[1] < y0 || r[3] > y1 || hit(r)) continue;
        placed.push(r); labs[n.id] = `<text class="maplab" x="${x}" y="${y}" font-size="${fs}" text-anchor="${an}" dominant-baseline="middle">${escH(t)}</text>`; break;
      }
    }
    for (const n of nodes) {
      const col = ZONE_COL[n.area] || '#b36bff', me = n.id === here, [px, py] = T(...P(n));
      h += `<g class="mapnode${me ? ' here' : ''}" data-id="${n.id}" tabindex="-1"><circle cx="${px}" cy="${py}" r="${me ? R * 1.35 : R}" fill="#07050c" stroke="${col}" stroke-width="${R * 0.3}"/>` +
           (me ? `<circle cx="${px}" cy="${py}" r="${R * 0.4}" fill="${col}"/>` : '') +
           `<circle class="hitpad" cx="${px}" cy="${py}" r="${Math.max(R * 1.6, 12 / k)}" fill="transparent"/>` +
           (labs[n.id] || '') + `<title>${escH(HYPLACES.label(L, n.id))} · ${escH(n.area)}</title></g>`;
    }
    svg.innerHTML = h; svg.dataset.rot = rot ? '1' : '';
    svg.querySelectorAll('.mapnode').forEach((g) => { g.onclick = () => jump(g.dataset.id); });
    $('map-here').textContent = (here ? 'YOU ARE HERE · ' + HYPLACES.label(L, here) + ' · ' + (L.nodes[here].area || '') : 'PICK A ROOM TO START THERE') + (rot ? ' · NORTH ▸' : '');
  }
  function drawList() {
    const L = W().LEVEL, seen = W().SEEN_SECRET, here = W().NODE && W().NODE.id, box = $('map-list');
    let h = '';
    for (const g of HYPLACES.groups(L, seen)) {
      h += `<div class="lgrp" style="--c:${g.col}"><div class="larea">${escH(g.area)}</div>`;
      for (const s of g.stops) {
        h += `<div class="lstop"><button class="lgo${s.id === here ? ' here' : ''}" data-id="${s.id}">${s.id === here ? '◉ ' : '▸ '}${escH(s.name)}</button>`;
        if (s.cards.length) h += '<div class="lcards">' + s.cards.map((e) => `<button class="lcard" data-id="${s.id}" data-ex="${escH(e.id)}" title="${escH(e.game || '')}">${escH(e.title)}</button>`).join('') + '</div>';
        h += '</div>';
      }
      h += '</div>';
    }
    box.innerHTML = h;
    box.querySelectorAll('button').forEach((b) => { b.onclick = () => jump(b.dataset.id, b.dataset.ex); });
  }
  async function jump(id, ex) {
    blip('ok'); $('fade').classList.add('on'); await new Promise((r) => setTimeout(r, 300));
    MODE = 'walk'; stopAttract(); hideAll(); applySound(); W().closeCard();
    await W().goNode(id); $('fade').classList.remove('on');
    if (ex) await W().openCard(ex);
  }
  // ---------------------------------------------------------------- input
  function focusFirst(id) { const b = document.querySelector('#' + id + ' button'); if (b) b.focus(); }
  function moveFocus(d) {
    const scr = document.querySelector('.screen.on'); if (!scr) return; const bs = [...scr.querySelectorAll('button')]; if (!bs.length) return;
    const i = bs.indexOf(document.activeElement); bs[(i + d + bs.length) % bs.length].focus(); blip('move');
  }
  function press() { if (MODE === 'attract') title(); else if (MODE === 'title') menu(); }
  function handleKey(e) {
    lastInput = performance.now();
    if (MODE === 'walk') {
      if (e.key === 'Escape') { const bk = document.getElementById('back'); if (document.getElementById('card').style.display === 'block' && bk) bk.click(); else pause(); return true; }
      if (e.key === 'm' || e.key === 'M') { if (!W().BUSY) map('pause'); return true; }
      return false;
    }
    if (MODE === 'logos') return true;   // CK BOOT: unskippable
    if (MODE === 'attract' || MODE === 'title') { if (['Enter', ' ', 'Space'].includes(e.key) || e.key.length === 1) { e.preventDefault(); press(); } return true; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { moveFocus(1); e.preventDefault(); return true; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { moveFocus(-1); e.preventDefault(); return true; }
    if (e.key === 'Escape') {
      if (MODE === 'pause') resume(); else if (MODE === 'map') closeMap(); else if (MODE === 'settings') closeSettings(); else if (MODE === 'menu') quitToTitle();
      return true;
    }
    return MODE !== 'walk';
  }
  for (const ev of ['pointerdown', 'pointermove', 'wheel']) window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
  setInterval(() => {   // idle on the title / menu -> back to attract (never while walking, never into a game)
    if ((MODE === 'title' || MODE === 'menu') && performance.now() - lastInput > 45000) { MODE = 'attract'; show('s-attract'); roomTone(false); }
  }, 2000);
  function wire() {
    $('s-attract').onclick = () => press(); $('s-title').onclick = (e) => { if (e.target.tagName !== 'BUTTON') press(); };
    $('m-enter').onclick = startWalk; $('m-map').onclick = () => map('menu'); $('m-settings').onclick = () => settings('menu');
    $('m-quit').onclick = () => { blip('back'); roomTone(false); logos(); };
    $('p-resume').onclick = resume; $('p-map').onclick = () => map('pause'); $('p-settings').onclick = () => settings('pause');
    $('p-door').onclick = async () => { resume(); W().closeCard(); await W().goNode(W().LEVEL.door); };
    $('p-title').onclick = quitToTitle;
    $('set-sound').onclick = () => { W().SETTINGS.sound = !W().SETTINGS.sound; renderSettings(); applySound(); blip('ok'); };
    $('set-cuts').onclick = () => { W().SETTINGS.skipCuts = !W().SETTINGS.skipCuts; renderSettings(); blip('ok'); };
    $('set-back').onclick = closeSettings; $('map-back').onclick = closeMap;
    document.querySelectorAll('#map-tabs button').forEach((b) => { b.onclick = () => { setTab(b.dataset.tab); blip('move'); }; });
    $('m-dir').onclick = () => { blip('ok'); location.href = 'directory.html'; };        // 1125: THE DIRECTORY (one page, every room + card)
    $('p-share').onclick = () => { const n = W().NODE; if (n) HYPLACES.share(n.id, null); blip('ok'); };   // 1125: copy this spot's link
    $('pausebtn').onclick = () => pause();
  }
  window.UI = {
    boot() { wire(); logos(); },
    skipBoot() { wire(); MODE = 'walk'; hideAll(); },
    handleKey, blip, jump, get MODE() { return MODE; },
  };
})();
