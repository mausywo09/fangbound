// Battle playback: runs the sim once, then plays its event list on a clock through a
// view: the 3D arena (battle3d.js) when WebGL works, else the flat DOM view below.
// Both views share the HUD markup (bars, statuses, floating numbers) and this clock.
import { BY_ID, ELEMENTS, STATUS, monName } from './data.js';
import { simulate } from './sim.js';
import { monsterArt } from './art.js';
import { esc, tierBadge, titleTag } from './views.js';
import { webglAvailable } from './three/stage.js';
import { create3dView } from './battle3d.js';

const INTRO = 1.1;

export const hudHtml = (u) => `<div class="sts"></div>
  <div class="bars"><div class="hp"><i class="hpf"></i><i class="shf"></i></div><div class="mp"><i></i></div></div>
  <div class="fname ${u.evo ? 'evo' : ''}">${u.evo ? '★ ' : ''}${BY_ID[u.id].name} <small>Lv${u.level}</small></div>
  <div class="fx"></div>`;

// The 2D fallback: SVG sprites with CSS animations.
function createFlatView(arena, res) {
  const fighter = (u) => `<div class="fighter ${u.side}" data-uid="${u.uid}" style="--c:${ELEMENTS[BY_ID[u.id].element].color}">
  <div class="spr">${monsterArt(u.id)}<div class="bubble"></div></div>${hudHtml(u)}</div>`;
  const side = (s) => res.start.filter((u) => u.side === s);
  arena.insertAdjacentHTML('beforeend', `<div class="side a">${side('a').reverse().map(fighter).join('')}</div><div class="side b">${side('b').map(fighter).join('')}</div>`);
  const box = (uid) => arena.querySelector(`[data-uid="${uid}"]`);
  const pulse = (uid, cls) => {
    const el = box(uid).querySelector('.spr');
    el.classList.remove('lunge', 'hit', 'cast');
    void el.offsetWidth;
    el.classList.add(cls);
  };
  return {
    hud: box,
    attack(ev) { pulse(ev.src, 'lunge'); return 0; },
    cast(ev) { pulse(ev.src, 'cast'); },
    damage(ev) { if (ev.kind === 'hit') pulse(ev.tgt, 'hit'); return 0; },
    bars(uid, s) { box(uid).classList.toggle('shielded', s.sh > 0); box(uid).classList.toggle('full', s.mp >= 100); },
    status(uid, st) { box(uid).classList.toggle('stunned', st.has('stun')); },
    death(uid) { box(uid).classList.add('dead'); },
    win(side) { for (const u of res.start) if (u.side === side) box(u.uid).classList.add('win'); },
    frame() {},
    dispose() {},
  };
}

// coach(ev, res): the tutorial's callouts; returns text to show (playback holds a moment) or null.
export function mountBattle(root, match, { label = '', onEnd, coach = null }) {
  const res = simulate(match);
  const team = (p, cls) => `<div class="bteam ${cls}"><b>${esc(p.name)}</b><small>${p.boss ? '<span class="pill">Raid boss</span>' : `${tierBadge(p.rating)}${titleTag(p.title)}`}</small></div>`;
  root.innerHTML = `<section class="battle" style="--spd:1">
  <div class="bhead">${team(match.a, 'a')}
    <div class="bclock"><span class="clock">0.0s</span><small class="ot" hidden>OVERTIME</small>${label ? `<small class="lbl">${label}</small>` : ''}</div>
    ${team(match.b, 'b')}</div>
  <div class="arena"><div class="banner"></div>${coach ? '<div class="coachtip"></div>' : ''}</div>
  <div class="bctrl">
    <div class="speeds">${[1, 2, 4].map((x) => `<button class="spd ${x === 1 ? 'on' : ''}" data-spd="${x}">${x}×</button>`).join('')}</div>
    <button class="btn ghost sm skip">Skip ▸▸</button>
  </div>
</section>`;

  const section = root.querySelector('.battle');
  const arena = section.querySelector('.arena');
  const clock = root.querySelector('.clock');
  const ot = root.querySelector('.ot');
  const bannerEl = root.querySelector('.banner');

  let view = null;
  if (webglAvailable()) {
    try {
      view = create3dView(arena, res, { hudHtml });
    } catch (e) {
      console.warn('3D battle unavailable, using the flat view', e);
      arena.querySelectorAll('canvas, .huds').forEach((n) => n.remove());
      arena.classList.remove('arena3d');
      view = null;
    }
  }
  view ??= createFlatView(arena, res);

  const els = {};
  for (const u of res.start) {
    const f = view.hud(u.uid);
    els[u.uid] = {
      f, max: u.maxHp, st: new Set(), at: -Infinity,
      hp: f.querySelector('.hpf'), sh: f.querySelector('.shf'), mp: f.querySelector('.mp i'), sts: f.querySelector('.sts'), fx: f.querySelector('.fx'),
    };
  }

  let speed = 1;
  let instant = false;
  let T = -INTRO;
  let idx = 0;
  let raf = 0;
  let bannerUntil = 0;
  let endAt = Infinity;
  let finished = false;
  let stopped = false;
  let lastCast = null;
  let last = performance.now();
  let holdUntil = 0;
  let tipUntil = 0;
  const tipEl = root.querySelector('.coachtip');
  const queue = [];
  // Runs fn `delay` battle-seconds from now (so effects line up at any speed).
  const later = (delay, fn) => (instant || delay <= 0 ? fn() : queue.push({ at: T + delay, fn }));

  // A snapshot only applies if nothing newer reached this bar first.
  function bars(uid, s, t = Infinity) {
    const e = els[uid];
    if (t < e.at) return;
    e.at = t === Infinity ? e.at : t;
    e.hp.style.width = `${(100 * s.hp) / e.max}%`;
    e.sh.style.width = `${Math.min(100, (100 * s.sh) / e.max)}%`;
    e.mp.style.width = `${s.mp}%`;
    e.f.classList.toggle('full', s.mp >= 100);
    view.bars?.(uid, s);
  }
  function float(uid, text, cls) {
    if (instant) return;
    const e = els[uid];
    const n = document.createElement('span');
    n.className = `num ${cls}`;
    n.textContent = text;
    n.style.setProperty('--x', `${Math.round(Math.random() * 40 - 20)}px`);
    e.fx.appendChild(n);
    while (e.fx.childElementCount > 4) e.fx.firstChild.remove();
    setTimeout(() => n.remove(), 1100 / speed);
  }
  function banner(text, cls = '') {
    if (instant) return;
    bannerEl.textContent = text;
    bannerEl.className = `banner show ${cls}`;
    bannerUntil = T + 1.2;
  }
  function statuses(uid) {
    const e = els[uid];
    e.sts.innerHTML = [...e.st].map((k) => `<span title="${STATUS[k].label}">${STATUS[k].icon}</span>`).join('');
    view.status?.(uid, e.st);
  }

  function tip(text) {
    tipEl.textContent = text;
    tipEl.classList.add('show');
    holdUntil = performance.now() + 1700;
    tipUntil = T + 1.6;
  }

  function apply(ev) {
    if (coach && !instant) {
      const text = coach(ev, res);
      if (text) tip(text);
    }
    switch (ev.type) {
      case 'attack':
        bars(ev.src, ev.s, ev.t);
        if (!instant) view.attack(ev);
        break;
      case 'cast': {
        bars(ev.src, ev.s, ev.t);
        lastCast = { t: ev.t, src: ev.src };
        if (!instant) view.cast(ev);
        const u = res.start.find((x) => x.uid === ev.src);
        banner(`${monName(u.id, u.evo)} · ${ev.name}`, u.side);
        break;
      }
      case 'damage': {
        const fromCast = lastCast && lastCast.t === ev.t && lastCast.src === ev.src ? lastCast : null;
        const delay = instant ? 0 : view.damage(ev, fromCast) || 0;
        const tag = ev.adv > 0 ? ' ▲' : ev.adv < 0 ? ' ▼' : '';
        const cls = ev.kind === 'hit' ? (ev.crit ? 'crit' : 'dmg') : ev.kind;
        later(delay, () => {
          bars(ev.tgt, ev.s, ev.t);
          float(ev.tgt, `${ev.crit ? 'CRIT ' : ''}-${ev.amount}${tag}`, cls);
        });
        break;
      }
      case 'heal':
        bars(ev.tgt, ev.s, ev.t);
        if (!instant) view.heal?.(ev);
        float(ev.tgt, `+${ev.amount}`, 'heal');
        break;
      case 'shield':
        bars(ev.tgt, ev.s, ev.t);
        if (!instant) view.shield?.(ev);
        float(ev.tgt, `+${ev.amount} 🛡`, 'shield');
        break;
      case 'mana':
        bars(ev.tgt, ev.s, ev.t);
        break;
      case 'status':
        els[ev.tgt].st.add(ev.kind);
        statuses(ev.tgt);
        break;
      case 'statusEnd':
        els[ev.tgt].st.delete(ev.kind);
        statuses(ev.tgt);
        break;
      case 'death':
        later(instant ? 0 : 0.18, () => {
          els[ev.tgt].st.clear();
          statuses(ev.tgt);
          bars(ev.tgt, { hp: 0, sh: 0, mp: 0 }, ev.t);
          els[ev.tgt].f.classList.add('dead');
          view.death(ev.tgt, instant);
        });
        break;
      case 'overtime':
        ot.hidden = false;
        banner('Overtime! Damage rising', 'ot');
        break;
      default:
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    for (const q of queue.splice(0)) q.fn();
    clock.textContent = `${res.duration.toFixed(1)}s`;
    view.win(res.winner, instant);
    instant = false;
    // A raid ends with the king felled, or with the damage counted.
    const end = match.b.boss ? (res.winner === 'a' ? `${match.b.name} falls!` : 'Raid over') : `${res.winner === 'a' ? match.a.name : match.b.name} wins!`;
    banner(end, `start ${res.winner}`);
    endAt = T + 1.4;
  }

  function frame(now) {
    if (stopped) return;
    // Capped so a backgrounded tab resumes instead of jumping to the end.
    // A coach callout holds the battle still for a moment while it is read.
    const dt = now < holdUntil ? 0 : Math.min(1, (now - last) / 1000);
    last = now;
    T += dt * (finished ? 1 : speed);
    view.setTime?.(T);
    if (!finished) {
      while (idx < res.events.length && res.events[idx].t <= T) apply(res.events[idx++]);
      clock.textContent = `${Math.max(0, Math.min(T, res.duration)).toFixed(1)}s`;
      if (idx >= res.events.length) finish();
    }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= T) queue.splice(i, 1)[0].fn();
    if (T > bannerUntil && bannerEl.classList.contains('show')) bannerEl.className = 'banner';
    if (tipEl && T > tipUntil && now >= holdUntil) tipEl.classList.remove('show');
    view.frame(T, speed);
    if (T >= endAt) {
      endAt = Infinity;
      onEnd(res);
    }
    raf = requestAnimationFrame(frame);
  }

  section.querySelector('.speeds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-spd]');
    if (!b) return;
    speed = Number(b.dataset.spd);
    section.style.setProperty('--spd', speed);
    section.querySelectorAll('.spd').forEach((x) => x.classList.toggle('on', x === b));
  });
  section.querySelector('.skip').addEventListener('click', () => {
    if (finished) return;
    instant = true;
    for (const q of queue.splice(0)) q.fn();
    while (idx < res.events.length) apply(res.events[idx++]);
    T = Math.max(T, res.duration);
    finish();
    endAt = T + 0.3;
  });

  for (const u of res.start) bars(u.uid, { hp: u.hp, sh: 0, mp: u.mana });
  banner('Clash!', 'start');
  raf = requestAnimationFrame(frame);

  return {
    result: res,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      view.dispose();
    },
  };
}
