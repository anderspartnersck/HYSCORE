// HYSCORE WALK — the front end (1110). The house boot flow, kept simple:
//   CK LOGO -> ATTRACT (a slow drift through the public rooms) -> TITLE -> PRESS ENTER -> MENU
//   MENU: ENTER THE ARCADE · MAP · SETTINGS · QUIT (back to the logos)
// Nothing starts on its own: the walk begins only from ENTER THE ARCADE (or a MAP jump). Idle on the title/menu
// returns to attract; idle while walking does nothing. In the walk: Esc = PAUSE (resume / map / settings / back to the
// door / quit to title), M = MAP. SETTINGS: sound on/off, skip cut scenes. Session only (the web build saves nothing).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const W = () => window.WALK;
  let MODE = 'boot', idleT = 0, attractT = null, attractRaf = 0, lastInput = performance.now();
  const PUBLIC_TOUR = ['lobby', 'forest_mid', 'blacklight', 'grove_mid', 'food_court', 'palace_mid', 'palace_trasimene', 'window_area', 'hallway_mid', 'gateway', 'forest_entry', 'air_hockey'];
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
                     'GNOME GROVE': '#c36bff', 'HYSCORE FOREST': '#53ff8a', "COLEMAN'S PALACE": '#e6aa46', 'THE HALLWAY': '#d8b45a', 'HYSCORE GATEWAY': '#d8b45a' };
  let mapFrom = 'menu';
  function map(from) {
    mapFrom = from; MODE = 'map'; drawMap(); show('s-map'); blip('move');
  }
  function closeMap() { if (mapFrom === 'pause') { MODE = 'pause'; show('s-pause'); focusFirst('s-pause'); } else menu(); }
  function drawMap() {
    const L = W().LEVEL, svg = $('map-svg');
    const nodes = Object.values(L.nodes).filter((n) => n.id !== 'door');
    const zones = L.zones || [];
    const xs = nodes.map((n) => n.pos[0]).concat(zones.flatMap((z) => [z.rect[0], z.rect[1]]));
    const ys = nodes.map((n) => n.pos[1]).concat(zones.flatMap((z) => [z.rect[2], z.rect[3]]));
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2;
    svg.setAttribute('viewBox', `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`);
    let h = '';
    for (const z of zones) {
      const [a, b, c, d] = z.rect, col = ZONE_COL[z.area] || '#b36bff';
      h += `<rect x="${a}" y="${-d}" width="${b - a}" height="${d - c}" fill="${col}22" stroke="${col}" stroke-width="0.12"/>` +
           `<text x="${(a + b) / 2}" y="${-d + (z.small ? 1.0 : 1.4)}" fill="${col}" font-size="${z.small ? 0.8 : Math.min(1.25, (b - a) / (z.label.length * 0.62))}" text-anchor="middle" dominant-baseline="middle" opacity=".9">${z.label}</text>`;
    }
    for (const [a, b] of (L.edges || [])) {
      const A = L.nodes[a], B = L.nodes[b]; if (!A || !B || nodes.indexOf(A) < 0 || nodes.indexOf(B) < 0) continue;
      h += `<line x1="${A.pos[0]}" y1="${-A.pos[1]}" x2="${B.pos[0]}" y2="${-B.pos[1]}" stroke="#ffffff30" stroke-width="0.1"/>`;
    }
    const here = W().NODE && W().NODE.id;
    for (const n of nodes) {
      const col = ZONE_COL[n.area] || '#b36bff';
      h += `<g class="mapnode${n.id === here ? ' here' : ''}" data-id="${n.id}"><circle cx="${n.pos[0]}" cy="${-n.pos[1]}" r="${n.id === here ? 0.95 : 0.7}" fill="#07050c" stroke="${col}" stroke-width="0.22"/>` +
           (n.id === here ? `<circle cx="${n.pos[0]}" cy="${-n.pos[1]}" r="0.28" fill="${col}"/>` : '') + `<title>${n.area} · ${n.id.replace(/_/g, ' ')}</title></g>`;
    }
    svg.innerHTML = h;
    svg.querySelectorAll('.mapnode').forEach((g) => { g.onclick = () => jump(g.dataset.id); });
    $('map-here').textContent = here ? 'YOU ARE HERE · ' + (L.nodes[here].area || '') : 'PICK A ROOM TO START THERE';
  }
  async function jump(id) {
    blip('ok'); $('fade').classList.add('on'); await new Promise((r) => setTimeout(r, 300));
    MODE = 'walk'; stopAttract(); hideAll(); applySound(); W().closeCard();
    await W().goNode(id); $('fade').classList.remove('on');
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
    $('pausebtn').onclick = () => pause();
  }
  window.UI = {
    boot() { wire(); logos(); },
    skipBoot() { wire(); MODE = 'walk'; hideAll(); },
    handleKey, blip, get MODE() { return MODE; },
  };
})();
