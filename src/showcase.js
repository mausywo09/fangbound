// The live 3D scene behind the lobby and the scout screen: the arena with your squad in
// it, and on the scout screen the opponent's team facing them, placed as in battle. One
// canvas lives for the whole visit and moves into each new render, so lineup edits don't
// cost a new WebGL context. The camera frames the monsters inside `frame`, the part of the
// screen the panels leave free. Returns null without WebGL (the screens keep their cards).
import { createStage, webglAvailable } from './three/stage.js';
import { buildMonster } from './three/monsters.js';
import { formation } from './three/formation.js';

// The squad faces right like your team in battle: Front on the right, Back on the left.
const SQUAD = [{ pos: [2.15, 0, 0.55], yaw: -0.8 }, { pos: [0, 0, -0.2], yaw: -0.62 }, { pos: [-2.15, 0, 0.35], yaw: -0.45 }];
// The versus scene uses the battle's own formations: side by side on wide screens, near
// and far on tall ones. fit: half width and half height (metres around the target) that
// must show in the frame.
const VERSUS = {
  landscape: { ...formation('landscape'), fit: [6.1, 2.0] },
  portrait: { ...formation('portrait'), fit: [3.0, 3.9] },
};
const LOBBY_CAM = { pos: [0, 2.5, 10.6], target: [0, 0.9, 0.15], sway: 0.25, fit: [3.7, 1.8] };

export function createShowcase() {
  if (!webglAvailable()) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'showcase3d';
  let stage;
  try {
    stage = createStage(canvas, { mode: 'arena' });
  } catch (e) {
    console.warn('3D lobby unavailable', e);
    return null;
  }
  let rigs = [];
  let key = '';
  let versus = false;
  let layout = '';
  let frame = null;
  let raf = 0;
  let running = false;

  // Stands the rigs on their spots: the lobby row, or a battle formation.
  function place(name) {
    layout = name;
    const f = versus ? VERSUS[name] : null;
    const spots = f ? [...f.a, ...f.b] : SQUAD;
    rigs.forEach((r, i) => {
      r.root.position.set(...spots[i].pos);
      r.root.rotation.y = spots[i].yaw;
    });
  }

  // Picks the field of view that shows the camera's fit inside the frame, then shifts the
  // picture so the target sits at the frame's center.
  const fit = () => {
    const c = canvas.parentElement?.getBoundingClientRect();
    if (!c?.width || !c.height) return;
    stage.resize(c.width, c.height);
    let f = frame?.isConnected ? frame.getBoundingClientRect() : null;
    if (!f || f.width < 2 || f.height < 2) f = c;
    const name = versus && f.width / f.height < 1.15 ? 'portrait' : 'landscape';
    if (name !== layout) place(name);
    const cam = versus ? { ...VERSUS[name].camera, sway: 0.15, fit: VERSUS[name].fit } : LOBBY_CAM;
    const fw = Math.max(0.2, f.width / c.width);
    const fh = Math.max(0.2, f.height / c.height);
    const d = Math.hypot(...cam.pos.map((v, i) => v - cam.target[i]));
    const t = Math.max(cam.fit[0] / (d * (c.width / c.height) * fw), cam.fit[1] / (d * fh));
    stage.setView({
      ...cam,
      fov: Math.min(60, (360 / Math.PI) * Math.atan(t)),
      shift: [(f.left + f.width / 2 - c.left) / c.width - 0.5, (f.top + f.height / 2 - c.top) / c.height - 0.5],
    });
  };
  const ro = new ResizeObserver(fit);

  // team, opp: [{ id, evo }] for your squad and (scout screen) the opponent's, or opp null.
  function set(team, opp) {
    const k = JSON.stringify([team, opp]);
    if (k === key) return;
    key = k;
    for (const r of rigs) {
      stage.remove(r);
      r.root.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.dispose(); });
    }
    rigs = [...team, ...(opp ?? [])].map((m) => {
      const r = buildMonster(m.id, { evo: !!m.evo });
      stage.add(r);
      return r;
    });
    versus = !!opp;
    layout = '';
  }

  const loop = (now) => {
    if (!running) return;
    if (canvas.isConnected) stage.render(now / 1000);
    else running = false;
    if (running) raf = requestAnimationFrame(loop);
  };

  return {
    show(el, { team, opp = null, frame: fr = null }) {
      set(team, opp);
      frame = fr;
      el.appendChild(canvas);
      ro.disconnect();
      ro.observe(el);
      if (fr) ro.observe(fr);
      fit();
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
