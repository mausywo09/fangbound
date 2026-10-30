// Seasonal events. At most one runs at a time; the server picks it (EVENT=auto|off|<id>,
// auto = by date) and stamps it on every page as <html data-event>, so the whole look and
// the event content switch on and off with that one setting.
//
// Night of Fangs (Halloween): candy from ranked matches, a daily trick-or-treat, pumpkin
// eggs that hatch Hollowjack, the Hollow King raid boss, event quests with titles, and
// community gifts unlocked by everyone's damage to the boss. Pure rules, shared by the
// server (which applies them) and the browser (which shows them).
import { BY_ID } from './data.js';
import { DAY_MS, grant } from './pass.js';

export const EVENTS = {
  halloween: { id: 'halloween', name: 'Night of Fangs', start: Date.UTC(2026, 9, 24), end: Date.UTC(2026, 10, 8) },
};

// The event running at `now`, or null. Forcing one (setting = its id) runs it outside its
// dates too, with at least a day left on the clock.
export function activeEvent(now, setting = 'auto') {
  if (setting === 'off') return null;
  if (EVENTS[setting]) return { ...EVENTS[setting], end: Math.max(EVENTS[setting].end, now + DAY_MS) };
  return Object.values(EVENTS).find((e) => now >= e.start && now < e.end) ?? null;
}

// ---- Night of Fangs ----

// Candy per ranked match (the same first matches of the day that pay pass XP).
export const CANDY = { win: 12, loss: 5 };
// The daily trick-or-treat: weights and what each door holds.
export const TREATS = [
  { w: 40, kind: 'treat', candy: 40 },
  { w: 25, kind: 'treat', candy: 60 },
  { w: 15, kind: 'treat', candy: 90 },
  { w: 10, kind: 'egg', candy: 0 },
  { w: 10, kind: 'trick', candy: 25 },
];
export const EGG_COST = 150;
// The raid: three tries a UTC day; candy for damage, a bonus for felling the king.
export const BOSS = { id: 'hollowking', tries: 3, per: 250, max: 80, slain: 60 };
export const BOSS_TEAM = { name: 'The Hollow King', title: null, rating: 0, boss: true, team: [{ id: 'hollowking', level: 1 }] };
// Event quests run for the whole event and pay out the moment they are done.
export const EVENT_QUESTS = {
  hunt: { goal: 10, candy: 200, title: 'pumpkinknight', text: 'Win 10 ranked matches' },
  slay: { goal: 100000, candy: 200, title: 'hollowbane', text: 'Deal 100,000 damage to the Hollow King' },
  treat: { goal: 5, candy: 150, title: 'candyfiend', text: 'Trick-or-treat on 5 days' },
  lantern: { goal: 1, candy: 100, title: 'lanternbearer', text: 'Hatch Hollowjack from a pumpkin egg' },
};
// Gifts for everyone who fought the king, unlocked by the whole community's damage.
export const GIFTS = [
  { at: 250000, reward: { type: 'candy', n: 100 }, label: '100 candy' },
  { at: 1000000, reward: { type: 'pumpkin' }, label: 'A pumpkin egg' },
  { at: 3000000, reward: { type: 'title', id: 'nightwarden' }, label: 'Title: Night Warden' },
];

// The Halloween forms: every monster in costume, with its own name.
export const COSTUME_NAMES = {
  cindertusk: 'Gourdtusk', flarefox: 'Wraithfox', emberwisp: "Jack-o'-Wisp", thornhog: 'Hollowhog', vinelash: 'Grimlash',
  sproutling: 'Pumpling', bouldrake: 'Cryptdrake', gravelclaw: 'Bonedrill', geowl: 'Hexowl', ohmhorn: 'Frankenhorn',
  joltcub: 'Batcub', buzzmoth: 'Duskmoth', shellguard: 'Graveshell', riptide: 'Ghostfin', mistling: 'Phantling',
};

// In the browser: every display of a monster's name shows its costume name (the server
// never calls this). The real name stays in `baseName`.
export function wearCostumes(theme) {
  if (theme !== 'halloween') return;
  for (const [id, name] of Object.entries(COSTUME_NAMES)) {
    const d = BY_ID[id];
    d.baseName ??= d.name;
    d.name = name;
  }
}

export const freshEvent = (id) => ({
  id, candy: 0, treat: -1, boss: { day: -1, tries: 0, best: 0, total: 0 },
  q: { hunt: 0, slay: 0, treat: 0, lantern: 0 }, done: [], gifts: [],
});

// Catches the player up to the running event (a new event starts fresh) and the day.
export function syncEvent(s, ev, day) {
  if (!ev) return false;
  if (s.event?.id !== ev.id) s.event = freshEvent(ev.id);
  if (s.event.boss.day !== day) s.event.boss = { ...s.event.boss, day, tries: 0, extra: 0 };
  return true;
}

// Moves an event quest; finished quests pay their candy and title right away.
function bump(s, key, n) {
  const e = s.event;
  const def = EVENT_QUESTS[key];
  if (e.done.includes(key)) return [];
  e.q[key] = Math.min(def.goal, e.q[key] + n);
  if (e.q[key] < def.goal) return [];
  e.done.push(key);
  e.candy += def.candy;
  grant(s, { type: 'title', id: def.title });
  return [{ key, text: def.text, candy: def.candy, title: def.title }];
}

// A pumpkin egg: Hollowjack the first time, a big training tome after that.
export function openPumpkin(s) {
  if (!s.owned.hollowjack) {
    s.owned.hollowjack = { level: 1, xp: 0 };
    return { type: 'monster', id: 'hollowjack', quests: bump(s, 'lantern', 1) };
  }
  return { ...grant(s, { type: 'tome', xp: 24 }), quests: [] };
}

export function buyPumpkin(s) {
  if (s.event.candy < EGG_COST) return false;
  s.event.candy -= EGG_COST;
  return openPumpkin(s);
}

export const canTreat = (s, day) => s.event.treat !== day;

// Today's door: candy, a pumpkin egg, or a trick (a fright, and a little candy).
export function trickOrTreat(s, day, rand) {
  if (!canTreat(s, day)) return false;
  const e = s.event;
  e.treat = day;
  let r = rand() * TREATS.reduce((a, t) => a + t.w, 0);
  const pick = TREATS.find((t) => (r -= t.w) < 0) ?? TREATS[0];
  e.candy += pick.candy;
  const egg = pick.kind === 'egg' ? openPumpkin(s) : null;
  const quests = [...(egg?.quests ?? []), ...bump(s, 'treat', 1)];
  return { kind: pick.kind, candy: pick.candy, egg, quests };
}

// What a ranked match pays: candy (if it is one of today's counted matches) and quest progress.
export function applyEventMatch(s, won, counted) {
  const candy = counted ? (won ? CANDY.win : CANDY.loss) : 0;
  s.event.candy += candy;
  return { candy, quests: won ? bump(s, 'hunt', 1) : [] };
}

// Three a day, plus any raid tickets bought today.
export const bossTriesLeft = (s) => Math.max(0, BOSS.tries + (s.event.boss.extra ?? 0) - s.event.boss.tries);

// Damage the squad dealt to the boss in a raid simulation, and whether it fell.
export function raidSummary(res) {
  const boss = res.start.find((u) => u.side === 'b').uid;
  const damage = res.events.reduce((a, e) => (e.type === 'damage' && e.tgt === boss ? a + e.amount : a), 0);
  return { damage, slain: res.events.some((e) => e.type === 'death' && e.tgt === boss) };
}

export function applyRaid(s, { damage, slain }) {
  const b = s.event.boss;
  b.tries++;
  const newBest = damage > b.best;
  b.best = Math.max(b.best, damage);
  b.total += damage;
  const candy = Math.min(BOSS.max, Math.floor(damage / BOSS.per)) + (slain ? BOSS.slain : 0);
  s.event.candy += candy;
  return { damage, slain, candy, newBest, best: b.best, total: b.total, triesLeft: bossTriesLeft(s), quests: bump(s, 'slay', damage) };
}

// A community gift can be claimed once the total is reached, by anyone who fought the king.
export const giftReady = (s, i, total) => !!GIFTS[i] && total >= GIFTS[i].at && s.event.boss.total > 0 && !s.event.gifts.includes(i);

export function claimGift(s, i, total) {
  if (!Number.isInteger(i) || !giftReady(s, i, total)) return false;
  s.event.gifts.push(i);
  const r = GIFTS[i].reward;
  if (r.type === 'candy') {
    s.event.candy += r.n;
    return { type: 'candy', n: r.n };
  }
  if (r.type === 'pumpkin') return { type: 'pumpkin', egg: openPumpkin(s) };
  return grant(s, { type: 'title', id: r.id });
}
