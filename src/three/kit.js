// 3D building blocks shared by the monsters, the arena and the effects: procedural
// textures, PBR materials, shape helpers, a flame shader and stateless GPU particles.
// Everything animated reads one time value, so a frame can be rendered at any moment
// (live play and the offline video renders use the same code).
import * as THREE from 'three';

// ---- noise and textures ----

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Tileable value noise: lattice coordinates wrap at `period`.
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a) => ((a % period) + period) % period;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, period, octaves, seed = 1) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, y, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    x *= 2; y *= 2; period *= 2;
  }
  return sum / norm;
}

function heights(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}

function normalTexture(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size);
}

function dataTexture(data, size, srgb = false) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Color texture from a function returning [r, g, b] in 0..1.
export function colorTexture(size, fn) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, r * 255);
      data[i + 1] = Math.min(255, g * 255);
      data[i + 2] = Math.min(255, b * 255);
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size, true);
}

let TEX = null;
// Built once per page: micro detail that keeps surfaces from looking like plain plastic.
export function textures() {
  if (TEX) return TEX;
  const S = 256;
  TEX = {
    skin: normalTexture(heights(S, (x, y) => fbm(x * 8, y * 8, 8, 4, 3)), S, 2.2),
    fur: normalTexture(heights(S, (x, y) => fbm(x * 48, y * 6, 48, 3, 5) * 0.7 + fbm(x * 16, y * 16, 16, 2, 9) * 0.3), S, 4),
    rock: normalTexture(heights(S, (x, y) => {
      const r = 1 - Math.abs(fbm(x * 4, y * 4, 4, 5, 7) * 2 - 1);
      return r * r * 0.8 + fbm(x * 16, y * 16, 16, 3, 2) * 0.2;
    }), S, 6),
    scales: normalTexture(heights(S, (x, y) => {
      const u = (x * 10) % 1, v = (y * 10 + (Math.floor(x * 10) % 2) * 0.5) % 1;
      return Math.sqrt(Math.max(0, 1 - ((u - 0.5) ** 2 + (v - 0.35) ** 2) * 4));
    }), S, 3),
  };
  return TEX;
}

let SPRITE = null;
// Soft round sprite for glows and particles.
export function softSprite() {
  if (SPRITE) return SPRITE;
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x / (S - 1) - 0.5, y / (S - 1) - 0.5) * 2;
      const a = Math.max(0, 1 - d) ** 2;
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  SPRITE = dataTexture(data, S);
  SPRITE.wrapS = SPRITE.wrapT = THREE.ClampToEdgeWrapping;
  return SPRITE;
}

// ---- materials (one set per monster, so a hit flash tints only that monster) ----

const v2 = (k) => new THREE.Vector2(k, k);
const lighter = (c, k = 0.35) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k);
// Optional self-glow for any lit material: { emit: color, emitK: intensity }.
const emit = (o) => ({ emissive: new THREE.Color(o.emit ?? '#000000'), emissiveIntensity: o.emitK ?? 1 });

export const MAT = {
  skin: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: o.rough ?? 0.58, clearcoat: o.coat ?? 0.12, clearcoatRoughness: 0.45,
    sheen: o.sheen ?? 0.4, sheenRoughness: 0.5, sheenColor: lighter(color, 0.5),
    normalMap: textures().skin, normalScale: v2(o.bump ?? 0.35), ...emit(o),
  }),
  fur: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: o.rough ?? 0.75, sheen: 1, sheenRoughness: 0.35, sheenColor: lighter(color, 0.6),
    clearcoat: o.coat ?? 0.05, normalMap: textures().fur, normalScale: v2(o.bump ?? 0.6), ...emit(o),
  }),
  gloss: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: o.rough ?? 0.2, metalness: o.metal ?? 0, clearcoat: 1, clearcoatRoughness: 0.08,
    normalMap: o.normal ? textures()[o.normal] : null, normalScale: v2(o.bump ?? 0.3), ...emit(o),
  }),
  rock: (color, o = {}) => new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.92, flatShading: o.flat ?? true, normalMap: textures().rock, normalScale: v2(o.bump ?? 0.9), ...emit(o),
  }),
  metal: (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: o.rough ?? 0.28, ...emit(o) }),
  // HDR color above 1 so the bloom pass picks it up.
  glow: (color, k = 2.5) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }),
  crystal: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.06, transmission: o.transmission ?? 0.75, thickness: 0.6, ior: 1.5,
    emissive: new THREE.Color(color), emissiveIntensity: o.glow ?? 0.35, clearcoat: 1, flatShading: true,
  }),
  jelly: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.12, transmission: 0.88, thickness: 1.1, ior: 1.33, iridescence: 0.6,
    attenuationColor: new THREE.Color(color), attenuationDistance: 1.5,
    emissive: new THREE.Color(color), emissiveIntensity: o.glow ?? 0.15, clearcoat: 1, side: THREE.DoubleSide,
  }),
  wing: (color, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.35, sheen: 1, sheenColor: lighter(color, 0.6), transparent: true, opacity: o.opacity ?? 0.92,
    side: THREE.DoubleSide, iridescence: 0.8, map: o.map ?? null, emissiveMap: o.emap ?? null, ...emit(o),
  }),
};

// ---- shapes ----

const GEO = new Map();
const cached = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
export const geo = {
  sphere: (seg = 48) => cached(`s${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.66))),
  capsule: (r, len) => cached(`c${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 20)),
  cone: (seg = 24) => cached(`k${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0)),
  ico: (detail = 2) => cached(`i${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
};

// A mesh with optional position, scale (number or [x, y, z]) and rotation, added to `parent`.
export function part(parent, geometry, material, { p, s, r, shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (p) m.position.set(...p);
  if (s !== undefined) Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s);
  if (r) m.rotation.set(...r);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  parent.add(m);
  return m;
}

export function group(parent, { p, r, s } = {}) {
  const g = new THREE.Group();
  if (p) g.position.set(...p);
  if (r) g.rotation.set(...r);
  if (s !== undefined) Array.isArray(s) ? g.scale.set(...s) : g.scale.setScalar(s);
  parent?.add(g);
  return g;
}

// A tube along points whose radius goes from r0 to r1 (tails, horns, tentacles, legs).
export function taper(points, r0, r1, { seg = 32, radial = 14, power = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const k = i / seg;
    curve.getPointAt(k, c);
    const r = r0 + (r1 - r0) * k ** power;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  // Cap the thick end so it never shows a hole.
  const cap = new THREE.SphereGeometry(r0, radial, 8);
  cap.translate(...points[0]);
  return mergeSimple([g, cap]);
}

// Merge geometries that all have position, normal and uv.
export function mergeSimple(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// A leaf or blade: a lens shape, bent along its length, double sided.
export function leaf(len, width, { bend = 0.25, curl = 0.15, seg = 14 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.45, width, len, 0);
  s.quadraticCurveTo(len * 0.45, -width, 0, 0);
  const g = new THREE.ShapeGeometry(s, seg);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, bend * (x / len) ** 2 * len - curl * Math.abs(y));
  }
  g.computeVertexNormals();
  return g;
}

// A solid of revolution from [radius, height] pairs (flames, bells, shark bodies, horns).
export function lathe(profile, seg = 40) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// Randomly displaced icosphere for rocks.
export function rockGeo(seed, rough = 0.22, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 2 + 9 + seed, v.y * 2 + v.z * 1.7 + seed, 1024, 3, seed);
    v.multiplyScalar(1 + (n - 0.5) * rough * 2);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Fierce glowing eyes on the face (+x), mirrored to both sides (±z): a dark almond socket,
// a glowing iris with a slit pupil, and a heavy brow that dips toward the snout (a glare).
// `lid.mat` is the brow material (the monster's own skin), `brow` its thickness.
export function eyes(parent, { x, y, z, r, glow = '#ffd23a', look = 0.25, lid = null, brow = 0.42, slit = true }) {
  const socket = MAT.gloss('#07040a', { rough: 0.25 });
  const iris = MAT.glow(glow, 3.2);
  const pupil = new THREE.MeshBasicMaterial({ color: '#050208' });
  const browM = lid?.mat ?? MAT.skin('#17111b', { rough: 0.7 });
  const out = [];
  for (const side of [1, -1]) {
    const e = group(parent, { p: [x, y, z * side], r: [0, -side * look, 0] });
    part(e, geo.sphere(32), socket, { s: [r * 0.62, r * 0.66, r * 0.98], shadow: false });
    part(e, geo.sphere(24), iris, { p: [r * 0.36, -r * 0.05, 0], s: [r * 0.3, r * 0.48, r * 0.7], shadow: false });
    if (slit) part(e, geo.sphere(16), pupil, { p: [r * 0.6, -r * 0.05, 0], s: [r * 0.08, r * 0.4, r * 0.1], shadow: false });
    part(e, geo.sphere(24), browM, { p: [r * 0.12, r * 0.52, 0], s: [r * 0.92, r * brow, r * 1.2], r: [-side * 0.42, 0, -0.32] });
    out.push(e);
  }
  return out;
}

// Two fangs pointing down from the mouth at (x, y), ±z apart.
export function fangs(parent, { x, y, z, len = 0.09, r = 0.022, mat = null, tilt = 0.15 }) {
  const m = mat ?? MAT.gloss('#efe6d2', { rough: 0.3 });
  for (const side of [1, -1]) part(parent, geo.cone(10), m, { p: [x, y, z * side], s: [r, len, r], r: [Math.PI + side * tilt * 0.4, 0, -tilt] });
}

// A horn: a tapered tube from `base` through `mid` to `tip` (curved by the points).
export function horn(parent, pts, mat, r0 = 0.06, power = 0.8) {
  return part(parent, taper(pts, r0, 0.004, { power, radial: 12 }), mat);
}

let RUNE = null;
// A circle of runes in white on transparent (tinted per use): rings, ticks, glyph marks.
export function runeTexture() {
  if (RUNE) return RUNE;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = S / 2;
  g.translate(R, R);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r * R, 0, Math.PI * 2); g.stroke(); };
  ring(0.96, 6); ring(0.88, 2.5); ring(0.6, 4); ring(0.52, 2); ring(0.2, 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Glyph marks between the two outer rings.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -0.92 * R);
    g.lineWidth = 3;
    g.beginPath();
    const k = Math.floor(rnd() * 4);
    if (k === 0) { g.moveTo(-6, -5); g.lineTo(0, 5); g.lineTo(6, -5); }
    else if (k === 1) { g.moveTo(0, -6); g.lineTo(0, 6); g.moveTo(-5, 0); g.lineTo(5, 0); }
    else if (k === 2) { g.arc(0, 0, 4.5, 0, Math.PI * 2); }
    else { g.moveTo(-6, 6); g.lineTo(0, -6); g.lineTo(6, 6); g.moveTo(-3, 1); g.lineTo(3, 1); }
    g.stroke();
    g.restore();
  }
  // Two interlocked squares and spokes inside.
  g.lineWidth = 3;
  for (const off of [0, Math.PI / 4]) {
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = off + (i / 4) * Math.PI * 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.52 * R, Math.sin(a) * 0.52 * R);
    }
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 ? 2 : 4;
    g.beginPath();
    g.moveTo(Math.cos(a) * 0.6 * R, Math.sin(a) * 0.6 * R);
    g.lineTo(Math.cos(a) * (i % 3 ? 0.66 : 0.74) * R, Math.sin(a) * (i % 3 ? 0.66 : 0.74) * R);
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(Math.cos(a) * 0.36 * R, Math.sin(a) * 0.36 * R, 0.07 * R, 0, Math.PI * 2);
    g.stroke();
  }
  RUNE = new THREE.CanvasTexture(c);
  RUNE.colorSpace = THREE.SRGBColorSpace;
  return RUNE;
}

let STAR = null;
// A bright point with four thin streaks, for impact flashes.
export function starSprite() {
  if (STAR) return STAR;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (const [w, h] of [[S, 3], [3, S]]) {
    const lg = g.createLinearGradient(w > h ? 0 : S / 2, w > h ? S / 2 : 0, w > h ? S : S / 2, w > h ? S / 2 : S);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect((S - w) / 2, (S - h) / 2, w, h);
  }
  STAR = new THREE.CanvasTexture(c);
  return STAR;
}

// ---- flame shader ----

const NOISE_GLSL = `
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }`;

// Additive flame for lathe geometry (uv.y runs from base to tip). Animated by uTime.
export function flameMaterial({ core = '#fff6b0', mid = '#ff8a1e', edge = '#d42a00', power = 2.4, speed = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: Math.random() * 50 }, uSpeed: { value: speed },
      uCore: { value: new THREE.Color(core) }, uMid: { value: new THREE.Color(mid) }, uEdge: { value: new THREE.Color(edge) }, uPower: { value: power },
    },
    vertexShader: `
      uniform float uTime; uniform float uSeed; uniform float uSpeed;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec3 p = position;
        float h = uv.y;
        float t = uTime * uSpeed;
        p.x += (sin(t * 7.0 + p.y * 9.0 + uSeed) * 0.07 + sin(t * 12.0 + p.y * 15.0 + uSeed * 1.7) * 0.035) * h;
        p.z += cos(t * 6.0 + p.y * 10.0 + uSeed) * 0.06 * h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uSeed; uniform float uSpeed; uniform float uPower;
      uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${NOISE_GLSL}
      void main() {
        float h = vUv.y;
        float t = uTime * uSpeed;
        float n = vnoise(vec2(vUv.x * 7.0 + uSeed, h * 3.0 - t * 2.6)) * 0.6 + vnoise(vec2(vUv.x * 15.0 - uSeed, h * 7.0 - t * 4.2)) * 0.4;
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = smoothstep(1.02, 0.3, h + n * 0.5);
        float heat = clamp(facing * (1.15 - h) + n * 0.25, 0.0, 1.0);
        vec3 col = mix(uEdge, uMid, smoothstep(0.1, 0.55, heat));
        col = mix(col, uCore, smoothstep(0.55, 0.95, heat));
        gl_FragColor = vec4(col * uPower, body * (0.25 + facing * 0.75));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

export const flameGeo = (r = 0.3, h = 0.8) =>
  lathe([[0, 0], [r * 0.7, 0.05 * h], [r, 0.2 * h], [r * 0.85, 0.45 * h], [r * 0.45, 0.75 * h], [0.001, h]], 36);

// ---- stateless GPU particles ----
// Each particle loops on its own clock: age = fract(time * rate + seed). Position,
// size and fade come from the seed in the vertex shader, so any time can be drawn.

export function emitter({ count = 40, color = '#ffb347', size = 0.08, life = 1.6, spread = [0.3, 0.1, 0.3], velocity = [0, 0.9, 0], jitter = 0.35, gravity = 0, swirl = 0, additive = true, opacity = 1 } = {}) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uLife: { value: life }, uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
      uSpread: { value: new THREE.Vector3(...spread) }, uVel: { value: new THREE.Vector3(...velocity) }, uJitter: { value: jitter },
      uGravity: { value: gravity }, uSwirl: { value: swirl }, uMap: { value: softSprite() }, uScale: { value: 600 },
    },
    vertexShader: `
      uniform float uTime, uLife, uSize, uJitter, uGravity, uSwirl, uScale;
      uniform vec3 uSpread, uVel;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        float age = fract(uTime / uLife + aSeed.w);
        float t = age * uLife;
        vec3 start = (aSeed.xyz * 2.0 - 1.0) * uSpread;
        vec3 vel = uVel + (aSeed.yzx * 2.0 - 1.0) * uJitter;
        vec3 p = start + vel * t + vec3(0.0, -0.5 * uGravity * t * t, 0.0);
        float a = uSwirl * t + aSeed.x * 6.283;
        p.xz += vec2(cos(a), sin(a)) * uSwirl * 0.15 * t;
        vA = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uScale * (0.6 + aSeed.z * 0.8) * (1.0 - age * 0.5) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform sampler2D uMap; uniform float uOpacity;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * 2.0, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.userData.timed = [m];
  return pts;
}

// One-shot burst from a point; `uStart` is when it fired. Fades out after `life`.
export function burst({ count = 30, color = '#ffd36b', size = 0.12, life = 0.7, speed = 2.6, gravity = 3, up = 0.6, additive = true } = {}) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uStart: { value: 0 }, uLife: { value: life }, uSize: { value: size }, uSpeed: { value: speed },
      uGravity: { value: gravity }, uUp: { value: up }, uColor: { value: new THREE.Color(color) }, uMap: { value: softSprite() }, uScale: { value: 600 },
    },
    vertexShader: `
      uniform float uTime, uStart, uLife, uSize, uSpeed, uGravity, uUp, uScale;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        float t = uTime - uStart;
        float age = clamp(t / uLife, 0.0, 1.0);
        float th = aSeed.x * 6.283, ph = acos(aSeed.y * 2.0 - 1.0);
        vec3 dir = vec3(sin(ph) * cos(th), abs(cos(ph)) * uUp + (1.0 - uUp) * cos(ph), sin(ph) * sin(th));
        float sp = uSpeed * (0.35 + aSeed.z * 0.65);
        float tt = t * (1.0 - age * 0.45);
        vec3 p = dir * sp * tt + vec3(0.0, -0.5 * uGravity * tt * tt, 0.0);
        vA = (t < 0.0 || age >= 1.0) ? 0.0 : 1.0 - age * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uScale * (0.5 + aSeed.w) * (1.0 - age * 0.6) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform sampler2D uMap;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * 2.4, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.userData.timed = [m];
  pts.userData.life = life;
  return pts;
}

// Sets uTime on every timed material under `root`.
export function setTime(root, t) {
  root.traverse((o) => {
    const list = o.userData.timed;
    if (list) for (const m of list) m.uniforms.uTime.value = t;
  });
}

export function glowSprite(color, scale = 1, opacity = 1, map = softSprite()) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  s.scale.setScalar(scale);
  return s;
}
