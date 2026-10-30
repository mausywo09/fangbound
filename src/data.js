// Static game data: elements, roles, statuses and the monster roster.
// Skill numbers live in `p`, so a description can never drift from what the sim does.

export const ELEMENTS = {
  ember: { name: 'Ember', color: '#ff7a3d', beats: 'bloom', icon: '🔥' },
  bloom: { name: 'Bloom', color: '#4fc85a', beats: 'stone', icon: '🌿' },
  stone: { name: 'Stone', color: '#c09a72', beats: 'volt', icon: '⛰️' },
  volt: { name: 'Volt', color: '#ffc928', beats: 'tide', icon: '⚡' },
  tide: { name: 'Tide', color: '#3fa2ff', beats: 'ember', icon: '💧' },
};
// The cycle in "beats" order: each element beats the next one.
export const ELEMENT_ORDER = ['ember', 'bloom', 'stone', 'volt', 'tide'];
export const ADVANTAGE = 1.3;
export const DISADVANTAGE = 0.8;

export function elementMult(attacker, defender) {
  if (ELEMENTS[attacker].beats === defender) return ADVANTAGE;
  if (ELEMENTS[defender].beats === attacker) return DISADVANTAGE;
  return 1;
}

export const ROLES = {
  guard: { name: 'Guard', icon: '🛡️', mana: 0 },
  striker: { name: 'Striker', icon: '⚔️', mana: 20 },
  mystic: { name: 'Mystic', icon: '✨', mana: 50 },
};

export const STATUS = {
  burn: { icon: '🔥', label: 'Burn' },
  regen: { icon: '🌱', label: 'Regen' },
  stun: { icon: '💫', label: 'Stunned' },
  taunt: { icon: '📣', label: 'Taunt' },
  atkUp: { icon: '💪', label: 'ATK up' },
  haste: { icon: '💨', label: 'Haste' },
  armorUp: { icon: '🛡️', label: 'Armor up' },
  shred: { icon: '💔', label: 'Armor break' },
  thorns: { icon: '🌵', label: 'Thorns' },
};

// Two of an element: +8% ATK for those two. Three: +15% ATK and +5% HP.
export function synergy(elements) {
  const count = {};
  for (const e of elements) count[e] = (count[e] || 0) + 1;
  const out = {};
  for (const [e, n] of Object.entries(count)) {
    out[e] = n >= 3 ? { atk: 0.15, hp: 0.05 } : n === 2 ? { atk: 0.08, hp: 0 } : { atk: 0, hp: 0 };
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;

export const MONSTERS = [
  {
    id: 'cindertusk', name: 'Cindertusk', element: 'ember', role: 'guard',
    hp: 1265, atk: 58, armor: 35, spd: 72, crit: 0.05,
    lore: 'Born in the throat of a volcano. It charges first and leaves only ash.',
    skill: {
      name: 'Magma Charge', p: { dmg: 1.3, burn: 0.25, dur: 4, sh: 0.1 },
      desc: (p) => `Rams the front enemy for ${pct(p.dmg)} ATK, burns it for ${pct(p.burn)} ATK/s over ${p.dur}s and gains a ${pct(p.sh)} max-HP shield.`,
      cast(c, me, p) {
        const t = c.front(me);
        c.hit(me, t, p.dmg);
        c.status(t, 'burn', p.dur, c.atk(me) * p.burn);
        c.shield(me, me.maxHp * p.sh);
      },
    },
  },
  {
    id: 'flarefox', name: 'Flarefox', element: 'ember', role: 'striker',
    hp: 787, atk: 113, armor: 12, spd: 100, crit: 0.2,
    lore: 'A fox of smoke and cinders. It hunts whoever hides in the back row.',
    skill: {
      name: 'Blaze Dash', p: { dmg: 2.0, burn: 0.25, dur: 4 },
      desc: (p) => `Dashes past the front line: hits the back-row enemy for ${pct(p.dmg)} ATK and burns it for ${pct(p.burn)} ATK/s over ${p.dur}s.`,
      cast(c, me, p) {
        const t = c.back(me);
        c.hit(me, t, p.dmg);
        c.status(t, 'burn', p.dur, c.atk(me) * p.burn);
      },
    },
  },
  {
    id: 'emberwisp', name: 'Emberwisp', element: 'ember', role: 'mystic', float: true,
    hp: 890, atk: 77, armor: 16, spd: 86, crit: 0.05,
    lore: 'A fire spirit behind an obsidian mask. Its war songs set allies ablaze.',
    skill: {
      name: 'Kindle', p: { up: 0.4, dur: 5, dmg: 1.6 },
      desc: (p) => `Every ally gains +${pct(p.up)} ATK for ${p.dur}s, then the front enemy is singed for ${pct(p.dmg)} ATK.`,
      cast(c, me, p) {
        for (const a of c.friends(me)) c.status(a, 'atkUp', p.dur, p.up);
        c.hit(me, c.front(me), p.dmg);
      },
    },
  },
  {
    id: 'thornhog', name: 'Thornhog', element: 'bloom', role: 'guard',
    hp: 1373, atk: 54, armor: 42, spd: 72, crit: 0.05,
    lore: 'Every thorn drips venom. Strike it, and it strikes back.',
    skill: {
      name: 'Bramble Coat', p: { taunt: 4, thorns: 0.5, dur: 5 },
      desc: (p) => `Taunts every enemy for ${p.taunt}s and reflects ${pct(p.thorns)} of the damage it takes for ${p.dur}s.`,
      cast(c, me, p) {
        c.status(me, 'taunt', p.taunt);
        c.status(me, 'thorns', p.dur, p.thorns);
      },
    },
  },
  {
    id: 'vinelash', name: 'Vinelash', element: 'bloom', role: 'striker',
    hp: 791, atk: 103, armor: 12, spd: 105, crit: 0.2,
    lore: 'A mantis of the deep jungle. Its arms are blades that never dull.',
    skill: {
      name: 'Razor Leaf', p: { hits: 5, dmg: 0.65 },
      desc: (p) => `Flings ${p.hits} razor leaves at random enemies, each for ${pct(p.dmg)} ATK.`,
      cast(c, me, p) {
        for (let i = 0; i < p.hits; i++) {
          const f = c.foes(me);
          if (!f.length) break;
          c.hit(me, c.pick(f), p.dmg);
        }
      },
    },
  },
  {
    id: 'sproutling', name: 'Sproutling', element: 'bloom', role: 'mystic',
    hp: 990, atk: 80, armor: 18, spd: 84, crit: 0.05,
    lore: 'A forest spirit. Where it walks, scorched earth turns green again.',
    skill: {
      name: 'Bloom Burst', p: { heal: 3.4, regen: 0.4, dur: 4 },
      desc: (p) => `Heals the weakest ally for ${pct(p.heal)} ATK, then regenerates it for ${pct(p.regen)} ATK/s over ${p.dur}s.`,
      cast(c, me, p) {
        const t = c.lowest(c.friends(me));
        c.heal(me, t, c.atk(me) * p.heal);
        c.status(t, 'regen', p.dur, c.atk(me) * p.regen);
      },
    },
  },
  {
    id: 'bouldrake', name: 'Bouldrake', element: 'stone', role: 'guard',
    hp: 1447, atk: 49, armor: 45, spd: 60, crit: 0.05,
    lore: 'A mountain that woke angry. Crystals of old magic grow from its back.',
    skill: {
      name: 'Quake', p: { dmg: 0.8, stun: 1.5 },
      desc: (p) => `Slams the ground for ${pct(p.dmg)} ATK to every enemy and stuns the front one for ${p.stun}s.`,
      cast(c, me, p) {
        const t = c.front(me);
        for (const e of c.foes(me)) c.hit(me, e, p.dmg);
        c.status(t, 'stun', p.stun);
      },
    },
  },
  {
    id: 'gravelclaw', name: 'Gravelclaw', element: 'stone', role: 'striker',
    hp: 812, atk: 103, armor: 16, spd: 85, crit: 0.2,
    lore: 'Its drills bore through armor the way others dig through dirt.',
    skill: {
      name: 'Drill Strike', p: { dmg: 2.0, shred: 15, dur: 5 },
      desc: (p) => `Drills the front enemy for ${pct(p.dmg)} ATK that ignores armor, then cracks ${p.shred} of its armor for ${p.dur}s.`,
      cast(c, me, p) {
        const t = c.front(me);
        c.hit(me, t, p.dmg, { pierce: true });
        c.status(t, 'shred', p.dur, p.shred);
      },
    },
  },
  {
    id: 'geowl', name: 'Geowl', element: 'stone', role: 'mystic',
    hp: 1062, atk: 76, armor: 24, spd: 80, crit: 0.05,
    lore: 'The crystal on its brow sees the next move before it is made.',
    skill: {
      name: 'Crystal Ward', p: { armor: 35, dur: 6, sh: 3 },
      desc: (p) => `Every ally gains +${p.armor} armor for ${p.dur}s and the weakest ally gets a shield worth ${pct(p.sh)} ATK.`,
      cast(c, me, p) {
        for (const a of c.friends(me)) c.status(a, 'armorUp', p.dur, p.armor);
        c.shield(c.lowest(c.friends(me)), c.atk(me) * p.sh);
      },
    },
  },
  {
    id: 'ohmhorn', name: 'Ohmhorn', element: 'volt', role: 'guard',
    hp: 1207, atk: 56, armor: 36, spd: 76, crit: 0.05,
    lore: 'Its horn drinks the storm. Lightning answers when it charges.',
    skill: {
      name: 'Thunder Rush', p: { dmg: 1.4, stun: 1.5, sh: 0.1 },
      desc: (p) => `Charges the front enemy for ${pct(p.dmg)} ATK, stuns it for ${p.stun}s and gains a ${pct(p.sh)} max-HP shield.`,
      cast(c, me, p) {
        const t = c.front(me);
        c.hit(me, t, p.dmg);
        c.status(t, 'stun', p.stun);
        c.shield(me, me.maxHp * p.sh);
      },
    },
  },
  {
    id: 'joltcub', name: 'Joltcub', element: 'volt', role: 'striker',
    hp: 718, atk: 106, armor: 10, spd: 108, crit: 0.2,
    lore: 'A storm tiger. Each stripe holds a thunderclap waiting to break.',
    skill: {
      name: 'Chain Bolt', p: { dmg: 1.5, falloff: [0.6, 0.4] },
      desc: (p) => `Zaps the front enemy for ${pct(p.dmg)} ATK; the bolt jumps to the other enemies at ${pct(p.falloff[0])} and ${pct(p.falloff[1])} of that.`,
      cast(c, me, p) {
        const first = c.front(me);
        if (!first) return;
        const rest = c.foes(me).filter((e) => e !== first);
        c.hit(me, first, p.dmg);
        rest.forEach((e, i) => c.hit(me, e, p.dmg * p.falloff[i]));
      },
    },
  },
  {
    id: 'buzzmoth', name: 'Buzzmoth', element: 'volt', role: 'mystic', float: true,
    hp: 990, atk: 81, armor: 16, spd: 88, crit: 0.05,
    lore: 'The eyes on its wings flash like lightning. Look too long and you freeze.',
    skill: {
      name: 'Static Dust', p: { haste: 0.35, dur: 5, drain: 25 },
      desc: (p) => `Allies attack ${pct(p.haste)} faster for ${p.dur}s and every enemy loses ${p.drain} mana.`,
      cast(c, me, p) {
        for (const a of c.friends(me)) c.status(a, 'haste', p.dur, p.haste);
        for (const e of c.foes(me)) c.drain(e, p.drain);
      },
    },
  },
  {
    id: 'shellguard', name: 'Shellguard', element: 'tide', role: 'guard',
    hp: 1305, atk: 43, armor: 44, spd: 65, crit: 0.05,
    lore: 'An ancient sea turtle. Its shell has stopped harpoons, anchors and kings.',
    skill: {
      name: 'Tidal Shell', p: { sh: 0.09 },
      desc: (p) => `Shields every ally for ${pct(p.sh)} of Shellguard's max HP.`,
      cast(c, me, p) {
        for (const a of c.friends(me)) c.shield(a, me.maxHp * p.sh);
      },
    },
  },
  {
    id: 'riptide', name: 'Riptide', element: 'tide', role: 'striker', float: true,
    hp: 796, atk: 109, armor: 14, spd: 90, crit: 0.2,
    lore: 'Smells weakness from three oceans away.',
    skill: {
      name: 'Undertow', p: { dmg: 1.8, exec: 0.4, bonus: 1 },
      desc: (p) => `Bites the weakest enemy for ${pct(p.dmg)} ATK, doubled if it is under ${pct(p.exec)} HP.`,
      cast(c, me, p) {
        c.hit(me, c.lowest(c.foes(me)), p.dmg, { bonus: (t) => (t.hp / t.maxHp < p.exec ? 1 + p.bonus : 1) });
      },
    },
  },
  {
    id: 'mistling', name: 'Mistling', element: 'tide', role: 'mystic', float: true,
    hp: 1033, atk: 74, armor: 20, spd: 86, crit: 0.05,
    lore: 'Woven from the fog over drowned ships. Its glow lures, its touch numbs.',
    skill: {
      name: 'Bubble Trap', p: { stun: 2, heal: 2 },
      desc: (p) => `Traps the enemy with the highest ATK in a bubble for ${p.stun}s, then heals the weakest ally for ${pct(p.heal)} ATK and washes off Burn and Armor break.`,
      cast(c, me, p) {
        const strongest = c.foes(me).reduce((m, e) => (!m || c.atk(e) > c.atk(m) ? e : m), null);
        c.status(strongest, 'stun', p.stun);
        const t = c.lowest(c.friends(me));
        c.cleanse(t, ['burn', 'shred']);
        c.heal(me, t, c.atk(me) * p.heal);
      },
    },
  },
  // Event monsters hatch from event eggs only (never from normal eggs, never for bots).
  {
    id: 'hollowjack', name: 'Hollowjack', element: 'ember', role: 'mystic', float: true, event: 'halloween',
    hp: 1006, atk: 81, armor: 20, spd: 88, crit: 0.05,
    lore: 'A scarecrow that walked off its field on the night of fangs. Its lantern decides who gets a treat.',
    skill: {
      name: 'Trick or Treat', p: { heal: 1.3, dmg: 1.9, burn: 0.35, dur: 4 },
      desc: (p) => `Treat: heals every ally for ${pct(p.heal)} ATK. Trick: hits the enemy with the highest ATK for ${pct(p.dmg)} ATK and burns it for ${pct(p.burn)} ATK/s over ${p.dur}s.`,
      cast(c, me, p) {
        for (const a of c.friends(me)) c.heal(me, a, c.atk(me) * p.heal);
        const t = c.foes(me).reduce((m, e) => (!m || c.atk(e) > c.atk(m) ? e : m), null);
        c.hit(me, t, p.dmg);
        c.status(t, 'burn', p.dur, c.atk(me) * p.burn);
      },
    },
  },
];

// Raid bosses fight alone against a whole squad; they never join a player's roster.
export const BOSSES = [
  {
    id: 'hollowking', name: 'The Hollow King', element: 'ember', role: 'mystic', float: true, boss: true,
    hp: 30000, atk: 80, armor: 30, spd: 80, crit: 0.1,
    lore: 'The first pumpkin ever carved, crowned by everything it frightened. It rises on the night of fangs.',
    skill: {
      name: 'Harvest Moon', p: { dmg: 1.15, burn: 0.25, dur: 4 },
      desc: (p) => `Hits every enemy for ${pct(p.dmg)} ATK and burns each for ${pct(p.burn)} ATK/s over ${p.dur}s.`,
      cast(c, me, p) {
        for (const e of c.foes(me)) {
          c.hit(me, e, p.dmg);
          c.status(e, 'burn', p.dur, c.atk(me) * p.burn);
        }
      },
    },
  },
];

// How rare each monster is to hatch (not how strong: every monster is balanced to win
// about half its battles). Commons are the starters; eggs offer rares and, less often, epics.
export const RARITIES = {
  common: { name: 'Common', color: '#b9ae9a', weight: 0 },
  rare: { name: 'Rare', color: '#5aa8ff', weight: 3 },
  epic: { name: 'Epic', color: '#c070ff', weight: 1 },
  event: { name: 'Event', color: '#ff8a2a', weight: 0 },
};
const RARE = ['flarefox', 'thornhog', 'bouldrake', 'gravelclaw', 'ohmhorn', 'mistling'];
const EPIC = ['emberwisp', 'riptide', 'buzzmoth'];
for (const m of MONSTERS) m.rarity = m.event ? 'event' : EPIC.includes(m.id) ? 'epic' : RARE.includes(m.id) ? 'rare' : 'common';

export const BY_ID = Object.fromEntries([...MONSTERS, ...BOSSES].map((m) => [m.id, m]));

// Evolved monsters (Lv 10 plus essence) take an element title before their name.
export const EVO_TITLE = { ember: 'Infernal', bloom: 'Elder', stone: 'Titan', volt: 'Storm', tide: 'Abyssal' };
export const monName = (id, evo = false) => (evo ? `${EVO_TITLE[BY_ID[id].element]} ${BY_ID[id].name}` : BY_ID[id].name);
