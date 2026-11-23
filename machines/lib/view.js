// Shared bits for the HYSCORE redemption machines' pages: renderer, GLB loading, the machine's own LED panels
// (canvas textures ON the cabinet's LED meshes: the UI is the machine), plush fabric, a little synth for the sounds.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export { THREE };

export function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

const loader = new GLTFLoader();
export function loadGLB(url) { return new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej)); }

/** every node by name (Blender object names survive the export) */
export function byName(root) {
  const m = {};
  // one .blend builds every cab, so a twin part comes out as 'glass_front.003' (three drops the dot: 'glass_front003')
  root.traverse((o) => { if (!o.name) return; const k = o.name.replace(/\.?\d{3}$/, ''); if (!m[k]) m[k] = o; });
  return m;
}

/** glass reads as glass: no depth write, drawn after the solid cab, a faint specular */
export function fixMaterials(root, opt = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !!opt.cast; o.receiveShadow = true;
    const m = o.material;
    if (m && m.transparent) { m.depthWrite = false; o.renderOrder = 10; o.castShadow = false; }
    if (m && m.emissiveMap) m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, opt.emissive ?? 1);
  });
}

let haloTex = null;
function halo() {
  if (!haloTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,120,100,1)'); gr.addColorStop(0.25, 'rgba(255,40,24,0.55)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); haloTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
}

/** plush: felt / fleece, never glossy (sheen on, specular off). A glowing part (the ATTENTION SHEEP's bead eyes:
 *  emissive in the GLB) stays lit: unlit bright red + a soft additive halo per bead (the bloom of the stills). */
export function plushify(root, tint = 0xffffff) {
  const glow = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const s = o.material;
    if (s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) > 0.3) { glow.push(o); return; }
    const m = new THREE.MeshPhysicalMaterial({
      map: s.map || null, color: s.color ? s.color.clone() : new THREE.Color(1, 1, 1), roughness: 1, metalness: 0,
      sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(tint).multiplyScalar(0.55), specularIntensity: 0.05,
      transparent: !!s.transparent, alphaTest: s.transparent ? 0.4 : 0, side: s.transparent ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (s.transparent) { m.transparent = false; }
    o.material = m;
  });
  for (const o of glow) {
    o.castShadow = false;
    o.material = new THREE.MeshBasicMaterial({ color: o.material.emissive.clone().multiplyScalar(1.6), toneMapped: false });
    // one halo per bead: split the beads' vertices across their widest axis
    const P = o.geometry.attributes.position; o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3()), ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
    const mid = (bb.min[ax] + bb.max[ax]) / 2, sum = [new THREE.Vector3(), new THREE.Vector3()], n = [0, 0], v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const k = v[ax] < mid ? 0 : 1; sum[k].add(v); n[k]++; }
    const r = Math.min(sz.x, sz.y, sz.z);
    for (let k = 0; k < 2; k++) {
      if (!n[k]) continue;
      const sp = new THREE.Sprite(halo()); sp.position.copy(sum[k].divideScalar(n[k])); sp.scale.setScalar(r * 5); sp.renderOrder = 11;
      sp.raycast = () => {}; o.add(sp);
    }
  }
}

/** an LED panel drawn on a canvas, mapped onto a cab mesh (its UVs are 0..1 across the panel) */
export class LED {
  constructor(mesh, { w = 256, h = 72, color = '#ff3a2a', bg = '#140404' } = {}) {
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h; this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.flipY = false;
    this.color = color; this.bg = bg; this.last = '';
    if (mesh) mesh.material = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
  }
  set(text, sub = '', blink = false) {
    const key = text + '|' + sub + '|' + blink;
    if (key === this.last) return; this.last = key;
    const { g, cv } = this; g.fillStyle = this.bg; g.fillRect(0, 0, cv.width, cv.height);
    // the unlit segments ghost behind (a real LED panel)
    g.font = `700 ${sub ? cv.height * 0.56 : cv.height * 0.72}px "DIN Condensed","DIN Alternate","Arial Narrow",monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = sub ? cv.height * 0.40 : cv.height * 0.54;
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillText('8'.repeat(Math.min(10, text.length)), cv.width / 2, y);
    if (!blink) {
      g.shadowColor = this.color; g.shadowBlur = 12; g.fillStyle = this.color; g.fillText(text, cv.width / 2, y);
      g.shadowBlur = 0; g.fillStyle = '#fff6'; g.fillText(text, cv.width / 2, y);
    }
    if (sub) { g.font = `600 ${cv.height * 0.24}px "DIN Condensed","Arial Narrow",monospace`; g.fillStyle = this.color; g.globalAlpha = 0.8; g.fillText(sub, cv.width / 2, cv.height * 0.84); g.globalAlpha = 1; }
    this.tex.needsUpdate = true;
  }
}

/** a printed placard (instructions) as a canvas texture on a small plane */
export function placard(lines, { w = 512, h = 256, bg = '#f2e6c8', ink = '#1a1012', title = '', accent = '#c8102e', big = false } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  let y = big ? 50 : 46;
  if (title) { g.fillStyle = accent; g.font = `700 ${big ? 46 : 40}px "DIN Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center'; g.fillText(title, w / 2, y); y += big ? 44 : 40; }
  g.fillStyle = ink; g.font = `${big ? 700 : 600} ${big ? 31 : 26}px "DIN Condensed","Arial Narrow",sans-serif`; g.textAlign = 'center';
  for (const l of lines) { g.fillText(l, w / 2, y); y += big ? 41 : 32; }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- sound (synth only: no files)
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.hum = null; }
  wake() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; }
  }
  tone(f, d = 0.12, type = 'sine', v = 0.3, when = 0, slide = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.02);
  }
  noise(d = 0.05, v = 0.2, when = 0, hp = 2000) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, n = Math.floor(this.ctx.sampleRate * d), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  coin() { this.tone(2400, 0.08, 'triangle', 0.25); this.tone(3600, 0.12, 'sine', 0.18, 0.05); }
  clink(v = 0.12) { this.tone(2800 + Math.random() * 1500, 0.05, 'triangle', v); }
  thud() { this.tone(110, 0.14, 'sine', 0.35, 0, 0.5); this.noise(0.06, 0.12, 0, 300); }
  clack() { this.noise(0.04, 0.3, 0, 1200); this.tone(320, 0.05, 'square', 0.08); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'square', 0.12, i * 0.09)); }
  bonus() { for (let i = 0; i < 10; i++) this.tone(500 + i * 120, 0.08, 'square', 0.08, i * 0.05); }
  // 1123 claw beats: the snap (a hard clunk + spring ring), then one rising tick per grip bar (the read of the grab)
  snap() { this.noise(0.05, 0.4, 0, 900); this.tone(140, 0.12, 'square', 0.12, 0, 0.6); this.tone(1900, 0.09, 'triangle', 0.06, 0.02, 1.3); }
  grip(bars) { for (let i = 0; i < bars; i++) this.tone(660 * Math.pow(1.26, i), 0.07, 'square', 0.07, 0.12 + i * 0.075); }
  wah() { this.tone(330, 0.5, 'sawtooth', 0.07, 0, 0.45); this.tone(247, 0.6, 'sawtooth', 0.05, 0.18, 0.5); }
  lamp(n) { this.tone(880 + n * 220, 0.09, 'square', 0.09); this.tone(1320 + n * 330, 0.12, 'triangle', 0.07, 0.06); }
  chute() { this.noise(0.05, 0.25, 0, 600); [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.09, 0.05 + i * 0.05)); }
  tickets(n) { for (let i = 0; i < Math.min(n, 12); i++) this.noise(0.02, 0.12, i * 0.06, 3500); }
  motor(on) {
    if (!this.ctx || !this.on) return;
    if (on && !this.hum) {
      const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 68; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.0001;
      o.connect(f); f.connect(g); g.connect(this.master); o.start(); g.gain.exponentialRampToValueAtTime(0.06, this.ctx.currentTime + 0.08);
      this.hum = { o, g };
    } else if (!on && this.hum) {
      const h = this.hum; this.hum = null; h.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1); h.o.stop(this.ctx.currentTime + 0.15);
    }
  }
}

/** fit a camera so a box of (w x h) at distance-plane z0 fills the view in any aspect (phones too) */
export function frame(camera, target, w, h, pad = 1.08) {
  const vf = THREE.MathUtils.degToRad(camera.fov), a = camera.aspect;
  const dh = (h * pad / 2) / Math.tan(vf / 2), dw = (w * pad / 2) / (Math.tan(vf / 2) * a);
  return Math.max(dh, dw);
}

/** leave the machine: close the tab the walk opened, else go back to the arcade */
export function backLink(el, fallback = '../index.html') {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.opener) { window.close(); return; }
    if (history.length > 1 && document.referrer) history.back(); else location.href = fallback;
  });
}

// ---------------------------------------------------------------- SMEAR FRAMES (Joe 1123): render-only, baked, cheap
// A smear is 1-2 drawn frames on a single fast motion: a translucent GHOST of the part where it just was (built once,
// its materials cloned once) and/or a stretch along the motion. No per-frame blur, no extra passes: the ghost is
// hidden on every other frame.
export function ghostOf(root, opacity = 0.38) {
  const g = root.clone(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => { const c = m.clone(); c.transparent = true; c.opacity = opacity; c.depthWrite = false; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    o.castShadow = o.receiveShadow = false; o.renderOrder = 12; o.raycast = () => {};
  });
  g.visible = false; g.userData.op = opacity;
  return g;
}
/** show a ghost for `frames` rendered frames at the pose it is given now (then it fades and hides itself) */
export class Smear {
  constructor(ghost) { this.g = ghost; this.n = 0; this.N = 0; }
  fire(pos, quat, scale, frames = 2) {
    const g = this.g; if (pos) g.position.copy(pos); if (quat) g.quaternion.copy(quat); if (scale) g.scale.copy(scale);
    this.n = this.N = frames; g.visible = true; this.fade();
  }
  fade() {
    const k = this.N ? this.n / this.N : 0, op = this.g.userData.op * k;
    this.g.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = op; });
  }
  tick() { if (this.n > 0) { this.n--; if (this.n === 0) this.g.visible = false; else this.fade(); } return this.n; }
  get on() { return this.n > 0; }
}
