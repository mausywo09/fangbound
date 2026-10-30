// The 3D battle view: six rigs in the arena, moved by sim events. Lunges, knockbacks,
// casts, falls and victory hops are functions of the battle clock, so 2× and 4× speed
// and Skip all stay in step. HUDs (bars, names, numbers) are HTML pinned over each rig.
import * as THREE from 'three';
import { createStage } from './three/stage.js';
import { buildMonster } from './three/monsters.js';
import { formation, fitCamera } from './three/formation.js';
import { glowSprite } from './three/kit.js';
import { BY_ID, ELEMENTS } from './data.js';
import { THEME } from './theme.js';

const T0 = 100; // stage time = battle time + T0, so the intro (negative battle time) is fine
const ease = (k) => 1 - (1 - k) ** 3;
const UP = new THREE.Vector3(0, 1, 0);

const IMPACT = {
  ember: { color: '#ff7a2a', burst: { color: '#ffa040', count: 54, speed: 3.4, gravity: 1, size: 0.16, life: 0.75 }, ring: true },
  bloom: { color: '#7dff5a', burst: { color: '#9dff6a', count: 44, speed: 2.6, gravity: 3.5, size: 0.12, life: 0.9 } },
  stone: { color: '#ffb347', burst: { color: '#c9b08a', count: 34, speed: 2.8, gravity: 7, size: 0.15, life: 0.8, additive: false }, spikes: true, shake: 1 },
  volt: { color: '#bfeaff', burst: { color: '#fff2a0', count: 42, speed: 3.8, gravity: 0, size: 0.1, life: 0.45 }, bolt: true, flash: 0.08 },
  tide: { color: '#4ac8ff', burst: { color: '#8fd4ff', count: 46, speed: 2.9, gravity: 6, size: 0.13, life: 0.8 }, ring: true },
};

// hud: false draws no bars or names, and lockCamera leaves the camera to the caller (both
// for the landing-page video). quality: see createStage. theme: the event look (default:
// the page's running event), so a video can show both looks on one page.
export function create3dView(arena, res, { hudHtml, hud: showHud = true, quality, lockCamera = false, theme = THEME } = {}) {
  arena.classList.add('arena3d');
  arena.insertAdjacentHTML('afterbegin', '<canvas class="stage3d"></canvas><div class="huds"></div>');
  const canvas = arena.querySelector('canvas.stage3d');
  const huds = arena.querySelector('.huds');
  const stage = createStage(canvas, { mode: 'arena', quality, preserve: !showHud, theme });

  const U = {};
  for (const u of res.start) {
    const rig = buildMonster(u.id, { evo: u.evo, theme });
    stage.add(rig);
    const hud = document.createElement('div');
    hud.className = `hud ${u.side}`;
    hud.dataset.uid = u.uid;
    hud.innerHTML = showHud ? hudHtml(u) : '';
    if (showHud) huds.appendChild(hud);
    const def = BY_ID[u.id];
    U[u.uid] = {
      u, rig, hud, el: def.element, ranged: def.role === 'mystic' || rig.float > 0,
      home: new THREE.Vector3(), yaw: 0, acts: [], tint: null, dead: null, win: null, stars: null, bubble: null, shield: 0,
    };
  }

  let layoutName = null;
  let f = null;
  let cam = null;
  function layout() {
    const w = arena.clientWidth || 640;
    const h = arena.clientHeight || 360;
    stage.resize(w, h);
    const name = w / h < 0.95 ? 'portrait' : 'landscape';
    if (name !== layoutName) {
      layoutName = name;
      f = formation(name);
      for (const x of Object.values(U)) {
        // A raid boss fights alone and stands further back, in the middle.
        const alone = res.start.filter((u) => u.side === x.u.side).length === 1;
        const s = alone ? f.boss[x.u.side] : f[x.u.side][x.u.slot];
        x.home.set(...s.pos);
        x.yaw = s.yaw;
      }
    }
    cam = fitCamera(f.camera, w / h);
    if (!lockCamera) stage.setView(cam);
  }
  const ro = new ResizeObserver(layout);
  ro.observe(arena);
  layout();

  let now = T0;
  const chest = (x) => x.rig.root.position.clone().add(new THREE.Vector3(0, x.rig.height * 0.5 + (x.rig.float ? 0.15 : 0), 0));
  const act = (x, type, dur, extra = {}) => x.acts.push({ type, t0: now, dur, ...extra });
  const flashTint = (x, color, amount = 1, at = now) => { x.tint = { color, amount, t0: at }; };

  function impact(tgt, src, at, element, big, melee) {
    const fx = IMPACT[element];
    const p = chest(tgt);
    stage.fx.spark(p, at, { color: fx.color, size: big ? 2.3 : 1.5 });
    stage.fx.burst(p, at, big ? fx.burst : { ...fx.burst, count: Math.round(fx.burst.count * 0.45), speed: fx.burst.speed * 0.7 });
    if (melee) stage.fx.slash(p, at - 0.04, { color: fx.color, size: 0.45 + tgt.rig.height * 0.3, roll: (src.u.side === 'a' ? -1 : 1) * (0.5 + Math.random() * 0.5) });
    if (big && fx.ring) stage.fx.ring(tgt.home.clone(), at, { color: fx.color, radius: 1.4 });
    if (big && fx.spikes) stage.fx.spikes(tgt.home.clone(), at, {});
    if (big && fx.shake) stage.fx.shake(fx.shake, at);
    if (big && fx.flash) stage.fx.flash(fx.flash, at, '#dff6ff');
    if (big) stage.fx.kick(0.6, at);
  }

  const view = {
    stage,
    hud: (uid) => U[uid].hud,
    setTime(T) { now = T + T0; },

    attack(ev) {
      const src = U[ev.src];
      const tgt = U[ev.tgt];
      if (src.ranged) {
        act(src, 'hop', 0.4);
        stage.fx.spark(chest(src), now + 0.04, { color: ELEMENTS[src.el].color, size: 0.9, life: 0.16 });
        stage.fx.orb(chest(src), chest(tgt), now + 0.06, { color: ELEMENTS[src.el].color, dur: 0.22, size: 0.6 });
      } else {
        act(src, 'lunge', 0.42, { to: tgt.home.clone() });
      }
      return 0;
    },

    cast(ev) {
      const src = U[ev.src];
      const color = ELEMENTS[src.el].color;
      act(src, 'cast', 0.62);
      flashTint(src, color, 0.6);
      stage.fx.rune(src.home.clone(), now, { color, radius: 1.5, life: 1.0 });
      stage.fx.pillar(src.home.clone(), now + 0.04, { color, radius: 0.3 + src.rig.width * 0.45, height: 4.2, life: 0.75 });
      stage.fx.burst(src.home.clone().add(new THREE.Vector3(0, 0.2, 0)), now, { color, count: 46, speed: 1.6, gravity: -2.8, up: 1, size: 0.1, life: 0.9 });
    },

    // Returns how long the numbers wait so they pop when the blow lands.
    damage(ev, fromCast) {
      const tgt = U[ev.tgt];
      const src = ev.src ? U[ev.src] : null;
      if (ev.kind === 'burn') {
        stage.fx.burst(chest(tgt), now, { color: '#ff9a3a', count: 14, speed: 1, gravity: -2, up: 1, size: 0.12, life: 0.6 });
        flashTint(tgt, '#ff7a1a', 0.5);
        return 0;
      }
      if (ev.kind === 'thorns') {
        stage.fx.burst(chest(tgt), now, { color: '#9dff7a', count: 12, speed: 1.4, size: 0.08, life: 0.5 });
        flashTint(tgt, '#7dff6a', 0.5);
        return 0;
      }
      const delay = fromCast ? 0.24 : src?.ranged ? 0.28 : 0.15;
      const at = now + delay;
      const element = src?.el ?? 'ember';
      if (fromCast && element === 'volt') stage.fx.bolt(chest(src), chest(tgt), at - 0.05, { life: 0.32 });
      impact(tgt, src, at, element, !!fromCast || ev.crit, !!src && !fromCast && !src.ranged);
      tgt.acts.push({ type: 'knock', t0: at, dur: 0.32, from: src ? src.home.clone() : null, k: ev.crit ? 1.6 : 1 });
      flashTint(tgt, ev.crit ? '#ffc060' : '#ffe6cc', ev.crit ? 0.5 : 0.32, at);
      if (ev.crit) { stage.fx.shake(0.7, at); stage.fx.flash(0.06, at, '#ffd27a'); }
      return delay;
    },

    heal(ev) {
      const tgt = U[ev.tgt];
      stage.fx.burst(chest(tgt), now, { color: '#7dffa8', count: 28, speed: 0.9, gravity: -2.4, up: 1, size: 0.1, life: 0.95 });
      stage.fx.rune(tgt.home.clone(), now, { color: '#5dff9a', radius: 1.0, life: 0.8, spin: -1.4 });
      flashTint(tgt, '#5dff9a', 0.45);
    },

    shield(ev) {
      stage.fx.burst(chest(U[ev.tgt]), now, { color: '#a9ecff', count: 20, speed: 1.3, size: 0.08, life: 0.5 });
      stage.fx.ring(U[ev.tgt].home.clone(), now, { color: '#7fd8ff', radius: 1.1, life: 0.5, width: 0.08 });
    },

    bars(uid, s) {
      const x = U[uid];
      x.shield = s.sh;
      if (s.sh > 0 && !x.bubble) {
        x.bubble = stage.fx.bubble('#6fd0ff');
        stage.scene.add(x.bubble);
      }
      if (x.bubble) x.bubble.visible = s.sh > 0;
    },

    status(uid, st) {
      const x = U[uid];
      const stunned = st.has('stun');
      if (stunned && !x.stars) {
        x.stars = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const s = glowSprite('#ffe27a', 0.28, 1);
          s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.32, 0, Math.sin((i / 3) * Math.PI * 2) * 0.32);
          x.stars.add(s);
        }
        stage.scene.add(x.stars);
      }
      if (x.stars) x.stars.visible = stunned;
    },

    death(uid, instant) {
      const x = U[uid];
      x.dead = { t0: instant ? now - 3 : now };
      if (x.bubble) x.bubble.visible = false;
      if (x.stars) x.stars.visible = false;
      if (instant) return;
      // It burns away: smoke and embers as it dissolves.
      const p = chest(x);
      stage.fx.burst(p, now + 0.4, { color: '#140e12', count: 28, speed: 0.9, gravity: -1.1, up: 0.9, size: 0.5, life: 1.5, additive: false });
      stage.fx.burst(p, now + 0.4, { color: '#ff7a2a', count: 46, speed: 1.7, gravity: -1.6, up: 1, size: 0.08, life: 1.3 });
      stage.fx.ring(x.home.clone(), now + 0.4, { color: '#ff5a1a', radius: 1.2, life: 0.7, width: 0.06 });
      // Night of Fangs: its ghost floats up out of it.
      if (theme === 'halloween') stage.fx.ghost(p.clone().add(new THREE.Vector3(0, 0.2, 0)), now + 0.55, { scale: 0.7 + x.rig.height * 0.25 });
    },

    win(side) {
      for (const x of Object.values(U)) {
        if (x.u.side !== side || x.dead) continue;
        x.win = { t0: now + 0.2 };
        stage.fx.rune(x.home.clone(), now + 0.2, { color: '#ffb347', radius: 1.2, life: 2.4, spin: 0.7 });
        stage.fx.burst(x.home.clone().add(new THREE.Vector3(0, 0.3, 0)), now + 0.2, { color: '#ffd27a', count: 34, speed: 1.4, gravity: -2.2, up: 1, size: 0.08, life: 1.3 });
      }
    },

    frame(T) {
      now = T + T0;
      const t = now;
      // Intro: the camera eases in from further out while "Clash!" shows.
      if (!lockCamera && cam && T < 0.4) {
        const k = ease(Math.min(1, Math.max(0, (T + 1.1) / 1.5)));
        stage.setView({ ...cam, pos: cam.pos.map((v, i) => v + (v - cam.target[i]) * 0.3 * (1 - k) + (i === 1 ? 0.9 * (1 - k) : 0)) });
      }
      for (const x of Object.values(U)) {
        const pos = x.home.clone();
        let yaw = x.yaw;
        let tilt = 0;
        let lift = 0;
        let squash = 0;
        x.acts = x.acts.filter((a) => {
          const k = (t - a.t0) / a.dur;
          if (k < 0) return true;
          if (k >= 1) return false;
          if (a.type === 'lunge') {
            const d = a.to.clone().sub(x.home);
            const amt = k < 0.35 ? ease(k / 0.35) : 1 - ease((k - 0.35) / 0.65);
            pos.addScaledVector(d, 0.5 * amt);
            lift += Math.sin(Math.min(1, k / 0.35) * Math.PI) * 0.18;
            tilt -= amt * 0.18;
          } else if (a.type === 'hop') {
            lift += Math.sin(k * Math.PI) * 0.3;
            squash += Math.sin(k * Math.PI * 2) * 0.08;
          } else if (a.type === 'knock') {
            const away = a.from ? x.home.clone().sub(a.from).setY(0).normalize() : new THREE.Vector3();
            const amt = Math.sin(k * Math.PI) * (1 - k * 0.3);
            pos.addScaledVector(away, 0.28 * amt * a.k);
            tilt += amt * 0.28 * a.k;
          } else if (a.type === 'cast') {
            lift += Math.sin(k * Math.PI) * 0.7;
            yaw += ease(k) * Math.PI * 2;
            squash += k < 0.15 ? -k * 1.2 : k > 0.85 ? -(1 - k) * 1.2 : 0.06;
          }
          return true;
        });
        if (x.win) {
          const w = Math.max(0, t - x.win.t0) * 2.6;
          lift += Math.abs(Math.sin(w * Math.PI)) * 0.35;
          squash += Math.sin(w * Math.PI * 2) * 0.05;
        }
        const r = x.rig;
        if (x.dead) {
          const k = Math.min(1, (t - x.dead.t0) / 0.7);
          const f = 1 - Math.min(1, Math.max(0, (t - x.dead.t0 - 0.4) / 1.0));
          r.pivot.rotation.z = ease(k) * 0.5;
          pos.y -= ease(k) * 0.1 + (1 - f) * 0.25;
          r.fade(f);
          r.root.visible = f > 0;
          r.shadowBlob.material.opacity = (r.float ? 0.35 : 0.6) * f;
        } else {
          r.pivot.rotation.z = tilt;
        }
        pos.y += lift;
        r.root.position.copy(pos);
        r.root.rotation.y = yaw;
        r.pivot.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
        r.shadowBlob.position.y = 0.012 - lift;
        if (x.tint) {
          const k = (t - x.tint.t0) / 0.22;
          r.setTint(x.tint.color, k < 0 ? 0 : Math.max(0, 1 - k) * x.tint.amount);
          if (k >= 1) { r.setTint('#000000', 0); x.tint = null; }
        }
        if (x.dead && t - x.dead.t0 > 0.2) r.setTint('#ff3a10', Math.min(1, (t - x.dead.t0 - 0.2) / 0.6));
        if (x.bubble?.visible) {
          x.bubble.position.copy(pos).add(new THREE.Vector3(0, r.height * 0.45 + (r.float ? 0.15 : 0), 0));
          x.bubble.scale.setScalar(Math.max(r.width, r.height * 0.6) * 0.95 * (1 + Math.sin(t * 4) * 0.02));
        }
        if (x.stars?.visible) {
          x.stars.position.copy(pos).add(new THREE.Vector3(0, r.height + 0.1, 0));
          x.stars.rotation.y = t * 4;
        }
      }
      stage.render(t);
      if (!showHud) return;
      // Pin each HUD above its monster.
      const w = arena.clientWidth;
      const h = arena.clientHeight;
      const v = new THREE.Vector3();
      for (const x of Object.values(U)) {
        v.copy(x.home).addScaledVector(UP, x.rig.height + 0.12 + (x.rig.float ? 0.1 : 0)).project(stage.camera);
        x.hud.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    },

    dispose() {
      ro.disconnect();
      stage.dispose();
    },
  };
  return view;
}
