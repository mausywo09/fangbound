// Night of Fangs, the Halloween event, in 3D: props (carved pumpkins, witch hats, hoods,
// bat wings, candles, tombstones, bolts), a costume for every monster, Hollowjack and the
// Hollow King, and the haunted arena dressing (tombstones, dead trees, lanterns, ghosts,
// bats across the moon). Everything repeats every LOOP seconds like the rest of the stage.
import * as THREE from 'three';
import { MAT, geo, part, group, taper, lathe, flameGeo, flameMaterial, emitter, glowSprite, eyes } from './kit.js';

const LOOP = 12;
const TAU = Math.PI * 2;
const cache = new Map();
const cached = (key, make) => cache.get(key) ?? (cache.set(key, make()), cache.get(key));
const keepOf = (o) => o.keep ?? ((m) => m);

// ---- carved pumpkins ----

// A ribbed, squashed sphere with dimples at the stem and the base.
function pumpkinGeo(ribs, squash) {
  return cached(`pk${ribs}:${squash}`, () => {
    const g = new THREE.SphereGeometry(1, 72, 40);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x);
      const rib = 0.9 + 0.1 * Math.sqrt(Math.abs(Math.cos((a * ribs) / 2)));
      const xz = Math.hypot(v.x, v.z);
      const dimple = 0.16 * Math.max(0, 1 - xz / 0.32) ** 2 * Math.sign(v.y);
      p.setXYZ(i, v.x * rib, v.y * squash - dimple, v.z * rib);
    }
    g.computeVertexNormals();
    return g;
  });
}

// The carved face, drawn on the sphere's UVs so it looks along +x (u = 0.5).
function drawFace(g, W, H, fill) {
  const cx = W / 2;
  g.fillStyle = fill;
  const poly = (pts) => { g.beginPath(); g.moveTo(...pts[0]); for (const q of pts.slice(1)) g.lineTo(...q); g.closePath(); g.fill(); };
  for (const s of [-1, 1]) poly([[cx + s * 18, 112], [cx + s * 78, 100], [cx + s * 50, 70]]);
  poly([[cx - 11, 134], [cx + 11, 134], [cx, 118]]);
  g.beginPath();
  g.moveTo(cx - 92, 140);
  g.quadraticCurveTo(cx, 214, cx + 92, 140);
  g.quadraticCurveTo(cx, 170, cx - 92, 140);
  g.fill();
  // Two teeth left standing in the grin.
  g.globalCompositeOperation = 'destination-out';
  for (const x of [-30, 26]) g.fillRect(cx + x, 152, 16, 15);
  g.globalCompositeOperation = 'source-over';
}

function faceTextures(ribs) {
  return cached(`face${ribs}`, () => {
    const W = 512;
    const H = 256;
    const canvas = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
    const col = canvas();
    const g = col.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#8a3a08');
    grad.addColorStop(0.45, '#e2701c');
    grad.addColorStop(1, '#6a2604');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Darker grooves between the ribs, and faint streaks.
    g.filter = 'blur(5px)';
    for (let k = 0; k < ribs; k++) {
      const x = ((0.5 + k / ribs) % 1) * W;
      g.fillStyle = 'rgba(60,18,0,0.55)';
      g.fillRect(x - 5, 0, 10, H);
    }
    g.filter = 'none';
    const plain = canvas();
    plain.getContext('2d').drawImage(col, 0, 0);
    const lit = canvas();
    const e = lit.getContext('2d');
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, H);
    e.shadowColor = '#ff6a00';
    e.shadowBlur = 14;
    drawFace(e, W, H, '#ffc94a');
    drawFace(g, W, H, '#1a0600');
    const tex = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    return { face: tex(col), plain: tex(plain), glow: tex(lit) };
  });
}

/** A pumpkin at p (radius r), carved and glowing unless face is false; its face looks along +x. */
export function pumpkin(parent, { p = [0, 0, 0], r = 0.3, face = true, ribs = 10, squash = 0.78, rot = 0, tilt = 0, k = 2.6, glow = '#ff9a2a', keep, stem = true } = {}) {
  const g = group(parent, { p, r: [0, rot, tilt] });
  const t = faceTextures(ribs);
  const mat = keepOf({ keep })(new THREE.MeshPhysicalMaterial({
    map: face ? t.face : t.plain, roughness: 0.52, sheen: 0.4, sheenColor: new THREE.Color('#ffb070'), clearcoat: 0.15, clearcoatRoughness: 0.6,
    ...(face && { emissiveMap: t.glow, emissive: new THREE.Color('#ffffff'), emissiveIntensity: k }),
  }));
  part(g, pumpkinGeo(ribs, squash), mat, { s: r });
  if (stem) {
    const sm = keepOf({ keep })(MAT.skin('#3b4a1c', { rough: 0.85 }));
    part(g, taper([[0, r * squash * 0.82, 0], [r * 0.04, r * squash * 1.1, 0], [r * 0.22, r * squash * 1.32, r * 0.05]], r * 0.11, r * 0.05), sm);
  }
  if (face) {
    const s = glowSprite(glow, r * 3.4, 0.2);
    s.position.set(r * 1.1, -r * 0.1, 0);
    g.add(s);
  }
  return g;
}

// ---- costume props ----

/** A witch hat with a drooping brim and a bent tip, sitting at p. */
export function witchHat(parent, { p, r = 0.3, h = 0.6, tilt = 0.2, bend = 0.25, color = '#21103a', band = '#ff7a1a', keep } = {}) {
  const k = keepOf({ keep });
  const g = lathe([[0.001, 0.004], [r * 0.5, 0.0], [r * 0.85, -0.025 * r], [r, -0.08 * r], [r * 1.02, -0.05 * r], [r * 0.6, 0.02 * r], [r * 0.4, 0.04 * r],
    [r * 0.36, h * 0.12], [r * 0.27, h * 0.4], [r * 0.15, h * 0.72], [r * 0.05, h * 0.93], [0.001, h]], 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > h * 0.42) pos.setX(i, pos.getX(i) - ((y - h * 0.42) / (h * 0.58)) ** 2 * bend * h);
  }
  g.computeVertexNormals();
  const felt = k(MAT.fur(color, { bump: 0.4 }));
  felt.side = THREE.DoubleSide;
  const hat = group(parent, { p, r: [0, 0, tilt] });
  part(hat, g, felt);
  part(hat, new THREE.TorusGeometry(r * 0.37, r * 0.045, 8, 40), k(MAT.gloss(band, { rough: 0.35, emit: band, emitK: 0.35 })), { p: [0, h * 0.06, 0], r: [Math.PI / 2, 0, 0] });
  part(hat, new THREE.BoxGeometry(r * 0.05, r * 0.14, r * 0.16), k(MAT.metal('#e8c060', { rough: 0.3 })), { p: [r * 0.38, h * 0.06, 0] });
  return hat;
}

/** A reaper's hood around a head at p, open toward +x. */
export function hood(parent, { p, s = [0.3, 0.3, 0.3], color = '#120a18', keep } = {}) {
  const k = keepOf({ keep });
  const cloth = k(MAT.fur(color, { bump: 0.6 }));
  cloth.side = THREE.DoubleSide;
  const g = group(parent, { p });
  part(g, new THREE.SphereGeometry(1, 40, 24, Math.PI + 1.05, TAU - 2.1, 0, Math.PI * 0.64), cloth, { s });
  part(g, geo.cone(12), cloth, { p: [-s[0] * 0.55, s[1] * 0.7, 0], s: [s[0] * 0.3, s[1] * 0.8, s[2] * 0.3], r: [0, 0, 1.1] });
  return g;
}

function wingShape(span, h) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05 * h);
  s.quadraticCurveTo(span * 0.35, h * 0.85, span * 0.72, h * 0.72);
  s.lineTo(span, h * 0.95);
  const fingers = [[span * 0.84, h * 0.08], [span * 0.58, -h * 0.04], [span * 0.3, -h * 0.12], [0, -h * 0.12]];
  let from = [span, h * 0.95];
  for (const to of fingers) {
    s.quadraticCurveTo((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + h * 0.26, to[0], to[1]);
    from = to;
  }
  return new THREE.ShapeGeometry(s, 10);
}

/** Two flapping bat wings on the back at p, spanning `span` to each side. */
export function batWings(parent, rig, { p, span = 0.6, h = 0.42, color = '#1a0c16', rate = 5, keep } = {}) {
  const k = keepOf({ keep });
  const skin = k(MAT.skin(color, { rough: 0.55, emit: '#ff3a6a', emitK: 0.05 }));
  skin.side = THREE.DoubleSide;
  const bone = k(MAT.skin('#0c060a', { rough: 0.6 }));
  for (const side of [1, -1]) {
    const flap = group(parent, { p: [p[0], p[1], p[2] + side * 0.04] });
    const w = group(flap, { r: [0, -side * Math.PI / 2, 0] });
    part(w, wingShape(span, h), skin);
    part(w, taper([[0, 0, 0.005], [span * 0.35, h * 0.62, 0.005], [span * 0.72, h * 0.72, 0.005], [span, h * 0.95, 0.005]], 0.018, 0.006, { radial: 6 }), bone);
    rig.tickers.push((tt) => { flap.rotation.x = -side * (0.35 + Math.sin(tt * rate) * 0.42); flap.rotation.z = 0.25; });
  }
}

/** A wax candle at p with a live flame. */
export function candle(parent, { p, h = 0.2, r = 0.035, keep } = {}) {
  const k = keepOf({ keep });
  const g = group(parent, { p });
  const wax = k(MAT.skin('#e8dcc0', { rough: 0.45 }));
  part(g, new THREE.CylinderGeometry(r, r * 1.08, h, 14).translate(0, h / 2, 0), wax);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2 + 0.4;
    part(g, geo.capsule(r * 0.22, h * (0.15 + i * 0.1)), wax, { p: [Math.cos(a) * r, h * (0.82 - i * 0.12), Math.sin(a) * r] });
  }
  const f = part(g, flameGeo(r * 0.7, r * 3.2), flameMaterial({ speed: 1.6, core: '#fff8d0', mid: '#ffb030', edge: '#c03000', power: 1.6 }), { p: [0, h + 0.005, 0], shadow: false });
  f.userData.timed = [f.material];
  const s = glowSprite('#ffb040', r * 9, 0.32);
  s.position.set(0, h + r * 1.6, 0);
  g.add(s);
  return g;
}

/** A tombstone at p (front facing +z), with a faint glowing cross. */
export function tombstone(parent, { p, w = 0.34, h = 0.48, d = 0.09, rot = 0, lean = 0, color = '#3a3640', glow = '#7dffb0', keep } = {}) {
  const k = keepOf({ keep });
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.2, bevelSize: d * 0.2, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -d / 2);
  const stone = group(parent, { p, r: [lean, rot, lean * 0.6] });
  part(stone, g, k(MAT.rock(color, { flat: false, bump: 1.2 })));
  const cross = k(MAT.glow(glow, 1.5));
  part(stone, new THREE.BoxGeometry(w * 0.08, h * 0.42, 0.01), cross, { p: [0, h * 0.5, d * 0.72], shadow: false });
  part(stone, new THREE.BoxGeometry(w * 0.34, w * 0.08, 0.01), cross, { p: [0, h * 0.6, d * 0.72], shadow: false });
  return stone;
}

/** Frankenstein's bolts through the neck, at ±z of p. */
function bolts(parent, { p, len = 0.14, r = 0.03, keep }) {
  const k = keepOf({ keep });
  const steel = k(MAT.metal('#8a8f98', { rough: 0.35 }));
  for (const side of [1, -1]) {
    part(parent, new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2), steel, { p: [p[0], p[1], side * (p[2] + len * 0.3)] });
    part(parent, new THREE.CylinderGeometry(r * 1.9, r * 1.9, r * 1.1, 6).rotateX(Math.PI / 2), steel, { p: [p[0], p[1], side * (p[2] + len * 0.78)] });
  }
}

/** A stitched scar along points on a surface. */
function stitches(parent, pts, keep) {
  const thread = keepOf({ keep })(MAT.skin('#0a0606', { rough: 0.8 }));
  part(parent, taper(pts, 0.012, 0.012, { radial: 6 }), thread, { shadow: false });
  const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  for (let i = 1; i < 6; i++) {
    const at = c.getPoint(i / 6);
    const tg = c.getTangent(i / 6);
    const st = part(parent, new THREE.BoxGeometry(0.012, 0.09, 0.012), thread, { p: at.toArray(), shadow: false });
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-tg.y, tg.x, tg.z).normalize());
  }
}

// ---- recolouring ----

const HSL = {};
// Turns every glow, emissive, flame, sprite and particle colour whose hue is in [h0, h1]
// to hue `to` (and saturation, if given), keeping its brightness.
export function shiftHue(rig, h0, h1, to, sat) {
  const fix = (c) => {
    if (!c) return;
    const m = Math.max(c.r, c.g, c.b);
    if (m <= 0) return;
    c.multiplyScalar(1 / m).getHSL(HSL);
    if (HSL.s > 0.2 && HSL.h >= h0 && HSL.h <= h1) c.setHSL(to, sat ?? HSL.s, HSL.l);
    c.multiplyScalar(m);
  };
  rig.root.traverse((o) => {
    const mat = o.material;
    if (!mat) return;
    if (mat.isMeshBasicMaterial || mat.isSpriteMaterial) fix(mat.color);
    if (mat.emissive) { fix(mat.emissive); fix(mat.userData.baseEmissive); }
    for (const u of ['uColor', 'uCore', 'uMid', 'uEdge']) fix(mat.uniforms?.[u]?.value);
  });
}

// Recolours lit materials created with an exact colour ({ 'cdc4a0': '#ff8a1a' }).
function recolor(rig, map) {
  const want = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), new THREE.Color(v)]));
  rig.root.traverse((o) => {
    const mat = o.material;
    if (!mat?.color || mat.isMeshBasicMaterial) return;
    const to = want[mat.color.getHexString()];
    if (to) mat.color.copy(to);
  });
}

// ---- the costumes ----

// Each costume adds props to the body (or the head group, which sways with the head) and
// recolours parts. Coordinates are the monster's own (it faces +x).
const COSTUMES = {
  cindertusk(rig, k) { pumpkin(rig.body, { p: [-0.16, 1.58, 0], r: 0.44, rot: -0.2, keep: k }); },
  flarefox(rig) {
    recolor(rig, { a3321a: '#3a3646', '3d1c13': '#1e1a26' });
    shiftHue(rig, 0, 0.13, 0.4, 0.9);
  },
  emberwisp(rig, k) { pumpkin(rig.body, { p: [0.13, 0.7, 0], r: 0.31, k: 3, keep: k }); },
  thornhog(rig, k) {
    recolor(rig, { cdc4a0: '#ff8a1a' });
    pumpkin(rig.body, { p: [0.16, 1.22, 0], r: 0.17, keep: k });
  },
  vinelash(rig, k) {
    hood(rig.head, { p: [-0.04, 0.06, 0], s: [0.34, 0.36, 0.38], color: '#2a1c36', keep: k });
    // A reaper's cloak over the shoulders.
    const cloak = keepOf({ keep: k })(MAT.fur('#2a1c36', { bump: 0.6 }));
    cloak.side = THREE.DoubleSide;
    part(rig.body, new THREE.ConeGeometry(0.3, 0.62, 28, 1, true), cloak, { p: [0.08, 0.88, 0], r: [0, 0, -0.5] });
  },
  sproutling(rig, k) { pumpkin(rig.head, { p: [0.0, 0.27, 0], r: 0.3, squash: 0.62, keep: k }); },
  bouldrake(rig, k) {
    recolor(rig, { '4ab8ff': '#6aff9a' });
    shiftHue(rig, 0.5, 0.66, 0.38);
    for (const [x, y, z, h] of [[-0.5, 1.1, 0.24, 0.24], [0.14, 1.18, -0.26, 0.2], [-0.16, 1.22, 0.32, 0.17]]) candle(rig.body, { p: [x, y, z], h, keep: k });
  },
  gravelclaw(rig) { recolor(rig, { '16110d': '#d8ccb0', '2f271f': '#141018', '57412f': '#4a4650' }); },
  geowl(rig, k) { witchHat(rig.head, { p: [-0.02, 0.26, 0], r: 0.44, h: 0.84, tilt: 0.2, keep: k }); },
  ohmhorn(rig, k) {
    shiftHue(rig, 0.1, 0.18, 0.33);
    bolts(rig.head, { p: [-0.14, -0.12, 0.36], len: 0.2, r: 0.04, keep: k });
    // Scars stitched across the flanks (points just outside the body's ellipsoid).
    const surf = (x, y, s) => [x, y, s * (0.012 + 0.58 * Math.sqrt(Math.max(0, 1 - ((x + 0.05) / 0.8) ** 2 - ((y - 0.74) / 0.56) ** 2)))];
    for (const s of [1, -1]) stitches(rig.body, [surf(-0.5, 0.98, s), surf(-0.22, 0.84, s), surf(0.12, 0.92, s)], k);
  },
  joltcub(rig, k) { batWings(rig.body, rig, { p: [-0.08, 0.8, 0], span: 0.62, h: 0.42, keep: k }); },
  buzzmoth(rig) { shiftHue(rig, 0.1, 0.18, 0.07); },
  shellguard(rig, k) {
    tombstone(rig.body, { p: [-0.2, 0.98, -0.05], rot: 0.6, lean: -0.1, keep: k });
    candle(rig.body, { p: [0.25, 0.94, 0.28], h: 0.18, keep: k });
    candle(rig.body, { p: [-0.48, 0.84, -0.22], h: 0.14, keep: k });
  },
  riptide(rig) {
    recolor(rig, { 163454: '#2c3a3e', '8aa1b3': '#b8c4bc', '0a1d35': '#1a2226' });
    shiftHue(rig, 0.45, 0.56, 0.38);
  },
  mistling(rig) {
    recolor(rig, { '2a4a8a': '#c4cce8', '5a3aa8': '#e4e2f6' });
    shiftHue(rig, 0.5, 0.75, 0.36, 0.5);
  },
};

export function haunt(rig, id) {
  COSTUMES[id]?.(rig, (m) => rig.keep(m));
}

// ---- Hollowjack and the Hollow King ----

// A floating scarecrow: carved pumpkin head under a witch hat, a ragged cloak, stick arms
// with straw, and a swinging lantern. king: the raid boss, bigger, crowned, two lanterns.
export function buildHollowjack(rig, king = false) {
  const { m, body } = rig;
  const k = (x) => rig.keep(x);
  rig.float = king ? 0.5 : 0.42;
  rig.breath = 0.03;
  // The cloak: shoulders flaring into rags, its hem torn into points.
  const cloth = m.fur(king ? '#1a0a24' : '#2a1438', { bump: 0.8 });
  cloth.side = THREE.DoubleSide;
  const cg = lathe([[0.001, 1.13], [0.15, 1.11], [0.25, 1.03], [0.29, 0.86], [0.33, 0.6], [0.4, 0.32], [0.47, 0.1], [0.5, 0.02]], 56);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i);
    if (y < 0.34) {
      const a = Math.atan2(cp.getZ(i), cp.getX(i));
      const torn = Math.max(0, Math.sin(a * 7)) * 0.2 + Math.max(0, Math.sin(a * 13 + 1)) * 0.07;
      cp.setY(i, y - torn * (1 - y / 0.34));
    }
  }
  cg.computeVertexNormals();
  part(body, cg, cloth);
  part(body, geo.sphere(), m.fur('#3a2410'), { p: [0, 1.04, 0], s: [0.2, 0.1, 0.2] });
  // A collar of vines and straw tufts.
  const vine = m.skin('#2e4a18', { rough: 0.7 });
  part(body, new THREE.TorusGeometry(0.2, 0.035, 8, 30), vine, { p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] });
  const straw = m.skin('#c8a04a', { rough: 0.9 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    part(body, geo.cone(5), straw, { p: [Math.cos(a) * 0.2, 1.02, Math.sin(a) * 0.2], s: [0.025, 0.14, 0.025], r: [Math.sin(a) * 2.6, 0, -Math.cos(a) * 2.6] });
  }
  const head = group(body, { p: [0.02, 1.36, 0] });
  rig.head = head;
  pumpkin(head, { r: king ? 0.36 : 0.32, k: king ? 3.4 : 3, keep: k });
  if (king) {
    // A crown of black thorns and ember crystals.
    const crown = group(head, { p: [0, 0.27, 0] });
    const thorn = m.gloss('#0c0810', { rough: 0.25 });
    const gem = m.crystal('#ff7a1a', { glow: 1.6 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      part(crown, geo.cone(6), thorn, { p: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], s: [0.035, 0.22 + (i % 2) * 0.1, 0.035], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] });
      if (i % 2 === 0) part(crown, new THREE.OctahedronGeometry(0.04), gem, { p: [Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2], shadow: false });
    }
    part(crown, new THREE.TorusGeometry(0.21, 0.02, 8, 40), m.metal('#c08a32', { rough: 0.3 }), { r: [Math.PI / 2, 0, 0] });
  } else {
    witchHat(head, { p: [-0.02, 0.2, 0], r: 0.34, h: 0.6, tilt: 0.22, keep: k });
  }
  rig.tickers.push((t) => { head.rotation.z = Math.sin(t * 0.9) * 0.08; head.rotation.y = Math.sin(t * 0.6) * 0.12; });
  // Stick arms with straw hands; the right one (or both, for the king) holds a lantern.
  const wood = m.skin('#3a2614', { rough: 0.85, bump: 0.8 });
  for (const s of [1, -1]) {
    const arm = group(body, { p: [0.02, 1.0, 0.18 * s] });
    part(arm, taper([[0, 0, 0], [0.12, -0.05, 0.22 * s], [0.3, -0.12, 0.34 * s]], 0.03, 0.018), wood);
    for (let i = 0; i < 4; i++) part(arm, geo.cone(5), straw, { p: [0.3, -0.12, 0.34 * s], s: [0.02, 0.12, 0.02], r: [s * (1.4 + i * 0.3), 0, -1.8 + i * 0.35] });
    if (s === 1 || king) {
      const swing = group(arm, { p: [0.3, -0.14, 0.34 * s] });
      part(swing, taper([[0, 0, 0], [0, -0.16, 0]], 0.006, 0.006, { radial: 5 }), m.metal('#4a3a2a'));
      pumpkin(swing, { p: [0, -0.24, 0], r: 0.09, ribs: 8, k: 3.4, keep: k, stem: false });
      rig.tickers.push((t) => { swing.rotation.x = Math.sin(t * 1.7 + s) * 0.25; swing.rotation.z = Math.sin(t * 1.3) * 0.12; });
    }
    rig.tickers.push((t) => { arm.rotation.x = s * Math.sin(t * 1.1 + s) * 0.08; });
  }
  const wisps = emitter({ count: king ? 40 : 24, color: '#ff8a2a', size: 0.06, life: 1.8, spread: [0.35, 0.05, 0.35], velocity: [0, -0.25, 0], jitter: 0.12 });
  wisps.position.set(0, 0.12, 0);
  body.add(wisps);
  const ghostly = emitter({ count: king ? 30 : 16, color: '#8a5aff', size: 0.09, life: 2.4, spread: [0.3, 0.05, 0.3], velocity: [0, 0.3, 0], jitter: 0.1, swirl: 1.2 });
  ghostly.position.set(0, 0.2, 0);
  body.add(ghostly);
  const g = glowSprite('#ff8a2a', king ? 2.4 : 1.6, 0.18);
  g.position.set(0.1, 1.36, 0);
  body.add(g);
  rig.height = 2.0;
  rig.width = 0.95;
  // The king stands 1.45× as tall; width stays in model units (the contact shadow and
  // rings are children of the scaled root).
  if (king) {
    rig.root.scale.setScalar(1.45);
    rig.height *= 1.45;
  }
}

// ---- the haunted arena ----

let GHOST = null;
// A sheet ghost: a rounded top, a wavy hem, hollow eyes and mouth (white on transparent).
export function ghostTexture() {
  if (GHOST) return GHOST;
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 160 });
  const g = c.getContext('2d');
  g.shadowColor = '#bfffe8';
  g.shadowBlur = 16;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(22, 130);
  g.lineTo(22, 64);
  g.arc(64, 64, 42, Math.PI, 0);
  g.lineTo(106, 130);
  for (let i = 0; i < 4; i++) g.quadraticCurveTo(106 - i * 21 - 10, 150 - (i % 2) * 18, 106 - (i + 1) * 21, 132);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#0a0612';
  for (const x of [48, 80]) { g.beginPath(); g.ellipse(x, 66, 8, 12, 0, 0, TAU); g.fill(); }
  g.beginPath();
  g.ellipse(64, 96, 9, 12, 0, 0, TAU);
  g.fill();
  GHOST = new THREE.CanvasTexture(c);
  GHOST.colorSpace = THREE.SRGBColorSpace;
  return GHOST;
}

export function ghostSprite(scale = 1, opacity = 0.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTexture(), color: new THREE.Color('#d8fff0').multiplyScalar(1.4), transparent: true, opacity, depthWrite: false }));
  s.scale.set(scale * 0.8, scale, 1);
  return s;
}

// A small flapping bat silhouette.
function bat(parent, size) {
  const g = group(parent);
  const black = new THREE.MeshBasicMaterial({ color: '#030204', fog: false, side: THREE.DoubleSide });
  part(g, geo.sphere(12), black, { s: [size * 0.32, size * 0.22, size * 0.2], shadow: false });
  const wings = [];
  for (const side of [1, -1]) {
    const w = group(g);
    const mesh = part(w, wingShape(size, size * 0.6), black, { r: [0, -side * Math.PI / 2, 0], shadow: false });
    mesh.position.z = side * size * 0.05;
    wings.push({ w, side });
  }
  g.userData.flap = (t) => { for (const { w, side } of wings) w.rotation.x = -side * Math.sin(t) * 0.9; };
  return g;
}

function deadTree(parent, { p, h = 3, seed = 1, keep }) {
  const bark = keepOf({ keep })(MAT.rock('#17121b', { flat: false, bump: 1.4 }));
  const g = group(parent, { p });
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const limb = (from, dir, len, r, depth) => {
    const mid = from.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3));
    const to = from.clone().addScaledVector(dir, len);
    part(g, taper([from.toArray(), mid.toArray(), to.toArray()], r, r * 0.5, { radial: 8, seg: 16 }), bark);
    if (depth <= 0) return;
    for (let i = 0; i < (depth > 1 ? 3 : 2); i++) {
      const d = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.5, (rnd() - 0.5) * 1.6)).normalize();
      limb(from.clone().lerp(to, 0.6 + rnd() * 0.4), d, len * (0.5 + rnd() * 0.2), r * 0.55, depth - 1);
    }
  };
  limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, 1, 0).normalize(), h * 0.55, 0.16, 2);
  return g;
}

// Dresses the arena for Halloween and returns { update(t) }.
export function hauntArena(root, q) {
  const k = (m) => m;
  // Tombstones around the back half, facing the fight.
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + 0.25 + (i / 12) * (Math.PI - 0.5);
    const r = 5.0 + ((i * 7) % 4) * 0.12;
    const t = tombstone(root, { p: [Math.cos(a) * r, 0, Math.sin(a) * r], w: 0.32 + (i % 3) * 0.06, h: 0.42 + ((i * 5) % 4) * 0.08, lean: ((i % 5) - 2) * 0.06, keep: k });
    t.lookAt(0, 0, 0);
    t.rotateZ(((i % 3) - 1) * 0.08);
  }
  // Two dead trees behind the ring.
  deadTree(root, { p: [-5.0, 0, -3.4], h: 3.6, seed: 11 });
  deadTree(root, { p: [5.3, 0, -2.8], h: 3.1, seed: 29 });
  // Small pumpkins on the ground, some carved and lit.
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + 0.1 + (i / 9) * (Math.PI - 0.2) + (i % 2) * 0.12;
    const r = 4.95 + (i % 3) * 0.3;
    const pk = pumpkin(root, { p: [Math.cos(a) * r, 0.12, Math.sin(a) * r], r: 0.16 + (i % 3) * 0.05, face: i % 2 === 0, k: 2.8 });
    pk.lookAt(0, 0.12, 0);
    pk.rotateY(-Math.PI / 2);
  }
  // Candles at the gate's feet.
  for (const [x, z, h] of [[-1.85, -5.15, 0.32], [-1.6, -5.35, 0.22], [-2.05, -5.45, 0.18], [1.95, -5.1, 0.28], [2.2, -5.3, 0.2], [1.7, -5.4, 0.15]]) candle(root, { p: [x, 0, z], h, r: 0.05 });
  // Ghosts drifting around the rim, fading in and out.
  const ghosts = [];
  for (let i = 0; i < (q.high ? 6 : 4); i++) {
    const s = ghostSprite(0.6 + (i % 3) * 0.18, 0);
    root.add(s);
    ghosts.push({ s, r: 6.4 + (i % 3) * 0.9, y: 1.4 + (i % 4) * 0.45, ph: i * 1.3, dir: i % 2 ? 1 : -1 });
  }
  // Bats: a cloud of them crossing the moon, and a few swooping over the arena.
  const bats = [];
  for (let i = 0; i < (q.high ? 16 : 9); i++) {
    const far = i < (q.high ? 12 : 7);
    const b = bat(root, far ? 0.75 + (i % 3) * 0.25 : 0.36);
    bats.push({ b, far, ph: i * 0.77, rate: 16 + (i % 4) * 3, r: far ? 7 + (i % 5) * 1.6 : 6.5 + (i % 3), y: far ? 8 + (i % 4) * 1.0 : 3.6 + (i % 2) * 0.8 });
  }
  const wisps = emitter({ count: q.high ? 60 : 30, color: '#7dffa8', size: 0.06, life: 6, spread: [8, 0.5, 6], velocity: [0, 0.3, 0], jitter: 0.15, swirl: 1.1 });
  wisps.position.set(0, -0.2, -1);
  root.add(wisps);
  return {
    update(t) {
      const w = (TAU * t) / LOOP;
      // Ghosts sway along the back half of the rim only, never between camera and fight.
      for (const g of ghosts) {
        const a = Math.PI + 0.35 + (Math.PI - 0.7) * (0.5 + 0.5 * Math.sin(g.dir * w + g.ph));
        g.s.position.set(Math.cos(a) * g.r, g.y + Math.sin(w * 2 + g.ph) * 0.25, Math.sin(a) * g.r - 0.5);
        // Fades follow the loop, so the video repeats without a seam.
        g.s.material.opacity = 0.45 * Math.max(0, Math.sin(w + g.ph)) ** 1.5;
      }
      for (const x of bats) {
        const a = w + x.ph;
        if (x.far) x.b.position.set(Math.cos(a) * x.r + 4, x.y + Math.sin(a * 2) * 1.4, -62 + Math.sin(a) * x.r * 0.5);
        else x.b.position.set(Math.cos(a) * x.r, x.y + Math.sin(a * 3) * 0.4, Math.sin(a) * x.r * 0.7 - 1.5);
        x.b.rotation.y = -a + (x.far ? 0 : Math.PI / 2);
        x.b.userData.flap(t * x.rate + x.ph);
      }
    },
  };
}
