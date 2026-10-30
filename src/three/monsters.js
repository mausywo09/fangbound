// The monsters (and the raid boss) as 3D models built from code. Each one faces +x, stands on y = 0 and
// comes back as a rig: `root` (placed by the battle), `pivot` (lunges, knockback, falls),
// `body` (idle breathing and bobbing) and `tick(t)` for its own idle motion.
// The look: dark hides and shells, glowing eyes under a heavy brow, horns, fangs, and
// element light (lava cracks, runes, charged stripes, bioluminescence) showing through.
import * as THREE from 'three';
import { MAT, geo, part, group, taper, leaf, lathe, rockGeo, eyes, fangs, horn, flameMaterial, flameGeo, emitter, glowSprite, mergeSimple, softSprite } from './kit.js';
import { BY_ID, ELEMENTS } from '../data.js';
import { THEME } from '../theme.js';
import { haunt, buildHollowjack } from './halloween.js';

const UP = new THREE.Vector3(0, 1, 0);

// Point on an ellipsoid (center c, radii s) in direction d; k < 1 sinks it in.
function on(c, s, d, k = 1) {
  const u = new THREE.Vector3(...d).normalize();
  return [c[0] + s[0] * u.x * k, c[1] + s[1] * u.y * k, c[2] + s[2] * u.z * k];
}

// Outward surface normal of that ellipsoid at direction d.
function normalOn(s, d) {
  const u = new THREE.Vector3(...d).normalize();
  return new THREE.Vector3(u.x / s[0], u.y / s[1], u.z / s[2]).normalize();
}

// Places a +y-pointing mesh so it sticks out of the surface along the normal.
function stickOut(mesh, normal, roll = 0) {
  mesh.quaternion.setFromUnitVectors(UP, normal);
  if (roll) mesh.rotateY(roll);
}

// Evenly spread directions on a sphere (Fibonacci), filtered by `keep`.
function spread(n, keep) {
  const out = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const d = [Math.cos(g * i) * r, y, Math.sin(g * i) * r];
    if (keep(d)) out.push(d);
  }
  return out;
}

// A glowing line drawn on an ellipsoid's surface through the given directions.
function vein(parent, c, s, dirs, mat, r0 = 0.025, r1 = 0.01) {
  return part(parent, taper(dirs.map((d) => on(c, s, d, 0.995)), r0, r1, { radial: 8 }), mat, { shadow: false });
}

const crystalGeo = () => {
  const prism = new THREE.CylinderGeometry(0.5, 0.6, 1, 6).translate(0, 0.5, 0);
  const tip = new THREE.ConeGeometry(0.5, 0.45, 6).translate(0, 1.22, 0);
  return mergeSimple([prism, tip]);
};

// A zig-zag bolt shape, extruded thin (tail tips, stripes).
function boltGeo(size, depth = 0.04) {
  const s = new THREE.Shape();
  const pts = [[0, 1], [0.45, 1], [0.2, 0.55], [0.55, 0.55], [-0.15, -0.25], [0.1, 0.32], [-0.2, 0.32]];
  s.moveTo(pts[0][0] * size, pts[0][1] * size);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * size, y * size);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.4, bevelSegments: 2 }).translate(0, 0, -depth / 2);
}

// Moth wings: a dark map with veins and eye spots, plus a glow map with the spots alone.
function wingTextures(base, spot, vein) {
  const S = 256;
  const make = (glowOnly) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (glowOnly) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, S, S);
    } else {
      const grad = g.createRadialGradient(S * 0.2, S * 0.5, 10, S * 0.4, S * 0.5, S * 0.75);
      grad.addColorStop(0, vein);
      grad.addColorStop(0.3, base);
      grad.addColorStop(1, '#07040e');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      g.strokeStyle = vein;
      g.globalAlpha = 0.7;
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(10, S / 2);
        g.quadraticCurveTo(S * 0.5, S * (0.1 + i * 0.16), S - 10, S * (0.05 + i * 0.18));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    for (const [x, y, r] of [[0.62, 0.42, 26], [0.8, 0.7, 16], [0.45, 0.72, 12]]) {
      g.fillStyle = glowOnly ? spot : '#120a20';
      g.beginPath();
      g.arc(x * S, y * S, r + (glowOnly ? 0 : 5), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = spot;
      g.beginPath();
      g.arc(x * S, y * S, r * 0.62, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(false), emap: make(true) };
}

class Rig {
  constructor(id) {
    this.id = id;
    this.root = new THREE.Group();
    this.root.name = id;
    this.pivot = group(this.root);
    this.body = group(this.pivot);
    this.mats = [];
    this.tickers = [];
    this.height = 1.4;
    this.width = 1;
    this.float = 0;
    this.breath = 0.025;
    this.phase = Math.random() * 10;
    this.alpha = 1;
    this.tint = { color: new THREE.Color(), amount: 0 };
    // Bind the material makers so every material is remembered for hit flashes.
    this.m = Object.fromEntries(Object.entries(MAT).map(([k, make]) => [k, (...a) => this.keep(make(...a))]));
  }

  keep(mat) {
    if (mat.emissive) {
      mat.userData.baseEmissive = mat.emissive.clone().multiplyScalar(mat.emissiveIntensity);
      mat.userData.baseIntensity = mat.emissiveIntensity;
      mat.emissiveIntensity = 1;
      mat.emissive.copy(mat.userData.baseEmissive);
      this.mats.push(mat);
    }
    return mat;
  }

  // Idle motion at absolute time t (seconds).
  tick(t) {
    const tt = t + this.phase;
    const b = Math.sin(tt * 2.3);
    this.body.scale.set(1 - b * this.breath * 0.5, 1 + b * this.breath, 1 - b * this.breath * 0.5);
    if (this.float) this.body.position.y = this.float + Math.sin(tt * 1.7) * 0.07;
    for (const f of this.tickers) f(tt, t);
    this.root.userData.time = t;
  }

  // Colors every lit material toward `color` by `amount` (0..1), e.g. a hit flash.
  setTint(color, amount) {
    if (amount === this.tint.amount && (!amount || this.tint.color.equals(color))) return;
    this.tint.amount = amount;
    if (amount) this.tint.color.set(color);
    for (const m of this.mats) {
      // Added on top of the base glow, so a flash never bleaches the monster.
      m.emissive.copy(this.tint.color).multiplyScalar(amount * 0.32).add(m.userData.baseEmissive);
    }
  }

  // Fades the whole model (a defeated monster dissolving); 1 is solid.
  fade(a) {
    if (a === this.alpha) return;
    this.alpha = a;
    this.root.traverse((o) => {
      const m = o.material;
      if (!m || o === this.shadowBlob) return;
      if (m.isShaderMaterial || m.isSpriteMaterial || m.blending === THREE.AdditiveBlending) {
        o.visible = a > 0.55;
        return;
      }
      m.userData.op ??= { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
      const solid = a >= 1;
      const want = solid ? m.userData.op.transparent : true;
      if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = m.userData.op.opacity * a;
      m.depthWrite = solid ? m.userData.op.depthWrite : a > 0.7;
    });
  }
}

function legs(rig, mat, { xs, z, y = 0.2, r = 0.11, len = 0.22 }) {
  const out = [];
  for (const x of xs) for (const side of [1, -1]) out.push(part(rig.body, geo.capsule(r, len), mat, { p: [x, y, z * side] }));
  return out;
}

// Three small claws at the front of each foot.
function claws(rig, mat, { xs, z, r = 0.1, size = 0.035 }) {
  for (const x of xs) for (const side of [1, -1]) for (const dz of [-0.6, 0, 0.6]) {
    part(rig.body, geo.cone(6), mat, { p: [x + r * 0.85, 0.03, z * side + dz * r * 0.6], s: [size * 0.7, size * 2, size * 0.7], r: [0, 0, -1.4] });
  }
}

const BUILD = {
  cindertusk(rig) {
    const { m, body } = rig;
    const skin = m.skin('#3d1d16', { rough: 0.62, sheen: 0.3, bump: 0.55 });
    const dark = m.skin('#160a08', { rough: 0.75 });
    const snout = m.skin('#4c241b', { rough: 0.55 });
    const bone = m.gloss('#e7d9bc', { rough: 0.35 });
    const plate = m.metal('#2b1b15', { rough: 0.42 });
    const lava = m.glow('#ff8a1f', 3.4);
    const B = [0, 0.74, 0], BS = [0.8, 0.56, 0.6];
    part(body, geo.sphere(), skin, { p: B, s: BS });
    const H = [0.6, 0.82, 0], HS = [0.44, 0.42, 0.44];
    part(body, geo.sphere(), skin, { p: H, s: HS });
    part(body, geo.sphere(), plate, { p: [0.74, 1.04, 0], s: [0.3, 0.12, 0.36], r: [0, 0, -0.38] });
    part(body, geo.sphere(), snout, { p: [0.98, 0.7, 0], s: [0.21, 0.18, 0.22] });
    part(body, geo.sphere(), dark, { p: [1.15, 0.71, 0], s: [0.06, 0.13, 0.16] });
    for (const z of [0.06, -0.06]) part(body, geo.sphere(16), lava, { p: [1.2, 0.72, z], s: 0.03, shadow: false });
    for (const s of [1, -1]) {
      part(body, taper([[1.0, 0.6, 0.15 * s], [1.14, 0.62, 0.24 * s], [1.22, 0.86, 0.3 * s], [1.14, 1.04, 0.33 * s]], 0.062, 0.006, { power: 0.7 }), bone);
      horn(body, [[0.62, 1.1, 0.2 * s], [0.5, 1.34, 0.3 * s], [0.28, 1.45, 0.36 * s], [0.08, 1.38, 0.38 * s]], bone, 0.07);
      const ear = part(body, geo.cone(), dark, { p: [0.4, 1.06, 0.32 * s], s: [0.09, 0.22, 0.06], r: [1.0 * s, 0, -0.7] });
      rig.tickers.push((t) => { ear.rotation.x = 1.0 * s + Math.max(0, Math.sin(t * 1.3 + s)) ** 20 * 0.4 * s; });
      // Lava cracks along the flanks and face.
      vein(body, B, BS, [[-0.6, 0.4, 0.7 * s], [-0.25, 0.15, 0.95 * s], [0.05, 0.45, 0.9 * s]], lava, 0.034, 0.012);
      vein(body, B, BS, [[0.25, -0.1, 0.95 * s], [0.4, 0.3, 0.85 * s]], lava, 0.026, 0.01);
      vein(body, B, BS, [[-0.45, -0.3, 0.88 * s], [-0.12, -0.2, 0.97 * s], [0.1, -0.42, 0.9 * s]], lava, 0.024, 0.01);
      vein(body, H, HS, [[0.25, 0.25, 0.92 * s], [0.6, 0.02, 0.78 * s]], lava, 0.02, 0.008);
    }
    const E = on(H, HS, [0.62, 0.42, 0.45], 0.93);
    eyes(body, { x: E[0], y: E[1], z: E[2], r: 0.1, glow: '#ffb020', lid: { mat: dark } });
    legs(rig, dark, { xs: [0.42, -0.4], z: 0.3, y: 0.22, r: 0.13, len: 0.22 });
    claws(rig, bone, { xs: [0.42, -0.4], z: 0.3, r: 0.13 });
    part(body, taper([[-0.78, 0.82, 0], [-0.95, 0.95, 0], [-0.9, 1.08, 0.05]], 0.05, 0.02), dark);
    // Back flames over a lava ridge.
    const flames = group(body);
    for (const [x, h, r] of [[-0.42, 0.7, 0.17], [-0.08, 0.95, 0.22], [0.26, 0.6, 0.16]]) {
      const f = part(flames, flameGeo(r, h), flameMaterial({ speed: 1.1, edge: '#a01800' }), { p: [x, 1.18 + (x > 0 ? -0.04 : 0), 0], shadow: false });
      f.userData.timed = [f.material];
    }
    part(body, geo.sphere(24), lava, { p: [-0.08, 1.2, 0], s: [0.46, 0.06, 0.18], shadow: false });
    const e = emitter({ count: 30, color: '#ff9a2a', size: 0.07, life: 1.4, spread: [0.45, 0.05, 0.15], velocity: [0, 1.2, 0], jitter: 0.3 });
    e.position.set(-0.08, 1.3, 0);
    body.add(e);
    rig.height = 1.95;
    rig.width = 1.1;
  },

  flarefox(rig) {
    const { m, body } = rig;
    const fur = m.fur('#a3321a');
    const dark = m.fur('#1a0b07');
    const chest = m.fur('#3d1c13');
    const inner = m.skin('#ff5a1a', { emit: '#ff4a10', emitK: 0.9 });
    part(body, geo.sphere(), fur, { p: [-0.05, 0.6, 0], s: [0.44, 0.33, 0.3] });
    part(body, geo.sphere(), chest, { p: [0.24, 0.62, 0], s: [0.2, 0.25, 0.21] });
    const H = [0.32, 1.02, 0], HS = [0.34, 0.3, 0.32];
    const head = group(body);
    part(head, geo.sphere(), fur, { p: H, s: HS });
    part(head, geo.sphere(), dark, { p: [0.62, 0.93, 0], s: [0.23, 0.12, 0.15] });
    part(head, geo.sphere(), chest, { p: [0.42, 0.88, 0], s: [0.2, 0.13, 0.26] });
    part(head, geo.sphere(16), m.gloss('#050304', { rough: 0.15 }), { p: [0.84, 0.95, 0], s: [0.05, 0.045, 0.06] });
    fangs(head, { x: 0.74, y: 0.86, z: 0.05, len: 0.07, r: 0.018 });
    for (const s of [1, -1]) {
      part(head, geo.cone(), fur, { p: [0.2, 1.22, 0.17 * s], s: [0.12, 0.42, 0.07], r: [0.22 * s, 0, -0.28] });
      part(head, geo.cone(), inner, { p: [0.23, 1.24, 0.18 * s], s: [0.06, 0.3, 0.05], r: [0.22 * s, 0, -0.28] });
    }
    const E = on(H, HS, [0.75, 0.3, 0.45], 0.92);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.085, glow: '#ffd23a', lid: { mat: dark } });
    rig.tickers.push((t) => { head.rotation.z = Math.sin(t * 0.9) * 0.04; });
    // A burning mane down the neck.
    for (const [x, y, r, h, lean] of [[0.06, 1.1, 0.1, 0.36, 0.6], [-0.12, 0.88, 0.09, 0.3, 0.8]]) {
      const f = part(body, flameGeo(r, h), flameMaterial({ speed: 1.4, edge: '#a01800' }), { p: [x, y, 0], r: [0, 0, lean], shadow: false });
      f.userData.timed = [f.material];
    }
    legs(rig, dark, { xs: [0.22, -0.28], z: 0.15, y: 0.26, r: 0.07, len: 0.3 });
    const tail = group(body, { p: [-0.42, 0.62, 0] });
    part(tail, taper([[0, 0, 0], [-0.32, 0.12, 0], [-0.46, 0.42, 0], [-0.34, 0.72, 0]], 0.08, 0.19, { power: 0.6 }), fur);
    part(tail, geo.sphere(), dark, { p: [-0.33, 0.76, 0], s: [0.16, 0.14, 0.16] });
    const f = part(tail, flameGeo(0.21, 0.8), flameMaterial({ speed: 1.3, edge: '#a01800' }), { p: [-0.32, 0.8, 0], shadow: false });
    f.userData.timed = [f.material];
    glowAt(tail, [-0.32, 1.05, 0], '#ff6a1a', 1.0, 0.5);
    rig.tickers.push((t) => { tail.rotation.y = Math.sin(t * 2.6) * 0.3; tail.rotation.z = Math.sin(t * 1.9) * 0.08; });
    rig.height = 1.6;
  },

  emberwisp(rig) {
    const { m, body } = rig;
    rig.float = 0.45;
    rig.breath = 0.05;
    const obsidian = m.gloss('#0d0809', { rough: 0.18 });
    part(body, geo.sphere(), m.glow('#ff5a12', 0.9), { p: [0, 0.62, 0], s: [0.3, 0.32, 0.3], shadow: false });
    for (const [r, h, y, core, mid, power] of [[0.52, 1.5, 0.16, '#ffc46a', '#ff4a0a', 1.5], [0.32, 1.0, 0.32, '#fff1b8', '#ff8a1e', 1.2]]) {
      const f = part(body, flameGeo(r, h), flameMaterial({ core, mid, edge: '#8a0c00', speed: 0.9, power }), { p: [0, y, 0], shadow: false });
      f.userData.timed = [f.material];
    }
    // An obsidian mask with horns, the eyes burning through it.
    const mask = group(body, { p: [0.16, 0.66, 0] });
    part(mask, geo.sphere(32), obsidian, { s: [0.17, 0.25, 0.27] });
    part(mask, geo.cone(4), obsidian, { p: [0.06, -0.28, 0], s: [0.07, 0.16, 0.07], r: [0, 0, Math.PI] });
    eyes(mask, { x: 0.1, y: 0.03, z: 0.1, r: 0.075, glow: '#fff0a0', look: 0.2, lid: { mat: obsidian }, brow: 0.36, slit: false });
    for (const s of [1, -1]) horn(mask, [[0.02, 0.16, 0.12 * s], [0.0, 0.34, 0.2 * s], [-0.12, 0.48, 0.24 * s], [-0.26, 0.52, 0.2 * s]], obsidian, 0.045);
    rig.tickers.push((t) => { mask.rotation.z = Math.sin(t * 1.1) * 0.06; });
    const orbit = group(body, { p: [0, 0.7, 0] });
    const shard = m.gloss('#140b0a', { rough: 0.2, emit: '#ff5a1a', emitK: 0.7 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      part(orbit, new THREE.OctahedronGeometry(0.07), shard, { p: [Math.cos(a) * 0.62, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.62], s: [1, 1.8, 1], shadow: false });
    }
    rig.tickers.push((t) => { orbit.rotation.y = t * 1.2; });
    glowAt(body, [0, 0.7, 0], '#ff5a12', 1.9, 0.18);
    const e = emitter({ count: 32, color: '#ff9a3a', size: 0.06, life: 1.6, spread: [0.3, 0.1, 0.3], velocity: [0, 0.85, 0], jitter: 0.25 });
    e.position.set(0, 1.05, 0);
    body.add(e);
    const smoke = emitter({ count: 14, color: '#1a1214', size: 0.14, life: 2.2, spread: [0.2, 0.05, 0.2], velocity: [0, 0.7, 0], jitter: 0.1, additive: false, opacity: 0.55 });
    smoke.position.set(0, 1.4, 0);
    body.add(smoke);
    rig.height = 1.95;
    rig.width = 0.8;
  },

  thornhog(rig) {
    const { m, body } = rig;
    const fur = m.fur('#1d311b');
    const thorn = m.gloss('#cdc4a0', { rough: 0.38 });
    const face = m.skin('#3a2b21', { rough: 0.6 });
    const B = [0, 0.64, 0], BS = [0.64, 0.56, 0.6];
    part(body, geo.sphere(), fur, { p: B, s: BS });
    const F = [0.4, 0.6, 0], FS = [0.36, 0.35, 0.42];
    part(body, geo.sphere(), face, { p: F, s: FS });
    part(body, geo.sphere(), m.skin('#24180f'), { p: [0.74, 0.52, 0], s: [0.16, 0.12, 0.15] });
    part(body, geo.sphere(16), m.gloss('#050303'), { p: [0.89, 0.55, 0], s: 0.05 });
    for (const s of [1, -1]) part(body, taper([[0.82, 0.46, 0.08 * s], [0.9, 0.5, 0.12 * s], [0.92, 0.62, 0.13 * s]], 0.026, 0.004, { power: 0.7 }), thorn);
    for (const d of spread(140, ([x, y]) => x < 0.3 && y > -0.2)) {
      const p = on(B, BS, d, 0.86);
      const s = 0.06 + Math.abs(d[1]) * 0.02;
      const k = part(body, geo.cone(8), thorn, { p, s: [s, 0.42 + (1 - Math.abs(d[2])) * 0.1, s] });
      stickOut(k, normalOn(BS, d).lerp(new THREE.Vector3(-0.5, 0.4, 0), 0.25).normalize());
    }
    const E = on(F, FS, [0.7, 0.45, 0.5], 0.92);
    eyes(body, { x: E[0], y: E[1], z: E[2], r: 0.085, glow: '#a8ff4a', lid: { mat: fur } });
    legs(rig, m.skin('#1e140e'), { xs: [0.35, -0.3], z: 0.32, y: 0.14, r: 0.1, len: 0.1 });
    claws(rig, thorn, { xs: [0.35, -0.3], z: 0.32, r: 0.1 });
    // A poison bud on the crown.
    const sprout = group(body, { p: on(B, BS, [0.25, 1, 0], 0.97) });
    const leafM = m.skin('#2a5a22', { coat: 0.5 });
    leafM.side = THREE.DoubleSide;
    part(sprout, leaf(0.34, 0.09, { bend: 0.3 }), leafM, { r: [Math.PI / 2, -0.9, 0.9] });
    part(sprout, leaf(0.28, 0.08, { bend: 0.3 }), leafM, { r: [-Math.PI / 2, 0.9, 2.2] });
    part(sprout, geo.sphere(16), m.glow('#b8ff5a', 2.2), { p: [0, 0.08, 0], s: [0.06, 0.08, 0.06], shadow: false });
    glowAt(sprout, [0, 0.1, 0], '#9dff4a', 0.6, 0.5);
    rig.tickers.push((t) => { sprout.rotation.z = Math.sin(t * 2) * 0.12; });
    rig.height = 1.6;
    rig.width = 1.05;
  },

  vinelash(rig) {
    const { m, body } = rig;
    const green = m.skin('#2c5e26', { coat: 0.7, rough: 0.35 });
    const dark = m.skin('#132a14', { coat: 0.6, rough: 0.4 });
    const blade = m.gloss('#bdf07e', { rough: 0.22, emit: '#4aff2a', emitK: 0.32 });
    blade.side = THREE.DoubleSide;
    part(body, geo.sphere(), dark, { p: [-0.42, 0.62, 0], s: [0.44, 0.22, 0.24], r: [0, 0, 0.32] });
    for (let i = 0; i < 3; i++) part(body, new THREE.TorusGeometry(0.2 - i * 0.04, 0.02, 8, 24), m.glow('#8aff4a', 1.6), { p: [-0.3 - i * 0.18, 0.66 - i * 0.06, 0], r: [0, Math.PI / 2, 0.32], s: [1, 1.05, 1], shadow: false });
    part(body, geo.capsule(0.14, 0.36), green, { p: [0.04, 0.88, 0], r: [0, 0, -0.55] });
    const head = group(body, { p: [0.26, 1.26, 0] });
    rig.head = head;
    const HS = [0.21, 0.19, 0.25];
    part(head, geo.cone(4), green, { p: [0.02, 0.02, 0], s: [0.24, 0.36, 0.3], r: [0, Math.PI / 4, Math.PI] });
    part(head, geo.sphere(), green, { p: [0, 0.06, 0], s: [0.19, 0.15, 0.24] });
    for (const s of [1, -1]) part(head, geo.cone(6), dark, { p: [0.14, -0.2, 0.05 * s], s: [0.025, 0.1, 0.025], r: [s * 0.4, 0, Math.PI - 0.3] });
    const E = on([0, 0.06, 0], HS, [0.45, 0.4, 0.8], 0.92);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.1, glow: '#d8ff3a', look: 0.5, lid: { mat: dark }, brow: 0.3, slit: false });
    for (const s of [1, -1]) {
      part(head, taper([[0.02, 0.18, 0.08 * s], [0.05, 0.45, 0.14 * s], [0.24, 0.62, 0.28 * s]], 0.018, 0.008), dark);
      part(head, geo.sphere(12), m.glow('#d8ff5a', 2.4), { p: [0.24, 0.62, 0.28 * s], s: 0.035, shadow: false });
      const arm = group(body, { p: [0.16, 1.0, 0.15 * s] });
      part(arm, geo.capsule(0.045, 0.28), dark, { p: [0.1, 0.12, 0], r: [0, 0, -0.9] });
      part(arm, leaf(0.66, 0.12, { bend: -0.35, curl: 0.1 }), blade, { p: [0.24, 0.26, 0], r: [0, 0, 1.25] });
      rig.tickers.push((t) => { arm.rotation.z = Math.sin(t * 2.2 + s) * 0.12; arm.rotation.x = -0.15 * s; });
      for (const x of [0.02, -0.38]) {
        part(body, taper([[x, 0.66, 0.08 * s], [x + 0.06, 0.5, 0.26 * s], [x - 0.02, 0.04, 0.32 * s]], 0.035, 0.012), dark);
      }
      part(body, leaf(0.6, 0.13, { bend: 0.1 }), m.wing('#3a7a2a', { opacity: 0.7 }), { p: [-0.1, 0.78, 0.06 * s], r: [Math.PI / 2 * s, 0.25 * s, Math.PI + 0.2] });
    }
    rig.tickers.push((t) => { head.rotation.y = Math.sin(t * 0.7) * 0.15; });
    rig.height = 1.85;
  },

  sproutling(rig) {
    const { m, body } = rig;
    const fur = m.fur('#26491f');
    const moss = m.fur('#56683c');
    const bark = m.skin('#2a1c14', { rough: 0.8, bump: 0.8 });
    const leafM = m.skin('#1c4a21', { coat: 0.6 });
    leafM.side = THREE.DoubleSide;
    const bone = m.gloss('#d6ccaa', { rough: 0.4 });
    part(body, geo.sphere(), fur, { p: [0, 0.42, 0], s: [0.36, 0.38, 0.34] });
    part(body, geo.sphere(), moss, { p: [0.16, 0.4, 0], s: [0.22, 0.27, 0.23] });
    const head = group(body, { p: [0.12, 0.96, 0] });
    rig.head = head;
    const HS = [0.36, 0.32, 0.36];
    part(head, geo.sphere(), fur, { s: HS });
    part(head, geo.sphere(), bark, { p: [0.26, -0.08, 0], s: [0.13, 0.1, 0.17] });
    part(head, geo.sphere(16), m.gloss('#050303'), { p: [0.37, -0.03, 0], s: [0.03, 0.025, 0.04] });
    const E = on([0, 0, 0], HS, [0.72, 0.18, 0.5], 0.92);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.095, glow: '#c8ff6a', lid: { mat: fur } });
    for (const s of [1, -1]) {
      const ear = group(head, { p: [-0.05, 0.24, 0.14 * s] });
      part(ear, leaf(0.72, 0.13, { bend: 0.2 }), leafM, { r: [0, 0.2 * s, Math.PI / 2 - 0.35] });
      rig.tickers.push((t) => { ear.rotation.x = 0.2 * s + Math.sin(t * 1.8 + s * 0.6) * 0.1; });
      horn(head, [[0.05, 0.22, 0.08 * s], [0.04, 0.38, 0.12 * s], [-0.06, 0.5, 0.14 * s]], bone, 0.032);
    }
    // A glowing seed in a crown of thorns.
    const crown = group(head, { p: [0.04, 0.3, 0] });
    part(crown, geo.sphere(16), m.glow('#c8ff6a', 2.6), { p: [0, 0.06, 0], s: [0.07, 0.09, 0.07], shadow: false });
    glowAt(crown, [0, 0.08, 0], '#b8ff5a', 0.9, 0.55);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(crown, geo.cone(6), bark, { p: [Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07], s: [0.02, 0.12, 0.02], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
    }
    const spores = emitter({ count: 18, color: '#b8ff6a', size: 0.04, life: 2.4, spread: [0.3, 0.1, 0.3], velocity: [0, 0.35, 0], jitter: 0.15, swirl: 1 });
    spores.position.set(0.15, 1.3, 0);
    body.add(spores);
    for (const s of [1, -1]) part(body, geo.sphere(), bark, { p: [0.14, 0.07, 0.16 * s], s: [0.15, 0.07, 0.1] });
    part(body, taper([[-0.3, 0.4, 0], [-0.45, 0.3, 0.05], [-0.55, 0.12, 0]], 0.06, 0.015), bark);
    rig.height = 1.75;
    rig.width = 0.8;
  },

  bouldrake(rig) {
    const { m, body } = rig;
    const rock = m.rock('#3f3730');
    const dark = m.rock('#211b17');
    const crystal = m.crystal('#4ab8ff', { glow: 0.95 });
    const rune = m.glow('#ffb347', 2.3);
    const B = [-0.05, 0.7, 0], BS = [0.86, 0.58, 0.68];
    part(body, rockGeo(3, 0.16), rock, { p: B, s: BS });
    for (const s of [1, -1]) {
      vein(body, B, BS, [[-0.5, 0.3, 0.8 * s], [-0.1, 0.1, 0.98 * s], [0.3, 0.3, 0.9 * s]], rune, 0.022, 0.012);
      vein(body, B, BS, [[-0.2, -0.3, 0.92 * s], [0.15, -0.15, 0.97 * s]], rune, 0.018, 0.01);
    }
    const head = group(body, { p: [0.74, 0.84, 0] });
    const HS = [0.4, 0.33, 0.36];
    part(head, rockGeo(7, 0.12), rock, { s: HS });
    part(head, rockGeo(11, 0.12), dark, { p: [0.12, -0.22, 0], s: [0.3, 0.12, 0.27] });
    const E = on([0, 0, 0], HS, [0.6, 0.45, 0.55], 0.9);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.085, glow: '#ffcf5a', lid: { mat: dark } });
    fangs(head, { x: 0.3, y: -0.17, z: 0.1, len: 0.08, r: 0.022, mat: m.gloss('#d8ccb0', { rough: 0.4 }) });
    for (const s of [1, -1]) {
      horn(head, [[-0.05, 0.22, 0.18 * s], [-0.22, 0.36, 0.26 * s], [-0.42, 0.38, 0.3 * s], [-0.56, 0.3, 0.28 * s]], dark, 0.075);
      part(head, crystalGeo(), crystal, { p: [-0.12, 0.25, 0.08 * s], s: [0.05, 0.18, 0.05], r: [0.3 * s, 0, -0.5] });
    }
    const cg = crystalGeo();
    for (const [x, y, z, h, rz, rx] of [[-0.35, 1.18, 0.05, 0.56, 0.25, 0.1], [-0.02, 1.25, -0.08, 0.7, -0.1, -0.2], [0.28, 1.16, 0.1, 0.44, -0.35, 0.25], [-0.6, 1.0, -0.2, 0.36, 0.6, -0.4], [-0.2, 1.08, 0.32, 0.38, 0.1, 0.7]]) {
      part(body, cg, crystal, { p: [x, y - 0.06, z], s: [0.12 * (h / 0.5), h, 0.12 * (h / 0.5)], r: [rx, 0, rz] });
    }
    glowAt(body, [-0.05, 1.5, 0], '#4ab8ff', 1.7, 0.28);
    for (const x of [0.42, -0.45]) for (const s of [1, -1]) part(body, rockGeo(x * 10 + s, 0.18, 1), dark, { p: [x, 0.2, 0.36 * s], s: [0.2, 0.24, 0.2] });
    for (const [x, y, r] of [[-0.88, 0.52, 0.18], [-1.14, 0.42, 0.13], [-1.34, 0.35, 0.09]]) part(body, rockGeo(x * 7, 0.2, 1), rock, { p: [x, y, 0], s: r });
    rig.tickers.push((t) => { head.rotation.z = Math.sin(t * 0.8) * 0.05; });
    rig.breath = 0.015;
    rig.height = 1.85;
    rig.width = 1.25;
  },

  gravelclaw(rig) {
    const { m, body } = rig;
    const skin = m.skin('#57412f', { rough: 0.6 });
    const shell = m.rock('#2f271f', { flat: false, bump: 0.5, rough: 0.7 });
    const band = m.rock('#16110d', { flat: false, bump: 0.4, rough: 0.7 });
    const steel = m.metal('#7d838e', { rough: 0.3 });
    const hot = m.glow('#ffa53a', 2.6);
    part(body, geo.sphere(), skin, { p: [0, 0.52, 0], s: [0.5, 0.4, 0.42] });
    part(body, geo.sphere(), shell, { p: [-0.06, 0.6, 0], s: [0.5, 0.42, 0.44] });
    for (let i = 0; i < 5; i++) {
      const x = -0.4 + i * 0.18;
      const r = Math.sqrt(Math.max(0.05, 1 - (x / 0.55) ** 2));
      part(body, new THREE.TorusGeometry(1, 0.07, 10, 40, Math.PI), band, { p: [x - 0.06, 0.6, 0], s: [0.44 * r, 0.43 * r, 1], r: [0, Math.PI / 2, 0] });
      if (i % 2) part(body, geo.cone(6), m.gloss('#cfc6a8', { rough: 0.4 }), { p: [x - 0.06, 0.6 + 0.46 * r, 0], s: [0.04, 0.14, 0.04] });
    }
    const head = group(body, { p: [0.48, 0.56, 0] });
    const HS = [0.25, 0.22, 0.24];
    part(head, geo.sphere(), skin, { s: HS });
    part(head, geo.cone(), skin, { p: [0.16, -0.03, 0], s: [0.09, 0.22, 0.09], r: [0, 0, -Math.PI / 2] });
    part(head, geo.sphere(16), m.gloss('#120c0a'), { p: [0.39, -0.03, 0], s: 0.04 });
    const E = on([0, 0, 0], HS, [0.55, 0.55, 0.6], 0.9);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.07, glow: '#ffb347', lid: { mat: band } });
    for (const s of [1, -1]) part(head, geo.sphere(16), skin, { p: [-0.08, 0.2, 0.13 * s], s: [0.07, 0.07, 0.03] });
    const drills = [];
    for (const s of [1, -1]) {
      const arm = group(body, { p: [0.36, 0.34, 0.28 * s], r: [0, -0.15 * s, -1.45] });
      part(arm, geo.capsule(0.07, 0.12), skin, { p: [0, -0.02, 0] });
      part(arm, new THREE.TorusGeometry(0.1, 0.02, 6, 20), hot, { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0], shadow: false });
      const drill = group(arm, { p: [0, 0.1, 0] });
      part(drill, geo.cone(28), steel, { s: [0.11, 0.46, 0.11] });
      for (let k = 0; k < 4; k++) part(drill, new THREE.TorusGeometry(0.1 - k * 0.022, 0.012, 6, 20), steel, { p: [0, 0.06 + k * 0.08, 0], r: [Math.PI / 2 + 0.25, 0, 0] });
      part(drill, geo.sphere(8), hot, { p: [0, 0.46, 0], s: 0.02, shadow: false });
      drills.push(drill);
    }
    rig.tickers.push((t) => { for (const d of drills) d.rotation.y = t * 9; });
    legs(rig, skin, { xs: [-0.3], z: 0.25, y: 0.12, r: 0.09, len: 0.08 });
    part(body, taper([[-0.48, 0.42, 0], [-0.68, 0.3, 0], [-0.8, 0.16, 0]], 0.07, 0.02), band);
    rig.height = 1.3;
    rig.width = 1;
  },

  geowl(rig) {
    const { m, body } = rig;
    const fur = m.fur('#3d2f25');
    const belly = m.fur('#6a5745');
    const wingM = m.fur('#20160e');
    const disc = m.fur('#53443a');
    const crystal = m.crystal('#4ae0ff', { glow: 1.3 });
    part(body, geo.sphere(), fur, { p: [0, 0.62, 0], s: [0.42, 0.5, 0.42] });
    part(body, geo.sphere(), belly, { p: [0.18, 0.56, 0], s: [0.28, 0.36, 0.3] });
    const head = group(body, { p: [0.04, 1.12, 0] });
    rig.head = head;
    const HS = [0.38, 0.34, 0.4];
    part(head, geo.sphere(), fur, { s: HS });
    for (const s of [1, -1]) {
      part(head, geo.sphere(), disc, { p: [0.24, 0, 0.15 * s], s: [0.08, 0.18, 0.17], r: [0, -0.35 * s, 0] });
      part(head, geo.cone(), wingM, { p: [-0.02, 0.26, 0.22 * s], s: [0.075, 0.32, 0.05], r: [0.5 * s, 0, 0.15] });
      const w = group(body, { p: [-0.02, 0.9, 0.38 * s] });
      part(w, geo.sphere(), wingM, { p: [0, -0.22, 0], s: [0.14, 0.38, 0.08], r: [0.15 * s, 0, 0.12] });
      for (let k = 0; k < 3; k++) part(w, geo.cone(4), wingM, { p: [-0.06 - k * 0.04, -0.52 - k * 0.04, 0], s: [0.04, 0.16, 0.02], r: [0, 0, Math.PI - 0.2 - k * 0.15] });
      rig.tickers.push((t) => { w.rotation.x = s * (0.08 + Math.max(0, Math.sin(t * 1.6)) ** 6 * 0.5); });
    }
    eyes(head, { x: 0.3, y: 0.02, z: 0.15, r: 0.11, glow: '#ffae1a', look: 0.32, lid: { mat: wingM }, brow: 0.36 });
    part(head, geo.cone(), m.gloss('#6a4a1a', { rough: 0.3 }), { p: [0.36, -0.1, 0], s: [0.06, 0.17, 0.06], r: [0, 0, -2.3] });
    const gem = part(head, new THREE.OctahedronGeometry(1, 0), crystal, { p: [0.02, 0.44, 0], s: [0.1, 0.18, 0.1] });
    glowAt(head, [0.02, 0.44, 0], '#4ae0ff', 1.0, 0.55);
    rig.tickers.push((t) => { gem.rotation.y = t * 0.8; head.rotation.y = Math.sin(t * 0.5) * 0.25; head.rotation.z = Math.sin(t * 0.37) * 0.06; });
    for (const s of [1, -1]) {
      part(body, geo.capsule(0.05, 0.1), m.gloss('#3a2a12', { rough: 0.4 }), { p: [0.1, 0.12, 0.14 * s] });
      for (const dz of [-0.04, 0, 0.04]) part(body, geo.cone(6), m.gloss('#d8ccb0', { rough: 0.35 }), { p: [0.17, 0.03, 0.14 * s + dz], s: [0.014, 0.05, 0.014], r: [0, 0, -1.5] });
    }
    rig.height = 1.95;
    rig.width = 0.85;
  },

  ohmhorn(rig) {
    const { m, body } = rig;
    const skin = m.skin('#2a2e3b', { coat: 0.45 });
    const dark = m.skin('#12141c', { rough: 0.65 });
    const charge = m.glow('#ffd23a', 2.6);
    const hornM = m.gloss('#f2e6a8', { rough: 0.25, emit: '#ffd84a', emitK: 0.45 });
    const B = [-0.05, 0.74, 0], BS = [0.8, 0.56, 0.58];
    part(body, geo.sphere(), skin, { p: B, s: BS });
    const head = group(body, { p: [0.68, 0.82, 0] });
    rig.head = head;
    const HS = [0.42, 0.38, 0.4];
    part(head, geo.sphere(), skin, { s: HS });
    part(head, geo.sphere(), m.skin('#3a3e4c'), { p: [0.3, -0.1, 0], s: [0.24, 0.2, 0.26] });
    for (const z of [0.07, -0.07]) part(head, geo.sphere(12), charge, { p: [0.53, -0.07, z], s: 0.028, shadow: false });
    part(head, taper([[0.32, 0.06, 0], [0.44, 0.34, 0], [0.4, 0.66, 0]], 0.12, 0.008, { power: 0.8 }), hornM);
    part(head, taper([[0.12, 0.28, 0], [0.16, 0.46, 0]], 0.065, 0.005), hornM);
    glowAt(head, [0.4, 0.68, 0], '#ffe04a', 0.5, 0.6);
    const E = on([0, 0, 0], HS, [0.5, 0.42, 0.6], 0.92);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.09, glow: '#fff07a', lid: { mat: dark } });
    for (const s of [1, -1]) {
      part(head, geo.cone(), dark, { p: [-0.1, 0.28, 0.27 * s], s: [0.08, 0.22, 0.05], r: [0.7 * s, 0, -0.35] });
      for (const x0 of [-0.45, 0.1]) {
        const pts = [[-0.1, 0.6, 0.55], [0.08, 0.25, 0.85], [-0.06, 0.0, 0.95], [0.12, -0.35, 0.85]].map(([dx, dy, dz]) => on(B, BS, [x0 + dx, dy, dz * s], 0.995));
        part(body, taper(pts, 0.04, 0.016, { radial: 8 }), charge, { shadow: false });
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = on(B, BS, [-0.55 + i * 0.3, 1, 0], 0.98);
      part(body, geo.cone(5), dark, { p, s: [0.08, 0.22 - Math.abs(i - 1.5) * 0.04, 0.08], r: [0, 0, 0.3] });
      part(body, geo.sphere(10), charge, { p: [p[0] + 0.03, p[1] + 0.16 - Math.abs(i - 1.5) * 0.04, 0], s: 0.025, shadow: false });
    }
    legs(rig, dark, { xs: [0.42, -0.42], z: 0.3, y: 0.22, r: 0.13, len: 0.22 });
    claws(rig, m.gloss('#cfc6a8', { rough: 0.4 }), { xs: [0.42, -0.42], z: 0.3, r: 0.13 });
    part(body, taper([[-0.82, 0.8, 0], [-1.0, 0.72, 0], [-1.06, 0.55, 0]], 0.04, 0.02), dark);
    const spark = part(body, boltGeo(0.24, 0.03), m.glow('#fff07a', 3), { p: [-1.1, 0.46, 0], r: [0, 0, 0.4], shadow: false });
    rig.tickers.push((t) => { spark.visible = Math.sin(t * 11) > -0.2; });
    const e = emitter({ count: 18, color: '#fff2a0', size: 0.05, life: 0.5, spread: [0.06, 0.06, 0.06], velocity: [0, 0.4, 0], jitter: 1.4 });
    e.position.set(1.08, 1.48, 0);
    body.add(e);
    rig.height = 1.95;
    rig.width = 1.15;
  },

  joltcub(rig) {
    const { m, body } = rig;
    const fur = m.fur('#242038');
    const stripe = m.glow('#ffd23a', 2.3);
    const belly = m.fur('#3a3456');
    const B = [-0.05, 0.52, 0], BS = [0.4, 0.31, 0.3];
    part(body, geo.sphere(), fur, { p: B, s: BS });
    part(body, geo.sphere(), belly, { p: [0.16, 0.5, 0], s: [0.2, 0.22, 0.22] });
    for (const x of [-0.28, -0.12, 0.04]) {
      const pts = [];
      for (let a = -65; a <= 65; a += 13) pts.push(on(B, BS, [x + Math.abs(a) * 0.0015, Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)], 1.0));
      part(body, taper(pts, 0.028, 0.028, { radial: 8 }), stripe, { shadow: false });
    }
    const head = group(body, { p: [0.3, 0.92, 0] });
    const HS = [0.36, 0.32, 0.35];
    part(head, geo.sphere(), fur, { s: HS });
    part(head, geo.sphere(), belly, { p: [0.28, -0.1, 0], s: [0.15, 0.11, 0.17] });
    part(head, geo.sphere(16), m.gloss('#050304'), { p: [0.42, -0.04, 0], s: [0.035, 0.03, 0.045] });
    fangs(head, { x: 0.36, y: -0.16, z: 0.05, len: 0.07, r: 0.018 });
    for (const z of [-0.09, 0, 0.09]) part(head, taper([on([0, 0, 0], HS, [0.4, 1, z], 1), on([0, 0, 0], HS, [0.65, 0.7, z * 1.2], 1)], 0.024, 0.008, { radial: 8 }), stripe, { shadow: false });
    const E = on([0, 0, 0], HS, [0.7, 0.25, 0.52], 0.92);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.09, glow: '#ffe04a', lid: { mat: fur } });
    for (const s of [1, -1]) {
      part(head, geo.cone(), fur, { p: [-0.04, 0.26, 0.2 * s], s: [0.1, 0.24, 0.05], r: [0.45 * s, 0, -0.15] });
      part(head, geo.cone(), stripe, { p: [-0.025, 0.28, 0.205 * s], s: [0.05, 0.16, 0.03], r: [0.45 * s, 0, -0.15], shadow: false });
    }
    rig.tickers.push((t) => { head.rotation.z = Math.sin(t * 1.4) * 0.05; });
    legs(rig, fur, { xs: [0.2, -0.28], z: 0.15, y: 0.2, r: 0.08, len: 0.18 });
    claws(rig, m.gloss('#d8d0bc', { rough: 0.35 }), { xs: [0.2], z: 0.15, r: 0.08, size: 0.025 });
    const tail = group(body, { p: [-0.42, 0.56, 0] });
    part(tail, taper([[0, 0, 0], [-0.25, 0.2, 0], [-0.3, 0.5, 0]], 0.05, 0.035), fur);
    part(tail, boltGeo(0.34, 0.05), m.glow('#fff07a', 2.8), { p: [-0.36, 0.5, 0], r: [0, 0, 0.1], shadow: false });
    rig.tickers.push((t) => { tail.rotation.y = Math.sin(t * 3.1) * 0.35; });
    const e = emitter({ count: 20, color: '#fff27a', size: 0.05, life: 0.45, spread: [0.35, 0.3, 0.3], velocity: [0, 0.2, 0], jitter: 1.2 });
    e.position.set(0, 0.8, 0);
    body.add(e);
    rig.height = 1.55;
    rig.width = 0.85;
  },

  buzzmoth(rig) {
    const { m, body } = rig;
    rig.float = 0.42;
    rig.breath = 0.035;
    const fuzz = m.fur('#2a2436', { bump: 0.9 });
    const dark = m.fur('#120e1e');
    // Night of Fangs: orange eye spots on near-black wings.
    const { map, emap } = rig.theme === 'halloween' ? wingTextures('#1c0e06', '#ff8a1a', '#7a3ab8') : wingTextures('#2c1a52', '#ffd23a', '#5a3aa8');
    part(body, geo.sphere(), fuzz, { p: [0.05, 0.62, 0], s: [0.3, 0.3, 0.29] });
    part(body, geo.sphere(), dark, { p: [-0.24, 0.42, 0], s: [0.18, 0.26, 0.18], r: [0, 0, 0.9] });
    for (let i = 0; i < 3; i++) part(body, new THREE.TorusGeometry(0.15 - i * 0.03, 0.014, 6, 20), m.glow('#ffd23a', 1.8), { p: [-0.24 - i * 0.06, 0.42 - i * 0.07, 0], r: [Math.PI / 2, 0.9, 0], shadow: false });
    part(body, new THREE.TorusGeometry(0.22, 0.08, 12, 30), m.fur('#a8935e', { bump: 1 }), { p: [0.05, 0.45, 0], r: [Math.PI / 2, 0.3, 0] });
    const E = on([0.05, 0.62, 0], [0.3, 0.3, 0.29], [0.7, 0.15, 0.55], 0.93);
    eyes(body, { x: E[0], y: E[1], z: E[2], r: 0.11, glow: '#ffe04a', look: 0.4, lid: { mat: dark }, brow: 0.3, slit: false });
    for (const s of [1, -1]) {
      const ant = taper([[0.12, 0.86, 0.07 * s], [0.2, 1.08, 0.14 * s], [0.36, 1.2, 0.2 * s]], 0.018, 0.01);
      part(body, ant, dark);
      part(body, leaf(0.18, 0.05), m.fur('#3a2a6a'), { p: [0.24, 1.1, 0.16 * s], r: [Math.PI / 2, 0, 0.7] }).material.side = THREE.DoubleSide;
      for (const [len, wid, y, back] of [[0.8, 0.38, 0.7, 0.05], [0.56, 0.27, 0.5, -0.12]]) {
        const pivot = group(body, { p: [back, y, 0.1 * s] });
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(wid * 0.9, len * 0.35, wid * 1.2, len * 0.95, 0.05, len);
        shape.bezierCurveTo(-wid * 0.7, len * 0.9, -wid * 0.8, len * 0.3, 0, 0);
        const g = new THREE.ShapeGeometry(shape, 18);
        const uv = g.attributes.uv;
        const pos = g.attributes.position;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i) / len, pos.getX(i) / (wid * 2.4) + 0.5);
        const wing = part(pivot, g, m.wing('#9a88c8', { map, emap, emit: '#ffffff', emitK: 1.6, opacity: 0.95 }), { shadow: true });
        wing.rotation.z = len > 0.6 ? 0.25 : -0.5;
        const base = Math.PI / 2 - (len > 0.6 ? 0.55 : 0.75);
        rig.tickers.push((t) => { pivot.rotation.x = s * (base + Math.sin(t * 9 + (len > 0.6 ? 0 : 0.6)) * 0.45); });
      }
    }
    const e = emitter({ count: 26, color: '#ffd84a', size: 0.05, life: 2, spread: [0.5, 0.2, 0.5], velocity: [0, -0.25, 0], jitter: 0.15 });
    e.position.set(0, 0.6, 0);
    body.add(e);
    rig.height = 1.7;
    rig.width = 0.9;
  },

  shellguard(rig) {
    const { m, body } = rig;
    const skin = m.skin('#1d3946', { coat: 0.45 });
    const shell = m.gloss('#0b2341', { rough: 0.24, normal: 'scales', bump: 0.5 });
    const plate = m.gloss('#2763a8', { rough: 0.18, emit: '#1a8aff', emitK: 0.55 });
    const rim = m.gloss('#07152a', { rough: 0.3 });
    const bone = m.gloss('#cfd6dc', { rough: 0.35 });
    const S = [-0.05, 0.42, 0], SS = [0.8, 0.62, 0.72];
    part(body, new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shell, { p: S, s: SS });
    part(body, new THREE.TorusGeometry(1, 0.07, 12, 60), rim, { p: [S[0], S[1], S[2]], s: [SS[0] * 1.0, SS[2] * 1.0, 1], r: [Math.PI / 2, 0, 0] });
    part(body, geo.sphere(), skin, { p: [S[0], 0.4, 0], s: [0.74, 0.18, 0.66] });
    const plateG = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (const d of [[0, 1, 0], [0.55, 0.75, 0], [-0.55, 0.75, 0], [0.1, 0.72, 0.6], [0.1, 0.72, -0.6], [-0.4, 0.6, 0.55], [-0.4, 0.6, -0.55], [0.55, 0.5, 0.55], [0.55, 0.5, -0.55]]) {
      const pl = part(body, plateG, plate, { p: on(S, SS, d, 0.985), s: [0.15, 0.05, 0.15] });
      stickOut(pl, normalOn(SS, d));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const d = [Math.cos(a), 0.12, Math.sin(a)];
      const k = part(body, geo.cone(6), bone, { p: on(S, SS, d, 0.98), s: [0.04, 0.16, 0.04] });
      stickOut(k, normalOn(SS, d));
    }
    // A glowing reef on the shell.
    const reef = group(body, { p: on(S, SS, [-0.25, 1, 0.1], 0.97) });
    for (const [x, z, h, c] of [[0, 0, 0.4, '#3affd8'], [0.12, 0.1, 0.28, '#8a6aff'], [-0.1, -0.08, 0.32, '#3affd8'], [0.05, -0.14, 0.22, '#ff5ad0']]) {
      const col = m.skin('#0e2630', { coat: 0.5, emit: c, emitK: 0.25 });
      part(reef, taper([[x, 0, z], [x + 0.03, h * 0.5, z], [x - 0.04, h, z + 0.03]], 0.04, 0.02), col);
      part(reef, taper([[x + 0.02, h * 0.45, z], [x + 0.12, h * 0.7, z + 0.04]], 0.025, 0.012), col);
      part(reef, geo.sphere(12), m.glow(c, 2.4), { p: [x - 0.04, h, z + 0.03], s: 0.035, shadow: false });
    }
    const neck = group(body, { p: [0.62, 0.48, 0] });
    part(neck, geo.capsule(0.13, 0.16), skin, { p: [0.04, 0.05, 0], r: [0, 0, -0.9] });
    const head = group(neck, { p: [0.2, 0.18, 0] });
    const HS = [0.28, 0.25, 0.27];
    part(head, geo.sphere(), skin, { s: HS });
    part(head, geo.cone(4), m.gloss('#0a1c26', { rough: 0.3 }), { p: [0.22, -0.08, 0], s: [0.1, 0.14, 0.14], r: [0, Math.PI / 4, -2.0] });
    const E = on([0, 0, 0], HS, [0.6, 0.45, 0.6], 0.9);
    eyes(head, { x: E[0], y: E[1], z: E[2], r: 0.085, glow: '#5affea', lid: { mat: rim } });
    rig.tickers.push((t) => { neck.rotation.z = Math.sin(t * 0.9) * 0.08; head.rotation.y = Math.sin(t * 0.6) * 0.2; });
    for (const x of [0.42, -0.45]) for (const s of [1, -1]) part(body, geo.sphere(), skin, { p: [x, 0.18, 0.5 * s], s: [0.2, 0.13, 0.16], r: [0, 0.5 * s, 0] });
    part(body, geo.cone(), skin, { p: [-0.82, 0.3, 0], s: [0.07, 0.16, 0.07], r: [0, 0, 1.9] });
    const e = emitter({ count: 12, color: '#7ff0ff', size: 0.05, life: 2.4, spread: [0.25, 0.05, 0.25], velocity: [0, 0.5, 0], jitter: 0.08 });
    e.position.set(-0.25, 1.1, 0.1);
    body.add(e);
    rig.breath = 0.015;
    rig.height = 1.6;
    rig.width = 1.2;
  },

  riptide(rig) {
    const { m, body } = rig;
    rig.float = 0.58;
    rig.breath = 0.02;
    const blue = m.gloss('#163454', { rough: 0.3, normal: 'skin', bump: 0.3 });
    const belly = m.gloss('#8aa1b3', { rough: 0.32 });
    const fin = m.gloss('#0a1d35', { rough: 0.3 });
    const swim = group(body, { p: [0, 0.38, 0] });
    const g = lathe([[0.001, 0], [0.16, 0.06], [0.28, 0.25], [0.33, 0.55], [0.3, 0.9], [0.2, 1.2], [0.1, 1.42], [0.03, 1.55]], 48).translate(0, -0.8, 0);
    part(swim, g, blue, { r: [0, 0, Math.PI / 2], s: [1, 1, 0.85] });
    part(swim, geo.sphere(), belly, { p: [0.25, -0.13, 0], s: [0.55, 0.17, 0.24] });
    for (const s of [1, -1]) {
      part(swim, taper([[0.5, 0.0, 0.25 * s], [0.1, 0.03, 0.29 * s], [-0.35, 0.0, 0.22 * s], [-0.65, 0.0, 0.08 * s]], 0.012, 0.006, { radial: 6 }), m.glow('#3affff', 2.0), { shadow: false });
      for (let k = 0; k < 3; k++) part(swim, taper([[0.36 - k * 0.06, 0.08, 0.27 * s], [0.34 - k * 0.06, -0.06, 0.28 * s]], 0.008, 0.008, { radial: 6 }), fin, { shadow: false });
    }
    const finShape = (w, h) => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(w * 0.2, h * 0.7, -w * 0.35, h);
      s.quadraticCurveTo(w * 0.15, h * 0.4, w, 0);
      s.lineTo(0, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }).translate(0, 0, -0.025);
    };
    part(swim, finShape(0.42, 0.5), fin, { p: [-0.1, 0.26, 0] });
    const tail = group(swim, { p: [-0.72, 0, 0] });
    part(tail, finShape(0.3, 0.5), fin, { p: [-0.05, 0, 0], r: [0, 0, 0.5] });
    part(tail, finShape(0.26, 0.32), fin, { p: [-0.05, 0, 0], r: [0, 0, Math.PI - 0.5], s: [1, 1, 1] });
    for (const s of [1, -1]) part(swim, finShape(0.26, 0.26), fin, { p: [0.12, -0.16, 0.2 * s], r: [-1.1 * s, -0.3 * s, -0.4] });
    part(swim, geo.sphere(), m.gloss('#2a0610', { rough: 0.4, emit: '#ff2a3a', emitK: 0.15 }), { p: [0.64, -0.12, 0], s: [0.13, 0.055, 0.17] });
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.4;
      part(swim, geo.cone(8), m.gloss('#f2eee6', { rough: 0.2 }), { p: [0.66 + Math.cos(a) * 0.05 - 0.05, -0.085, Math.sin(a) * 0.14], s: [0.02, 0.065, 0.02], r: [0, 0, Math.PI], shadow: false });
    }
    eyes(swim, { x: 0.58, y: 0.08, z: 0.18, r: 0.075, glow: '#5ad8ff', look: 0.45, lid: { mat: fin } });
    rig.tickers.push((t) => {
      tail.rotation.y = Math.sin(t * 4) * 0.35;
      swim.rotation.y = Math.sin(t * 4 + 1.2) * 0.06;
      swim.rotation.x = Math.sin(t * 1.3) * 0.06;
    });
    const e = emitter({ count: 14, color: '#9fdcff', size: 0.05, life: 1.8, spread: [0.5, 0.15, 0.2], velocity: [0, 0.5, 0], jitter: 0.1 });
    e.position.set(0, 0.6, 0);
    body.add(e);
    rig.height = 1.55;
    rig.width = 1.25;
  },

  mistling(rig) {
    const { m, body } = rig;
    rig.float = 0.55;
    rig.breath = 0.06;
    const bell = m.jelly('#2a4a8a', { glow: 0.45 });
    const tentM = m.jelly('#5a3aa8', { glow: 0.8 });
    part(body, lathe([[0.001, 0.62], [0.2, 0.6], [0.38, 0.52], [0.5, 0.34], [0.53, 0.14], [0.48, 0.03], [0.4, 0.05], [0.36, 0.12]], 48), bell, { p: [0, 0.42, 0], shadow: true });
    part(body, geo.sphere(), m.glow('#8ad8ff', 1.9), { p: [0, 0.74, 0], s: [0.2, 0.17, 0.2], shadow: false });
    glowAt(body, [0, 0.75, 0], '#5ac8ff', 1.9, 0.5);
    for (const d of spread(22, ([, y]) => y > 0.1)) part(body, geo.sphere(8), m.glow('#7af0ff', 2.2), { p: [d[0] * 0.46, 0.46 + d[1] * 0.56, d[2] * 0.46], s: 0.022, shadow: false });
    eyes(body, { x: 0.44, y: 0.64, z: 0.16, r: 0.08, glow: '#e8f8ff', lid: { mat: m.skin('#101a3a') }, brow: 0.34, slit: false });
    const chains = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      let link = group(body, { p: [Math.cos(a) * 0.36, 0.46, Math.sin(a) * 0.36] });
      const chain = [];
      for (let k = 0; k < 6; k++) {
        part(link, geo.capsule(0.036 - k * 0.005, 0.12), tentM, { p: [0, -0.08, 0], shadow: k < 2 });
        chain.push(link);
        link = group(link, { p: [0, -0.16, 0] });
      }
      part(link, geo.sphere(8), m.glow('#b48aff', 2.4), { s: 0.02, shadow: false });
      chains.push({ chain, a });
    }
    rig.tickers.push((t) => {
      for (const { chain, a } of chains) {
        chain.forEach((l, k) => {
          l.rotation.z = Math.sin(t * 2.2 + a * 2 + k * 0.7) * 0.22;
          l.rotation.x = Math.cos(t * 1.7 + a + k * 0.6) * 0.18;
        });
      }
    });
    const e = emitter({ count: 16, color: '#9fe6ff', size: 0.06, life: 2.6, spread: [0.4, 0.1, 0.4], velocity: [0, 0.45, 0], jitter: 0.08 });
    e.position.set(0, 0.9, 0);
    body.add(e);
    rig.height = 1.95;
    rig.width = 0.95;
  },

  // The Night of Fangs event monster and the raid boss (src/three/halloween.js).
  hollowjack: (rig) => buildHollowjack(rig),
  hollowking: (rig) => buildHollowjack(rig, true),
};

function glowAt(parent, p, color, scale, opacity) {
  const g = glowSprite(color, scale, opacity);
  g.position.set(...p);
  parent.add(g);
  return g;
}

// A soft dark blob under each monster so it sits on the ground.
function contactShadow(rig) {
  const m = new THREE.MeshBasicMaterial({ map: softSprite(), color: '#000000', transparent: true, opacity: rig.float ? 0.35 : 0.6, depthWrite: false });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.012;
  s.scale.set(rig.width * 1.7, rig.width * 1.25, 1);
  s.renderOrder = -1;
  rig.root.add(s);
  rig.shadowBlob = s;
}

// The hatchable egg: obsidian with glowing element runes, a gold band and fire inside.
export function buildEgg() {
  const rig = new Rig('egg');
  const { m, body } = rig;
  const shell = m.gloss('#17121b', { rough: 0.22, normal: 'skin', bump: 0.3 });
  part(body, lathe([[0.001, 0], [0.32, 0.06], [0.46, 0.3], [0.47, 0.6], [0.38, 0.92], [0.2, 1.12], [0.001, 1.18]], 64), shell);
  const colors = ['#ff7a3d', '#4fc85a', '#e0b070', '#ffc928', '#3fa2ff'];
  spread(34, ([, y]) => y > -0.8 && y < 0.85).forEach((d, i) => {
    const p = [d[0] * 0.462, 0.58 + d[1] * 0.5, d[2] * 0.462];
    const r = 0.05 + (i % 3) * 0.018;
    const dot = part(body, geo.sphere(16), m.glow(colors[i % 5], 2.2), { p, s: [r, 0.02, r], shadow: false });
    stickOut(dot, new THREE.Vector3(d[0], d[1] * 0.4, d[2]).normalize());
  });
  const zig = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    zig.push([Math.cos(a) * 0.475, 0.62 + (i % 2 ? 0.06 : -0.06), Math.sin(a) * 0.475]);
  }
  part(body, taper(zig, 0.024, 0.024, { seg: 200, radial: 6 }), m.metal('#c08a32', { rough: 0.32 }));
  glowAt(body, [0, 0.6, 0], '#ff7a2a', 2.2, 0.22);
  rig.tickers.push((t) => { body.rotation.z = Math.sin(t * 2.4) * 0.06 * (Math.sin(t * 0.7) > 0.3 ? 1 : 0.2); });
  rig.breath = 0.01;
  rig.height = 1.2;
  rig.width = 0.9;
  contactShadow(rig);
  rig.tick(0);
  return rig;
}

// The evolved form: brighter element light, a floating crown of element crystals over the
// back, an aura rising around the feet and a glowing ring on the ground; a size larger.
function ascend(rig, color) {
  // Element light along the silhouette (a fresnel rim on every lit material).
  const rim = new THREE.Color(color).multiplyScalar(1.5);
  for (const m of rig.mats) {
    m.userData.baseEmissive.multiplyScalar(1.7);
    m.emissive.copy(m.userData.baseEmissive);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = { value: rim };
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Clamped: at MSAA edges the dot can leave [0, 1] and pow() would return NaN.
          totalEmissiveRadiance += uRim * pow(clamp(1.0 - dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);`);
    };
    m.customProgramCacheKey = () => 'evo-rim';
  }
  const glows = new Set();
  rig.body.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial && !o.material.transparent) glows.add(o.material); });
  for (const m of glows) m.color.multiplyScalar(1.35);

  // Measure the model (before its first tick, so body space is the root's space); wings
  // (the transparent parts) are left out so the crown sits on the body, not above them.
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  rig.body.traverse((o) => { if (o.isMesh && !o.material.isShaderMaterial && !o.material.transparent) box.expandByObject(o); });
  const size = box.getSize(new THREE.Vector3());
  const top = box.max.y + 0.08;
  const r = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.26, 0.2, 0.42);
  const crown = group(rig.body, { p: [(box.min.x + box.max.x) / 2 - size.x * 0.05, top, (box.min.z + box.max.z) / 2] });
  part(crown, new THREE.TorusGeometry(r, 0.016, 8, 72), MAT.glow(color, 2.8), { r: [Math.PI / 2, 0, 0], shadow: false });
  const shard = new THREE.OctahedronGeometry(1, 0);
  const crystal = rig.m.crystal(color, { glow: 1.3, transmission: 0.2 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(crown, shard, crystal, { p: [Math.cos(a) * r, 0.06, Math.sin(a) * r], s: [0.045, 0.12, 0.045], shadow: false });
  }
  crown.add(glowSprite(color, r * 4.2, 0.32));
  rig.tickers.push((tt) => {
    crown.rotation.y = tt * 0.7;
    crown.position.y = top + Math.sin(tt * 1.4) * 0.03;
  });

  const aura = emitter({ count: 30, color, size: 0.07, life: 1.7, spread: [rig.width * 0.55, 0.04, rig.width * 0.45], velocity: [0, 0.75, 0], jitter: 0.12, swirl: 1.4, opacity: 0.85 });
  aura.position.y = 0.06;
  rig.root.add(aura);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.016;
  ring.scale.setScalar(rig.width * 0.85);
  ring.userData.ground = true;
  rig.root.add(ring);

  rig.root.scale.setScalar(1.1);
  rig.height *= 1.1;
  rig.width *= 1.1;
}

// evo: build the evolved form. theme: the event look ('halloween' puts every monster in
// its costume); it defaults to the page's running event.
export function buildMonster(id, { evo = false, theme = THEME } = {}) {
  const rig = new Rig(id);
  rig.theme = theme;
  BUILD[id](rig);
  if (theme === 'halloween') haunt(rig, id);
  if (evo) ascend(rig, ELEMENTS[BY_ID[id].element].color);
  contactShadow(rig);
  rig.tick(0);
  return rig;
}

export const MONSTER_IDS = Object.keys(BUILD);
