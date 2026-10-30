// Deterministic battle simulation. Same match in, same events out, on any machine,
// so the server decides every match and the browser plays the same battle back.
import { BY_ID, ROLES, elementMult, synergy } from './data.js';

// Bump when a change to data.js or sim.js changes battle outcomes: stored matches record
// the version they were fought on, and replays from another version may play out differently.
// 2: the 2026-10-30 balance pass (every monster within about 48–52% in random lineups).
export const SIM_VERSION = 2;
export const DT = 0.05;
export const OVERTIME_AT = 30;
export const TIME_LIMIT = 60;
export const MAX_LEVEL = 10;
const MANA_PER_ATTACK = 20;
const MANA_PER_HIT_TAKEN = 6;
const CRIT_MULT = 1.6;

// mulberry32: tiny, fast, good enough for game rolls.
export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const levelMult = (level) => 1 + 0.05 * (level - 1);
// An evolved monster (team entry { evo: true }) hits harder and lasts longer.
export const EVO_MULT = 1.15;

export function buildUnits(side, team) {
  const syn = synergy(team.map((m) => BY_ID[m.id].element));
  return team.map((m, slot) => {
    const def = BY_ID[m.id];
    const level = m.level || 1;
    const evo = !!m.evo;
    const k = levelMult(level) * (evo ? EVO_MULT : 1);
    const bonus = syn[def.element];
    const maxHp = Math.round(def.hp * k * (1 + bonus.hp));
    return {
      uid: side + slot, side, slot, def, level, evo, maxHp, hp: maxHp,
      atk: def.atk * k * (1 + bonus.atk),
      mana: ROLES[def.role].mana, shield: 0, timer: 0, st: {}, alive: true,
    };
  });
}

// match: { seed, a: { team: [{ id, level }] x3 }, b: { team } }
export function simulate(match) {
  const rand = rng32(match.seed);
  const A = buildUnits('a', match.a.team);
  const B = buildUnits('b', match.b.team);
  const all = [...A, ...B];
  const start = all.map((u) => ({ uid: u.uid, id: u.def.id, side: u.side, slot: u.slot, level: u.level, evo: u.evo, maxHp: u.maxHp, hp: u.hp, mana: u.mana }));
  const events = [];
  let t = 0;

  const emit = (e) => { e.t = Math.round(t * 100) / 100; events.push(e); };
  const snap = (u) => ({ hp: Math.max(0, Math.round(u.hp)), sh: Math.round(u.shield), mp: Math.round(u.mana) });
  const foes = (u) => (u.side === 'a' ? B : A).filter((x) => x.alive);
  const friends = (u) => (u.side === 'a' ? A : B).filter((x) => x.alive);
  const atkOf = (u) => u.atk * (1 + (u.st.atkUp?.v || 0));
  const armorOf = (u) => u.def.armor + (u.st.armorUp?.v || 0) - (u.st.shred?.v || 0);
  const interval = (u) => 100 / (u.def.spd * (1 + (u.st.haste?.v || 0)));
  // Overtime: damage climbs 15% per second so stalls always end.
  const surge = () => (t > OVERTIME_AT ? 1 + (t - OVERTIME_AT) * 0.15 : 1);

  const front = (u) => { const f = foes(u); return f.find((x) => x.st.taunt) || f[0]; };
  const back = (u) => { const f = foes(u); return f[f.length - 1]; };
  const lowest = (list) => list.reduce((m, x) => (!m || x.hp / x.maxHp < m.hp / m.maxHp ? x : m), null);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  function kill(u) {
    u.alive = false; u.hp = 0; u.shield = 0; u.st = {};
    emit({ type: 'death', tgt: u.uid });
  }

  function damage(src, tgt, amount, kind, info = {}) {
    if (!tgt.alive) return 0;
    const dmg = Math.max(1, Math.round(amount));
    const absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    tgt.hp -= dmg - absorbed;
    if (kind === 'hit') tgt.mana = Math.min(100, tgt.mana + MANA_PER_HIT_TAKEN);
    emit({ type: 'damage', src: src?.uid, tgt: tgt.uid, amount: dmg, absorbed, kind, crit: !!info.crit, adv: info.adv || 0, s: snap(tgt) });
    if (tgt.hp <= 0) kill(tgt);
    else if (kind === 'hit' && tgt.st.thorns && src?.alive) damage(tgt, src, dmg * tgt.st.thorns.v, 'thorns');
    return dmg;
  }

  function hit(src, tgt, mult, opts = {}) {
    if (!tgt?.alive) return 0;
    let dmg = atkOf(src) * mult * (0.95 + rand() * 0.1);
    const crit = rand() < src.def.crit;
    if (crit) dmg *= CRIT_MULT;
    const em = elementMult(src.def.element, tgt.def.element);
    dmg *= em * surge();
    if (opts.bonus) dmg *= opts.bonus(tgt);
    if (!opts.pierce) dmg *= 100 / (100 + Math.max(0, armorOf(tgt)));
    return damage(src, tgt, dmg, 'hit', { crit, adv: em > 1 ? 1 : em < 1 ? -1 : 0 });
  }

  function heal(src, tgt, amount) {
    if (!tgt?.alive) return;
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + Math.round(amount));
    const gained = Math.round(tgt.hp - before);
    if (gained > 0) emit({ type: 'heal', src: src?.uid, tgt: tgt.uid, amount: gained, s: snap(tgt) });
  }

  function shield(tgt, amount) {
    if (!tgt?.alive) return;
    const before = tgt.shield;
    tgt.shield = Math.min(tgt.maxHp * 0.6, tgt.shield + amount);
    const gained = Math.round(tgt.shield - before);
    if (gained > 0) emit({ type: 'shield', tgt: tgt.uid, amount: gained, s: snap(tgt) });
  }

  // Re-applying a status refreshes it with the stronger duration and value; no stacking.
  function status(tgt, kind, dur, v = 0) {
    if (!tgt?.alive) return;
    const cur = tgt.st[kind];
    if (cur) { cur.dur = Math.max(cur.dur, dur); cur.v = Math.max(cur.v, v); }
    else tgt.st[kind] = { dur, v, acc: 0 };
    emit({ type: 'status', tgt: tgt.uid, kind, dur });
  }

  function cleanse(tgt, kinds) {
    for (const k of kinds) {
      if (!tgt.st[k]) continue;
      delete tgt.st[k];
      emit({ type: 'statusEnd', tgt: tgt.uid, kind: k });
    }
  }

  function drain(tgt, amount) {
    if (!tgt?.alive) return;
    tgt.mana = Math.max(0, tgt.mana - amount);
    emit({ type: 'mana', tgt: tgt.uid, s: snap(tgt) });
  }

  const ctx = { foes, friends, front, back, lowest, pick, hit, heal, shield, status, cleanse, drain, atk: atkOf };

  function act(u) {
    if (u.mana >= 100) {
      u.mana = 0;
      emit({ type: 'cast', src: u.uid, name: u.def.skill.name, s: snap(u) });
      u.def.skill.cast(ctx, u, u.def.skill.p);
      return;
    }
    const tgt = front(u);
    if (!tgt) return;
    u.mana = Math.min(100, u.mana + MANA_PER_ATTACK);
    emit({ type: 'attack', src: u.uid, tgt: tgt.uid, s: snap(u) });
    hit(u, tgt, 1);
  }

  function tickStatuses(u) {
    for (const [k, s] of Object.entries(u.st)) {
      if (k === 'burn' || k === 'regen') {
        s.acc += DT;
        if (s.acc >= 0.5 - 1e-9) {
          s.acc -= 0.5;
          if (k === 'burn') damage(null, u, s.v * 0.5 * surge(), 'burn');
          else heal(null, u, s.v * 0.5);
          if (!u.alive) return;
        }
      }
      s.dur -= DT;
      if (s.dur <= 1e-9) {
        delete u.st[k];
        emit({ type: 'statusEnd', tgt: u.uid, kind: k });
      }
    }
  }

  const wiped = (team) => team.every((u) => !u.alive);
  const over = () => wiped(A) || wiped(B);
  for (const u of all) u.timer = interval(u) * (0.35 + rand() * 0.3);

  // Alternate who acts first each tick so neither side gets a first-mover edge. Teams
  // interleave slot by slot (A0 B0 A1 B1 A2 B2 for 3v3); a boss fights alone.
  const interleave = (x, y) => Array.from({ length: Math.max(x.length, y.length) }, (_, i) => [x[i], y[i]]).flat().filter(Boolean);
  const orderA = interleave(A, B);
  const orderB = interleave(B, A);
  let tick = 0;
  let overtime = false;
  let winner = null;
  let reason = 'ko';
  while (!winner) {
    tick++;
    t = tick * DT;
    if (!overtime && t > OVERTIME_AT) { overtime = true; emit({ type: 'overtime' }); }
    for (const u of all) if (u.alive) tickStatuses(u);
    if (!over()) {
      for (const u of tick % 2 ? orderA : orderB) {
        if (!u.alive || u.st.stun) continue;
        u.timer -= DT;
        if (u.timer <= 0) { u.timer += interval(u); act(u); }
        if (over()) break;
      }
    }
    if (over()) winner = wiped(B) && !wiped(A) ? 'a' : 'b';
    else if (t >= TIME_LIMIT - 1e-9) {
      reason = 'time';
      const left = (team) => team.reduce((s, u) => s + Math.max(0, u.hp) / u.maxHp, 0);
      winner = left(A) > left(B) ? 'a' : 'b';
    }
  }
  emit({ type: 'end', winner, reason });
  return { start, events, winner, reason, duration: Math.round(t * 100) / 100 };
}
