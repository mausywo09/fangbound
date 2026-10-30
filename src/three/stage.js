// The 3D stage: renderer, lights, post-processing, the arena and the battle effects.
// The arena is a ruined stone ring floating over a sea of fire at night: storm clouds,
// a blood moon behind a broken gate, braziers, rune pillars and drifting embers. During
// Night of Fangs (theme 'halloween') it is a graveyard: a huge orange moon, a sea of
// witch fire, pumpkin lanterns, tombstones, dead trees, ghosts and bats (halloween.js).
// `render(t)` draws the frame at absolute time t, so the same scene runs live in the game
// and frame by frame in the offline video renders.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MAT, geo, fbm, colorTexture, rockGeo, flameMaterial, flameGeo, emitter, burst, setTime, glowSprite, softSprite, starSprite, runeTexture, lathe, part, group } from './kit.js';
import { ELEMENTS } from '../data.js';
import { THEME } from '../theme.js';
import { hauntArena, pumpkin, ghostSprite } from './halloween.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export const lowEnd = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;

const ease = (k) => 1 - (1 - k) ** 3;
// The sky, the clouds and the lightning repeat every LOOP seconds, so the landing-page
// video (12 s) loops without a seam.
const LOOP = 12;

// Color grade on the linear HDR image: contrast, cool shadows, warm highlights, vignette,
// a little film grain, and the full-screen flash for big hits.
const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uVignette: { value: 0.5 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color('#ffffff') },
    uSat: { value: 1.1 }, uTime: { value: 0 }, uGrain: { value: 0.05 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uFlash, uSat, uTime, uGrain; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = pow(max(c.rgb, 0.0), vec3(1.07));
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb *= mix(vec3(0.9, 0.94, 1.12), vec3(1.06, 1.0, 0.92), smoothstep(0.02, 0.6, l));
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.2, 0.85, length(d * vec2(1.2, 1.0)));
      c.rgb *= 1.0 + (h12(vUv * 913.0 + fract(uTime * 7.3)) - 0.5) * uGrain;
      c.rgb = c.rgb * (1.0 + uFlash * 3.0 * uFlashColor) + uFlashColor * uFlash * 0.08;
      gl_FragColor = c;
    }`,
};

const NOISE = `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;

const SKY = {
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
  fragmentShader: `
    uniform vec3 uTop, uMid, uHorizon, uMoon, uMoonDir, uCloud, uBoltDir; uniform float uTime, uBolt, uMoonR;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uMid, smoothstep(-0.01, 0.055, h));
      col = mix(col, uTop, smoothstep(0.05, 0.4, h));
      // Below the horizon: the fire sea's glow, sinking into darkness.
      col = mix(col, uHorizon * 0.6, smoothstep(0.0, -0.06, h));
      col = mix(col, uHorizon * 0.18, smoothstep(-0.06, -0.45, h));
      vec2 sg = floor(vec2(atan(d.z, d.x) * 190.0, h * 190.0));
      col += vec3(step(0.9982, h21(sg)) * smoothstep(0.1, 0.5, h) * (0.5 + 0.5 * sin(uTime * 1.7 + h21(sg + 3.1) * 40.0)));
      // The moon: a red disc with darker seas, a soft halo around it.
      vec3 md = normalize(uMoonDir);
      float ang = acos(clamp(dot(d, md), -1.0, 1.0));
      float R = uMoonR;
      vec3 tu = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
      vec2 mp = vec2(dot(d, tu), dot(d, cross(tu, md))) / R;
      float disc = 1.0 - smoothstep(R - 0.0015, R + 0.0015, ang);
      float seas = fbm(mp * 2.2 + 3.0);
      vec3 moon = uMoon * (0.55 + 0.75 * smoothstep(0.3, 0.75, seas)) * (1.0 - 0.45 * dot(mp, mp));
      col += uMoon * (exp(-ang * 9.0) * 0.14 + exp(-ang * 30.0) * 0.45);
      col = mix(col, moon * 2.4, disc);
      // Storm clouds on a dome, drifting on a slow circle (so they loop), lit around the moon
      // and by lightning.
      float w = 6.2831853 * uTime / ${LOOP.toFixed(1)};
      vec2 p = d.xz / max(h + 0.3, 0.05) + vec2(cos(w), sin(w)) * 0.18;
      float n = fbm(p * 1.3) * 0.65 + fbm(p * 3.1 + vec2(sin(w), cos(w)) * 0.25) * 0.35;
      float cov = smoothstep(0.42, 0.7, n) * smoothstep(-0.02, 0.05, h) * (1.0 - smoothstep(0.5, 0.95, h) * 0.6);
      float near = exp(-ang * 9.0);
      vec3 cloud = uCloud * (0.5 + 0.9 * n) + uMoon * near * (1.0 - smoothstep(0.5, 0.78, n)) * 0.7;
      cloud += vec3(0.72, 0.72, 1.0) * uBolt * pow(max(dot(d, normalize(uBoltDir)), 0.0), 3.0) * (0.4 + n * 1.6) * 2.2;
      col = mix(col, cloud, cov * 0.94);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// The sea of fire far below: dark crust broken by glowing cracks that slowly crawl.
// hw: witch fire instead (green).
function lavaMaterial(hw) {
  const c = hw ? { uBase: [0.006, 0.02, 0.012], uHot: [0.2, 1.0, 0.36], uCore: [0.75, 1.0, 0.6] } : { uBase: [0.025, 0.008, 0.006], uHot: [1.0, 0.25, 0.04], uCore: [1.0, 0.7, 0.3] };
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { value: new THREE.Vector3(...v) }])) }]),
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec2 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uBase, uHot, uCore;
      varying vec2 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float w = 6.2831853 * uTime / ${LOOP.toFixed(1)};
        vec2 p = vW * 0.06;
        float r = 1.0 - abs(fbm(p + vec2(cos(w), sin(w)) * 0.12) * 2.0 - 1.0);
        float r2 = 1.0 - abs(fbm(p * 2.6 - vec2(sin(w), cos(w)) * 0.2) * 2.0 - 1.0);
        float glow = pow(r, 14.0) * 1.2 + pow(r2, 20.0) * 0.5;
        vec3 col = uBase + uHot * glow * 1.3 + uCore * pow(glow, 3.0) * 0.8;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

let FLOOR = null;
// Dark slate tiles in rings with the element cycle engraved in the middle. The emissive
// map holds the glowing emblem and thin cracks of fire between the stones.
function floorTextures() {
  if (FLOOR) return FLOOR;
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const e = document.createElement('canvas');
  e.width = e.height = S;
  const eg = e.getContext('2d');
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);
  const img = g.createImageData(S, S);
  const R = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - R, dy = y - R;
      const r = Math.hypot(dx, dy) / R;
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 0.5);
      const ring = Math.floor(r * 7);
      const segs = 6 + ring * 6;
      const seg = Math.floor(a * segs + (ring % 2) * 0.5);
      const fr = (r * 7) % 1, fa = (a * segs + (ring % 2) * 0.5) % 1;
      const mortar = Math.min(fr, 1 - fr) * 7 < 0.05 || Math.min(fa, 1 - fa) * (r * 7 * Math.PI * 2 / segs) < 0.03;
      const tile = Math.sin(ring * 12.9 + seg * 78.2) * 43758.5 % 1;
      const n = fbm(x / 64, y / 64, 16, 4, 4);
      let v = 0.5 + Math.abs(tile) * 0.16 + (n - 0.5) * 0.34;
      if (mortar) v *= 0.32;
      const i = (y * S + x) * 4;
      img.data[i] = v * 84; img.data[i + 1] = v * 76; img.data[i + 2] = v * 92; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Cracks: jagged lines out from the middle, dark in the albedo and glowing in the emissive.
  const cracks = [];
  for (let i = 0; i < 16; i++) {
    let a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
    let r = 0.42 + rnd() * 0.12;
    const pts = [[Math.cos(a) * r * R, Math.sin(a) * r * R]];
    const end = 0.75 + rnd() * 0.25;
    while (r < end) {
      r += 0.03 + rnd() * 0.04;
      a += (rnd() - 0.5) * 0.18;
      pts.push([Math.cos(a) * r * R, Math.sin(a) * r * R]);
    }
    cracks.push(pts);
  }
  const drawCracks = (ctx, color, width) => {
    ctx.save();
    ctx.translate(R, R);
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    for (const pts of cracks) {
      pts.forEach(([x, y], k) => {
        if (!k) return;
        ctx.lineWidth = width * (1 - k / pts.length) + 0.6;
        ctx.beginPath();
        ctx.moveTo(...pts[k - 1]);
        ctx.lineTo(x, y);
        ctx.stroke();
      });
    }
    ctx.restore();
  };
  drawCracks(g, 'rgba(8,4,6,0.9)', 5);
  drawCracks(eg, 'rgba(255,96,24,0.32)', 3);
  // The emblem: rings and the five elements, each with an arrow to the one it beats.
  const draw = (ctx, glow) => {
    ctx.save();
    ctx.translate(R, R);
    ctx.strokeStyle = glow ? '#ffb347' : 'rgba(10,6,12,0.7)';
    ctx.lineWidth = glow ? 5 : 9;
    for (const rr of [0.12, 0.36, 0.4]) { ctx.lineWidth = glow ? (rr === 0.4 ? 2.5 : 5) : 9; ctx.beginPath(); ctx.arc(0, 0, rr * R, 0, Math.PI * 2); ctx.stroke(); }
    ctx.lineWidth = glow ? 5 : 9;
    const order = ['ember', 'bloom', 'stone', 'volt', 'tide'];
    const RR = 0.3 * R;
    order.forEach((el, k) => {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      const b = a + (Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(0, 0, RR, a + 0.2, b - 0.2);
      ctx.stroke();
      const tip = b - 0.2;
      const tx = Math.cos(tip) * RR, ty = Math.sin(tip) * RR;
      const dx = -Math.sin(tip), dy = Math.cos(tip);
      ctx.beginPath();
      ctx.moveTo(tx + dx * 14, ty + dy * 14);
      ctx.lineTo(tx - dx * 6 + Math.cos(tip) * 12, ty - dy * 6 + Math.sin(tip) * 12);
      ctx.lineTo(tx - dx * 6 - Math.cos(tip) * 12, ty - dy * 6 - Math.sin(tip) * 12);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        const c = (i / 12) * Math.PI * 2 + k;
        ctx.beginPath();
        ctx.moveTo(Math.cos(c) * 0.12 * R, Math.sin(c) * 0.12 * R);
        ctx.lineTo(Math.cos(c) * 0.15 * R, Math.sin(c) * 0.15 * R);
        ctx.stroke();
      }
      ctx.fillStyle = glow ? ELEMENTS[el].color : 'rgba(10,6,12,0.75)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * RR, Math.sin(a) * RR, glow ? 22 : 30, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  };
  draw(g, false);
  draw(eg, true);
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  FLOOR = { map: tex(c, true), emissiveMap: tex(e, true) };
  return FLOOR;
}

let GROUND = null;
// Ash and scorched earth for the island top, with faint ember veins (tileable).
function groundTextures() {
  if (GROUND) return GROUND;
  GROUND = {
    map: colorTexture(256, (x, y) => {
      const n = fbm(x * 6, y * 6, 6, 5, 21);
      const m = fbm(x * 28, y * 28, 28, 2, 5);
      return [0.07 + n * 0.07 + m * 0.02, 0.055 + n * 0.05 + m * 0.015, 0.06 + n * 0.05];
    }),
    cracks: colorTexture(256, (x, y) => {
      const r = 1 - Math.abs(fbm(x * 5, y * 5, 5, 4, 33) * 2 - 1);
      const k = Math.max(0, (r - 0.9) / 0.1) ** 2;
      return [k, k * 0.3, k * 0.05];
    }),
  };
  // The same cracks in white, for the witch-fire glow.
  GROUND.cracksW = colorTexture(256, (x, y) => {
    const r = 1 - Math.abs(fbm(x * 5, y * 5, 5, 4, 33) * 2 - 1);
    const k = Math.max(0, (r - 0.9) / 0.1) ** 2;
    return [k, k, k];
  });
  return GROUND;
}

function brazier(root, x, z, q, withLight) {
  const g = group(root, { p: [x, 0, z] });
  const stone = MAT.rock('#2a242c', { flat: true });
  part(g, new THREE.CylinderGeometry(0.17, 0.3, 1.0, 6), stone, { p: [0, 0.5, 0] });
  part(g, new THREE.CylinderGeometry(0.36, 0.4, 0.1, 6), stone, { p: [0, 0.05, 0] });
  part(g, lathe([[0.1, 0], [0.3, 0.05], [0.46, 0.2], [0.52, 0.34], [0.47, 0.37], [0.41, 0.27], [0.001, 0.22]], 18), MAT.metal('#3b2a1d', { rough: 0.55 }), { p: [0, 1.0, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(g, geo.cone(5), MAT.metal('#2c2018', { rough: 0.5 }), { p: [Math.cos(a) * 0.5, 1.32, Math.sin(a) * 0.5], s: [0.035, 0.16, 0.035], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] });
  }
  part(g, geo.sphere(16), MAT.glow('#ff5a14', 2.4), { p: [0, 1.24, 0], s: [0.42, 0.07, 0.42], shadow: false });
  const f = part(g, flameGeo(0.36, 1.3), flameMaterial({ speed: 1.05, power: 1.55, edge: '#b01c00' }), { p: [0, 1.26, 0], shadow: false });
  f.userData.timed = [f.material];
  const glow = glowSprite('#ff6a1e', 3.0, 0.28);
  glow.position.set(0, 1.75, 0);
  g.add(glow);
  const sparks = emitter({ count: q.high ? 26 : 14, color: '#ff9a3a', size: 0.05, life: 2, spread: [0.25, 0.1, 0.25], velocity: [0, 1.3, 0], jitter: 0.35, swirl: 1.4 });
  sparks.position.set(0, 1.7, 0);
  g.add(sparks);
  if (!withLight) return null;
  const light = new THREE.PointLight('#ff7a2e', q.high ? 9 : 7, 7.5, 1.6);
  light.position.set(0, 2.1, 0);
  g.add(light);
  return light;
}

// Night of Fangs: the brazier post crowned with a carved pumpkin, lit from inside.
function lanternPost(root, x, z, q, withLight) {
  const g = group(root, { p: [x, 0, z] });
  const stone = MAT.rock('#2a242c', { flat: true });
  part(g, new THREE.CylinderGeometry(0.17, 0.3, 1.0, 6), stone, { p: [0, 0.5, 0] });
  part(g, new THREE.CylinderGeometry(0.36, 0.4, 0.1, 6), stone, { p: [0, 0.05, 0] });
  part(g, new THREE.CylinderGeometry(0.28, 0.2, 0.12, 6), stone, { p: [0, 1.04, 0] });
  // The face looks toward the arena's center.
  const pk = pumpkin(g, { p: [0, 1.38, 0], r: 0.42, k: 3.2 });
  pk.rotation.y = Math.atan2(z, -x);
  const f = part(g, flameGeo(0.12, 0.42), flameMaterial({ speed: 1.2, power: 1.6, edge: '#b01c00' }), { p: [0, 1.66, 0], shadow: false });
  f.userData.timed = [f.material];
  const glow = glowSprite('#ff8a2a', 3.0, 0.26);
  glow.position.set(0, 1.5, 0);
  g.add(glow);
  const sparks = emitter({ count: q.high ? 18 : 10, color: '#ffa040', size: 0.05, life: 2, spread: [0.15, 0.1, 0.15], velocity: [0, 1.1, 0], jitter: 0.3, swirl: 1.4 });
  sparks.position.set(0, 1.8, 0);
  g.add(sparks);
  if (!withLight) return null;
  const light = new THREE.PointLight('#ff8a32', q.high ? 9 : 7, 7.5, 1.6);
  light.position.set(0, 1.9, 0);
  g.add(light);
  return light;
}

// A rune pillar: a dark tapered obelisk, a glowing strip of runes facing the arena.
function obelisk(root, a, r, h, color, broken) {
  const g = group(root, { p: [Math.cos(a) * r, 0, Math.sin(a) * r] });
  g.lookAt(0, 0, 0);
  const stone = MAT.rock('#26202a', { flat: true, bump: 1.1 });
  const body = new THREE.CylinderGeometry(0.27, 0.36, h, 4, 1).rotateY(Math.PI / 4).translate(0, h / 2, 0);
  const m = part(g, body, stone);
  if (broken) m.rotation.z = (a > 0 ? 1 : -1) * 0.12;
  else part(g, new THREE.ConeGeometry(0.27, 0.5, 4).rotateY(Math.PI / 4), stone, { p: [0, h + 0.25, 0] });
  part(g, new THREE.CylinderGeometry(0.46, 0.5, 0.22, 4).rotateY(Math.PI / 4), stone, { p: [0, 0.11, 0] });
  const strip = part(m, new THREE.BoxGeometry(0.07, h * 0.62, 0.02), MAT.glow(color, 1.7), { p: [0, h * 0.5, 0.31 * 0.72 + 0.02], shadow: false });
  strip.rotation.x = -Math.atan((0.09 * 0.7) / h);
  for (let i = 0; i < 4; i++) {
    const f = 0.28 + i * 0.13;
    part(m, new THREE.BoxGeometry(0.16, 0.025, 0.02), MAT.glow(color, 1.7), { p: [0, h * f, 0.255 - 0.064 * f + 0.012], shadow: false });
  }
  return g;
}

// hw: dressed for Night of Fangs.
function buildArena(scene, q, hw = false) {
  const root = group(scene);
  const ground = groundTextures();
  const cracks = hw ? ground.cracksW : ground.cracks;
  const hot = hw ? '#3aff6a' : '#ff4a12';
  const top = new THREE.MeshStandardMaterial({ map: ground.map, roughness: 0.96, emissiveMap: cracks, emissive: new THREE.Color(hw ? '#2aff5a' : '#ff5a1a'), emissiveIntensity: hw ? 0.3 : 0.45 });
  for (const t of [top.map, top.emissiveMap]) t.repeat.set(4, 4);
  const cliff = MAT.rock('#2a2026', { flat: false, bump: 1.3 });
  const island = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 5.9, 0.6, 72, 1), [cliff, top, cliff]);
  island.position.y = -0.3;
  island.receiveShadow = true;
  root.add(island);
  // The rocky underside, with noise so it doesn't read as a cone, molten in its cracks.
  const under = new THREE.ConeGeometry(5.9, 6.5, 48, 10, true);
  const pos = under.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (fbm(Math.atan2(v.z, v.x) * 2 + 7, v.y * 0.6 + 20, 1024, 4, 3) - 0.5) * 0.55;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  under.computeVertexNormals();
  const underM = MAT.rock('#1d161a', { flat: false, bump: 1.4, emit: hot, emitK: hw ? 1.2 : 2.2 });
  underM.emissiveMap = cracks;
  underM.side = THREE.DoubleSide;
  part(root, under, underM, { p: [0, -3.85, 0], r: [Math.PI, 0, 0], shadow: false });

  const floor = floorTextures();
  const floorM = new THREE.MeshStandardMaterial({ map: floor.map, roughness: 0.9, emissiveMap: floor.emissiveMap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.5, normalMap: MAT.rock('#fff').normalMap });
  floorM.normalScale.set(0.7, 0.7);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 96), floorM);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.005;
  disc.receiveShadow = true;
  root.add(disc);
  part(root, new THREE.TorusGeometry(4.62, 0.1, 10, 120), MAT.metal('#5a3d22', { rough: 0.42 }), { p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] });

  // Rubble scattered on the outer ring.
  const rubble = new THREE.InstancedMesh(rockGeo(5, 0.3, 1), MAT.rock('#2c2428'), q.high ? 150 : 70);
  const mtx = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  for (let i = 0; i < rubble.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4.9 + Math.random() * 1.35;
    const s = 0.05 + Math.random() ** 2 * 0.22;
    quat.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    mtx.compose(new THREE.Vector3(Math.cos(a) * r, s * 0.3, Math.sin(a) * r), quat, new THREE.Vector3(s, s * 0.7, s));
    rubble.setMatrixAt(i, mtx);
  }
  rubble.castShadow = rubble.receiveShadow = true;
  root.add(rubble);

  // Rune pillars around the back half (the front stays open for the camera), some broken,
  // with element crystals floating over the whole ones.
  const flicker = [];
  const N = 14;
  const order = ['ember', 'bloom', 'stone', 'volt', 'tide'];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.11;
    if (Math.sin(a) > 0.4) continue;
    const r = 5.55 + (i % 3) * 0.2;
    const broken = i % 3 === 2;
    const h = broken ? 0.9 + (i % 4) * 0.25 : 1.8 + ((i * 37) % 7) / 7;
    const el = order[i % 5];
    obelisk(root, a, r, h, broken ? '#ff7a2a' : ELEMENTS[el].color, broken);
    if (!broken && i % 2) {
      const cr = part(root, new THREE.OctahedronGeometry(0.2, 0), MAT.crystal(ELEMENTS[el].color, { glow: 1.4 }), { p: [Math.cos(a) * r, h + 0.95, Math.sin(a) * r], s: [1, 1.7, 1], shadow: false });
      cr.userData.spin = 0.5 + (i % 3) * 0.2;
      flicker.push({ crystal: cr, y: cr.position.y });
    }
  }

  // The broken gate behind the arena, framing the moon.
  const gate = group(root, { p: [0, 0, -5.75] });
  const gateM = MAT.rock('#231c24', { flat: true, bump: 1.2 });
  for (const [x, h, tilt] of [[-2.35, 3.9, 0.02], [2.35, 3.3, -0.05]]) {
    const col = part(gate, new THREE.BoxGeometry(0.85, h, 0.85).translate(0, h / 2, 0), gateM, { p: [x, 0, 0], r: [0, 0, tilt] });
    part(gate, new THREE.BoxGeometry(1.15, 0.3, 1.15), gateM, { p: [x, 0.15, 0] });
    part(col, new THREE.BoxGeometry(1.05, 0.28, 1.05), gateM, { p: [0, h, 0] });
    part(col, new THREE.BoxGeometry(0.1, h * 0.6, 0.02), MAT.glow('#ff8a3a', 2.0), { p: [0, h * 0.5, 0.44], shadow: false });
  }
  // The lintel, snapped: a stub still on the left column, the rest fallen at the foot of the
  // right one, so the moon shows through the gap.
  part(gate, new THREE.BoxGeometry(1.9, 0.55, 0.9), gateM, { p: [-1.85, 4.3, 0], r: [0, 0, 0.04] });
  part(gate, new THREE.BoxGeometry(1.7, 0.5, 0.85), gateM, { p: [1.45, 0.25, 0.95], r: [0.1, 0.5, 0.16] });
  part(gate, new THREE.BoxGeometry(0.9, 0.42, 0.75), gateM, { p: [0.55, 0.21, 1.5], r: [0.3, 1.2, -0.1] });
  part(gate, rockGeo(4, 0.3, 1), gateM, { p: [2.9, 0.2, 0.7], s: [0.4, 0.3, 0.35] });

  // Braziers: two behind the fight and two at the sides, just out of the side view.
  const lights = [];
  for (const [x, z, light] of [[-4.75, -2.2, true], [4.75, -2.2, true], [-5.1, 1.9, q.high], [5.1, 1.9, q.high]]) {
    const l = (hw ? lanternPost : brazier)(root, x, z, q, light);
    if (l) lights.push({ light: l, base: l.intensity, ph: x * 3.1 + z });
  }

  // Far below: the sea of fire, and black mountains lit red from beneath.
  const lava = new THREE.Mesh(new THREE.CircleGeometry(300, 64), lavaMaterial(hw));
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -18;
  lava.userData.timed = [lava.material];
  root.add(lava);
  for (const [radius, height, topC, baseC, seed] of [[165, 13, '#0a060b', hw ? '#0c3a1c' : '#6a1c0c', 3], [120, 7, '#060407', hw ? '#06200e' : '#3a0c06', 9]]) {
    const NN = 220;
    const verts = [];
    const cols = [];
    const idx = [];
    const ct = new THREE.Color(topC);
    const cb = new THREE.Color(baseC);
    for (let i = 0; i <= NN; i++) {
      const a = (i / NN) * Math.PI * 2;
      const n = fbm(i / 9 + seed, seed, 1024, 4, seed);
      const peak = Math.max(0, fbm(i / 3 + seed * 2, 1, 1024, 2, seed + 1) - 0.52) * 2.4;
      const hgt = height * (0.2 + n * 0.9 + peak * 0.6);
      verts.push(Math.cos(a) * radius, -26, Math.sin(a) * radius, Math.cos(a) * radius, hgt - 4, Math.sin(a) * radius);
      cols.push(cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
      if (i < NN) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    const ridge = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    ridge.renderOrder = -5;
    root.add(ridge);
  }
  // Rock shards drifting around the island, and a few distant islands.
  const shards = group(root);
  const shardM = MAT.rock('#241c22', { emit: hot, emitK: hw ? 1.4 : 2.4 });
  shardM.emissiveMap = cracks;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.4;
    const r = 11.5 + (i % 4) * 1.8;
    const s = 0.18 + ((i * 7) % 5) * 0.055;
    const sh = part(shards, rockGeo(i * 5.3, 0.35, 1), shardM, { p: [Math.cos(a) * r, 1.2 + ((i * 13) % 7) * 0.55, Math.sin(a) * r], s: [s, s * 1.6, s], shadow: false });
    sh.userData = { a, r, s: 0.02 + (i % 3) * 0.012, y: sh.position.y, ph: i * 1.7 };
  }
  for (const [x, y, z, s] of [[-34, 1, -40, 2.6], [36, -2, -46, 3.0], [-50, -4, -16, 2.2], [48, 3, -22, 1.8], [-44, -8, -64, 3.0], [46, -6, -62, 2.4]]) {
    const isl = group(root, { p: [x, y, z], s });
    part(isl, rockGeo(x, 0.3, 2), MAT.rock('#1e171c', { emit: hw ? '#2aff5a' : '#ff3a0a', emitK: 0.25 }), { s: [1.6, 1.4, 1.5], p: [0, -1.3, 0], r: [Math.PI, 0, 0], shadow: false });
    part(isl, new THREE.CylinderGeometry(1.6, 1.5, 0.3, 24), MAT.rock('#2a2026'), { shadow: false });
    isl.userData.bob = Math.random() * 6;
  }
  // Low mist around the rim, embers rising from below, ash drifting down.
  const mist = group(root);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: hw ? '#2a3a3c' : '#3a2236', transparent: true, opacity: hw ? 0.3 : 0.22, depthWrite: false }));
    m.position.set(Math.cos(a) * 6.2, 0.2, Math.sin(a) * 6.2);
    m.scale.set(5, 1.6, 1);
    mist.add(m);
  }
  const embers = emitter({ count: Math.round((q.high ? 170 : 80) * (hw ? 0.6 : 1)), color: '#ff8a32', size: 0.05, life: 7, spread: [10, 3, 8], velocity: [0.08, 0.55, 0], jitter: 0.22, swirl: 0.9 });
  embers.position.set(0, -1, -1);
  root.add(embers);
  const ash = emitter({ count: q.high ? 70 : 30, color: hw ? '#2a2238' : '#3a3238', size: 0.04, life: 9, spread: [8, 3, 6], velocity: [0.12, -0.35, 0], jitter: 0.1, additive: false, opacity: 0.8 });
  ash.position.set(0, 3.5, 0);
  root.add(ash);

  const haunted = hw ? hauntArena(root, q) : null;

  return {
    root,
    update(t) {
      haunted?.update(t);
      for (const l of lights) l.light.intensity = l.base * (0.82 + Math.sin(t * 11 + l.ph) * 0.08 + Math.sin(t * 6.7 + l.ph * 2) * 0.08 + Math.sin(t * 23 + l.ph) * 0.03);
      for (const f of flicker) { f.crystal.rotation.y = t * f.crystal.userData.spin; f.crystal.position.y = f.y + Math.sin(t * 1.5 + f.crystal.userData.spin * 9) * 0.06; }
      for (const s of shards.children) {
        const { a, r, s: sp, y, ph } = s.userData;
        const w = a + ((2 * Math.PI) / LOOP) * t * sp * 6;
        s.position.set(Math.cos(w) * r, y + Math.sin((2 * Math.PI * t) / LOOP + ph) * 0.25, Math.sin(w) * r);
        s.rotation.set(ph, ((2 * Math.PI) / LOOP) * t + ph, 0);
      }
      root.children.forEach((c) => { if (c.userData.bob !== undefined) c.position.y += Math.sin(t * 0.4 + c.userData.bob) * 0.002; });
    },
  };
}

// The lobby's altar: a dark stone disc with the arena emblem, a glowing gold rim, embers.
function buildPedestal(scene) {
  const root = group(scene);
  const floor = floorTextures();
  const m = new THREE.MeshStandardMaterial({ map: floor.map, roughness: 0.75, emissiveMap: floor.emissiveMap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.8 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.3, 0.35, 72), [MAT.rock('#2a2228', { flat: false }), m, MAT.rock('#1a1418')]);
  disc.position.y = -0.175;
  disc.receiveShadow = true;
  root.add(disc);
  part(root, new THREE.TorusGeometry(3.62, 0.045, 8, 120), MAT.glow('#ffa53a', 2.4), { p: [0, 0.0, 0], r: [Math.PI / 2, 0, 0], shadow: false });
  part(root, new THREE.TorusGeometry(3.45, 0.1, 8, 120), MAT.metal('#5a3d22', { rough: 0.42 }), { p: [0, -0.34, 0], r: [Math.PI / 2, 0, 0] });
  const embers = emitter({ count: 50, color: '#ff9a3a', size: 0.05, life: 5, spread: [3, 0.6, 2], velocity: [0.05, 0.35, 0], jitter: 0.12, swirl: 0.7 });
  embers.position.set(0, 0.6, 0);
  root.add(embers);
  const glow = glowSprite('#ff5a1a', 7, 0.12);
  glow.position.set(0, 1.6, -2.5);
  root.add(glow);
  return { root, update() {} };
}

// Lightning: three strikes in each LOOP, as [time, strength, direction].
const STRIKES = [[2.2, 1, [0.55, 0.22, -0.8]], [7.6, 0.8, [-0.75, 0.3, -0.6]], [10.3, 0.45, [0.1, 0.35, -1]]];
function lightning(t) {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  for (const [at, k, dir] of STRIKES) {
    const d = tt - at;
    if (d < 0 || d > 0.7) continue;
    return { k: k * (Math.exp(-d * 16) + (d > 0.13 ? Math.exp(-(d - 0.13) * 11) * 0.75 : 0)), dir };
  }
  return { k: 0, dir: STRIKES[0][2] };
}

/**
 * mode: 'arena' (sky + island), 'pedestal' (lobby, transparent), 'studio' (portraits,
 * transparent, no post). quality: 'high' | 'low' (default by device). theme: the event look
 * (default: the page's running event).
 */
export function createStage(canvas, { mode = 'arena', quality, preserve = false, theme = THEME } = {}) {
  const hw = theme === 'halloween';
  const q = { high: (quality ?? (lowEnd() ? 'low' : 'high')) === 'high' };
  const alpha = mode !== 'arena';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: mode === 'studio', alpha, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.high ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mode === 'studio' ? 1.1 : 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (alpha) renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = mode === 'arena' ? 0.16 : 0.26;

  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 500);
  const look = new THREE.Vector3(0, 0.9, 0);
  // shift: where the target shows, as a fraction of the canvas from its center ([right, down]).
  const view = { pos: new THREE.Vector3(0, 3.2, 11.5), target: new THREE.Vector3(0, 0.9, 0), fov: 32, sway: 0.12, shift: [0, 0] };

  // Light: warm firelight key with soft shadows, a cold storm fill from the other side, a
  // red rim from the moon behind, and dark sky/ground ambience.
  const arena = mode === 'arena';
  const hemi = new THREE.HemisphereLight(hw ? '#4a2a78' : '#3a4078', hw ? '#0e2a14' : '#2a0e08', arena ? 0.45 : 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(hw ? '#c8b8ff' : '#c4c8ff', arena ? 2.2 : 3.1);
  key.position.set(-5, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(q.high ? 2048 : 1024);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ff9a5c', arena ? 0.35 : 0.8);
  fill.position.set(7, 4, 5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(hw ? '#ff8a30' : '#ff4a2c', arena ? (hw ? 2.6 : 2.3) : 4.6);
  rim.position.set(-3, 4.5, -9);
  scene.add(rim);
  // Away from the arena, a second, cold rim on the other side keeps silhouettes clear.
  if (!arena) {
    const rim2 = new THREE.DirectionalLight('#7aa0ff', 2.6);
    rim2.position.set(6, 3, -6);
    scene.add(rim2);
  }
  const base = { hemi: hemi.intensity, key: key.intensity };

  let world = null;
  let sky = null;
  if (arena) {
    sky = new THREE.Mesh(new THREE.SphereGeometry(250, 48, 24), new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(hw ? '#05030c' : '#05040b') }, uMid: { value: new THREE.Color(hw ? '#1a0c2c' : '#120a1e') }, uHorizon: { value: new THREE.Color(hw ? '#1e3a2a' : '#5e1a10') },
        uMoon: { value: new THREE.Color(hw ? '#ff9a32' : '#ff5a32') }, uMoonDir: { value: new THREE.Vector3(0.06, hw ? 0.1 : 0.088, -1) }, uCloud: { value: new THREE.Color(hw ? '#140c20' : '#110d18') },
        uTime: { value: 0 }, uBolt: { value: 0 }, uBoltDir: { value: new THREE.Vector3(0, 0.2, -1) }, uMoonR: { value: hw ? 0.088 : 0.062 },
      },
      vertexShader: SKY.vertexShader, fragmentShader: SKY.fragmentShader, side: THREE.BackSide, depthWrite: false,
    }));
    sky.userData.timed = [sky.material];
    sky.renderOrder = -10;
    scene.add(sky);
    scene.fog = new THREE.FogExp2(hw ? '#0e0a18' : '#170a10', 0.019);
    world = buildArena(scene, q, hw);
  } else if (mode === 'pedestal') {
    world = buildPedestal(scene);
  }

  let composer = null;
  let bloom = null;
  let grade = null;
  if (mode !== 'studio') {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.high ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), arena ? 0.6 : 0.55, 0.45, 0.92);
    composer.addPass(bloom);
    grade = new ShaderPass(GRADE);
    if (alpha) { grade.uniforms.uVignette.value = 0; grade.uniforms.uGrain.value = 0; }
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  }

  const actors = new Set();
  const effects = [];
  let shake = { amount: 0, t0: 0 };
  let flash = { amount: 0, t0: 0, color: '#ffffff' };
  let kick = { amount: 0, t0: -9 };
  let size = { w: 1, h: 1 };

  function resize(w, h) {
    size = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    renderer.setSize(size.w, size.h, false);
    composer?.setSize(size.w, size.h);
    bloom?.resolution.set(size.w / 2, size.h / 2);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }

  function setView(v) {
    if (v.pos) view.pos.set(...v.pos);
    if (v.target) view.target.set(...v.target);
    if (v.fov) view.fov = v.fov;
    if (v.sway !== undefined) view.sway = v.sway;
    if (v.shift) view.shift = v.shift;
  }

  // ---- effects ----
  const timedFx = (obj, t0, life, onTick) => effects.push({ obj, t0, life, onTick });
  const additive = (color, k = 2.5, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...extra });

  const fx = {
    burst(pos, t0, opts = {}) {
      const b = burst(opts);
      b.position.copy(pos);
      b.material.uniforms.uStart.value = t0;
      scene.add(b);
      timedFx(b, t0, opts.life ?? 0.7);
      return b;
    },
    ring(pos, t0, { color = '#ffffff', radius = 1.6, life = 0.6, width = 0.12 } = {}) {
      const m = additive(color);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos).setY(pos.y + 0.03);
      scene.add(ring);
      timedFx(ring, t0, life, (k) => {
        ring.scale.setScalar(0.2 + radius * ease(k));
        m.opacity = (1 - k) ** 1.5;
      });
    },
    // A bright point with streaks where a blow lands.
    spark(pos, t0, { color = '#ffffff', size = 1.5, life = 0.2 } = {}) {
      const g = group(scene);
      g.position.copy(pos);
      const star = glowSprite(color, size, 1, starSprite());
      star.material.rotation = Math.random() * Math.PI;
      const core = glowSprite('#ffffff', size * 0.5, 1);
      g.add(star, core);
      timedFx(g, t0, life, (k) => {
        star.scale.setScalar(size * (0.5 + ease(k) * 0.9));
        core.scale.setScalar(size * 0.5 * (1 - k));
        star.material.opacity = (1 - k) ** 1.6;
        core.material.opacity = 1 - k;
      });
    },
    // A crescent of light sweeping across the target, facing the camera (melee hits).
    slash(pos, t0, { color = '#ffffff', size = 1.1, life = 0.26, roll = 0 } = {}) {
      const NS = 28;
      const P = [];
      const K = [];
      const idx = [];
      for (let i = 0; i <= NS; i++) {
        const k = i / NS;
        const a = -1.15 + k * 2.3;
        const w = Math.sin(k * Math.PI) * 0.17 + 0.01;
        for (const s of [0, 1]) {
          const r = 1 - w * (1 - s);
          P.push(Math.cos(a) * r, Math.sin(a) * r, 0);
          K.push(k, s);
        }
        if (i < NS) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 2));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uP: { value: 0 }, uA: { value: 1 } },
        vertexShader: 'attribute vec2 aK; varying vec2 vK; void main() { vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uP, uA; varying vec2 vK;
          void main() {
            float head = 1.0 - smoothstep(uP - 0.06, uP, vK.x);
            float tail = smoothstep(uP - 0.75, uP - 0.12, vK.x);
            vec3 c = mix(uColor * 2.6, vec3(3.2), smoothstep(0.5, 1.0, vK.y) * 0.7);
            gl_FragColor = vec4(c, head * tail * uA * (0.35 + 0.65 * vK.y));
          }`,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(pos);
      mesh.quaternion.copy(camera.quaternion);
      mesh.rotateZ(roll);
      mesh.renderOrder = 5;
      scene.add(mesh);
      timedFx(mesh, t0, life, (k) => {
        m.uniforms.uP.value = ease(k) * 1.35;
        m.uniforms.uA.value = 1 - Math.max(0, (k - 0.6) / 0.4);
        mesh.scale.setScalar(size * (0.85 + k * 0.25));
      });
    },
    // A spinning circle of runes on the ground (skills, victory).
    rune(pos, t0, { color = '#ffb347', radius = 1.3, life = 0.9, spin = 1.6 } = {}) {
      const m = additive(color, 2.2, { map: runeTexture() });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(pos).setY(0.05);
      scene.add(mesh);
      timedFx(mesh, t0, life, (k, t) => {
        mesh.scale.setScalar(radius * (0.55 + 0.45 * ease(Math.min(1, k / 0.25))));
        mesh.rotation.z = (t - t0) * spin;
        m.opacity = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
      });
    },
    // A column of light rising from the ground.
    pillar(pos, t0, { color = '#ffb347', radius = 0.75, height = 4.5, life = 0.75 } = {}) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
        vertexShader: `varying vec2 vUv; varying float vF;
          void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vF = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv; varying float vF;
          void main() { float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * (0.05 + vF * vF * 0.7) * uA; gl_FragColor = vec4(uColor * 1.6, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, height, 32, 1, true).translate(0, height / 2, 0), m);
      mesh.position.copy(pos).setY(0);
      scene.add(mesh);
      timedFx(mesh, t0, life, (k) => {
        const s = 0.35 + ease(Math.min(1, k / 0.3)) * 0.65;
        mesh.scale.set(s * (1 - k * 0.3), 0.6 + ease(Math.min(1, k / 0.35)) * 0.4, s * (1 - k * 0.3));
        m.uniforms.uA.value = (k < 0.15 ? k / 0.15 : 1) * (1 - Math.max(0, (k - 0.45) / 0.55));
      });
    },
    // A sphere of light flying from a to b on a small arc, with a fading trail.
    orb(a, b, t0, { color = '#ffffff', dur = 0.35, size = 0.5, arc = 0.6 } = {}) {
      const g = group(scene);
      const head = glowSprite(color, size, 1);
      const core = glowSprite('#ffffff', size * 0.4, 1);
      g.add(head, core);
      const trail = [0, 1, 2, 3, 4, 5].map((i) => { const s = glowSprite(color, size * (0.85 - i * 0.12), 0.55 - i * 0.08); g.add(s); return s; });
      const at = (k, out) => out.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * arc);
      timedFx(g, t0, dur, (k) => {
        at(k, head.position);
        core.position.copy(head.position);
        trail.forEach((s, i) => at(Math.max(0, k - (i + 1) * 0.05), s.position));
      });
    },
    // A jagged lightning bolt, re-drawn 24 times a second.
    bolt(a, b, t0, { color = '#bfeaff', life = 0.35, width = 0.024 } = {}) {
      const m = MAT.glow(color, 4.5);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      scene.add(mesh);
      let slot = -1;
      timedFx(mesh, t0, life, (k, t) => {
        const s = Math.floor(t * 24);
        if (s === slot) return;
        slot = s;
        let seed = s * 9301 + 49297;
        const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) - 0.5;
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const p = new THREE.Vector3().lerpVectors(a, b, i / 10);
          if (i && i < 10) p.add(new THREE.Vector3(rnd() * 0.5, rnd() * 0.5, rnd() * 0.5));
          pts.push(p);
        }
        mesh.geometry.dispose();
        mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 30, width, 5, false);
      });
    },
    // Rocks bursting up from the ground (Quake), glowing in their seams.
    spikes(pos, t0, { color = '#3a3034', life = 0.9, count = 8 } = {}) {
      const g = group(scene, { p: [pos.x, 0, pos.z] });
      const mat = MAT.rock(color, { emit: '#ff8a3a', emitK: 0.35 });
      const rocks = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r = part(g, new THREE.ConeGeometry(0.2, 0.85, 5).translate(0, 0.42, 0), mat, { p: [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], r: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45] });
        rocks.push(r);
      }
      timedFx(g, t0, life, (k) => {
        const up = k < 0.15 ? ease(k / 0.15) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        rocks.forEach((r) => r.scale.set(1, Math.max(0.001, up), 1));
      });
    },
    // An arcane shell around a monster while it has a shield: bright at the edges, with
    // bands of light climbing it.
    bubble(color = '#7fd8ff') {
      const m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main() {
            float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.4);
            float bands = smoothstep(0.86, 1.0, sin(vP.y * 16.0 - uTime * 3.0) * 0.5 + 0.5);
            float hex = smoothstep(0.9, 1.0, abs(sin(atan(vP.z, vP.x) * 9.0)));
            float a = clamp(f * 0.7 + (bands * 0.35 + hex * 0.15) * (0.2 + f) + 0.02, 0.0, 1.0);
            gl_FragColor = vec4(uColor * 1.3, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), m);
      mesh.userData.timed = [m];
      return mesh;
    },
    // A sheet ghost rising out of a defeated monster (Night of Fangs).
    ghost(pos, t0, { life = 1.8, scale = 1.1 } = {}) {
      const s = ghostSprite(scale, 0);
      s.position.copy(pos);
      scene.add(s);
      timedFx(s, t0, life, (k) => {
        s.position.y = pos.y + ease(k) * 1.6;
        s.position.x = pos.x + Math.sin(k * 9) * 0.12;
        s.material.opacity = 0.75 * Math.min(1, k / 0.15) * (1 - Math.max(0, (k - 0.5) / 0.5));
      });
    },
    shake(amount, t0) { if (amount > shake.amount * Math.max(0, 1 - (t0 - shake.t0) / 0.4)) shake = { amount, t0 }; },
    flash(amount, t0, color = '#ffffff') { flash = { amount, t0, color }; },
    // A quick zoom-in punch on the camera.
    kick(amount, t0) { kick = { amount, t0 }; },
  };

  function render(t) {
    for (const a of actors) a.tick(t);
    world?.update(t);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const k = (t - e.t0) / e.life;
      e.obj.visible = k >= 0;
      if (k >= 1) {
        scene.remove(e.obj);
        e.obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        effects.splice(i, 1);
      } else if (k >= 0) e.onTick?.(k, t);
    }
    setTime(scene, t);
    // Point sprites are sized in pixels; keep them the same size at any resolution.
    const pxScale = (size.h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    scene.traverse((o) => { const u = o.material?.uniforms?.uScale; if (u) u.value = pxScale; });
    if (sky) {
      const bolt = lightning(t);
      sky.material.uniforms.uBolt.value = bolt.k;
      sky.material.uniforms.uBoltDir.value.set(...bolt.dir);
      hemi.intensity = base.hemi + bolt.k * 2.4;
      key.intensity = base.key + bolt.k * 3;
    }

    const sk = shake.amount * Math.max(0, 1 - (t - shake.t0) / 0.4);
    const kk = t >= kick.t0 ? kick.amount * Math.exp(-(t - kick.t0) * 7) * Math.min(1, (t - kick.t0) / 0.04) : 0;
    const sway = view.sway;
    camera.position.copy(view.pos).add(new THREE.Vector3(Math.sin(t * 0.21) * sway, Math.sin(t * 0.17) * sway * 0.4, 0));
    camera.position.x += Math.sin(t * 61) * sk * 0.12;
    camera.position.y += Math.cos(t * 53) * sk * 0.1;
    camera.fov = view.fov * (1 - kk * 0.08);
    const [sx, sy] = view.shift;
    if (sx || sy) camera.setViewOffset(size.w, size.h, -sx * size.w, -sy * size.h, size.w, size.h);
    else if (camera.view?.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    look.copy(view.target);
    camera.lookAt(look);
    if (grade) {
      const fk = Math.max(0, 1 - (t - flash.t0) / 0.25);
      grade.uniforms.uFlash.value = flash.amount * fk * fk;
      grade.uniforms.uFlashColor.value.set(flash.color);
      grade.uniforms.uTime.value = t;
    }
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function add(rig) {
    actors.add(rig);
    scene.add(rig.root);
  }
  function remove(rig) {
    actors.delete(rig);
    scene.remove(rig.root);
  }

  function dispose() {
    effects.length = 0;
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) m.dispose?.();
    });
    composer?.dispose?.();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  return { renderer, scene, camera, key, fx, resize, setView, render, add, remove, dispose, quality: q, get size() { return size; } };
}
