// Daily quests, the daily check-in streak and the season pass. Pure rules shared by the
// server, which applies them to each player's state, and the browser, which shows them.
// Days are UTC days; the pass runs with the 14-day ranked season and resets with it.
import { BY_ID, ELEMENTS, ELEMENT_ORDER, ROLES } from './data.js';
import { lockedIds, addMonsterXp } from './state.js';

export const DAY_MS = 864e5;
export const dayOf = (t) => Math.floor(t / DAY_MS);

// ---- season pass ----

export const PASS_TIERS = 30;
export const TIER_XP = 400;
// Pass XP per ranked match; only the first MATCH_XP_DAILY matches of a day count, so the
// pass rewards playing every day rather than grinding one day.
export const MATCH_XP = { win: 40, loss: 20 };
export const MATCH_XP_DAILY = 20;

export const TITLES = {
  initiate: 'Ember Initiate', seeker: 'Rune Seeker', stormcaller: 'Stormcaller', gatebreaker: 'Gatebreaker',
  duelist: 'Bloodmoon Duelist', ascendant: 'Ascendant', gilded: 'the Gilded', moonforged: 'Moonforged', mythbound: 'Mythbound',
  // Night of Fangs (Halloween event, src/event.js).
  pumpkinknight: 'Pumpkin Knight', hollowbane: 'Hollowbane', candyfiend: 'Candy Fiend', lanternbearer: 'Lantern Bearer', nightwarden: 'Night Warden',
};
const FREE_TITLES = { 5: 'initiate', 10: 'seeker', 15: 'stormcaller', 20: 'gatebreaker', 25: 'duelist', 30: 'ascendant' };
const PREMIUM_TITLES = { 10: 'gilded', 20: 'moonforged', 30: 'mythbound' };
const FREE_EGGS = [4, 8, 12, 17, 22, 27];
const PREMIUM_EGGS = [5, 15, 25];

// What a tier gives on a track: a title, an egg, or a training tome (XP for the squad).
export function tierReward(tier, track) {
  const titles = track === 'premium' ? PREMIUM_TITLES : FREE_TITLES;
  if (titles[tier]) return { type: 'title', id: titles[tier] };
  if ((track === 'premium' ? PREMIUM_EGGS : FREE_EGGS).includes(tier)) return { type: 'egg' };
  return { type: 'tome', xp: (track === 'premium' ? 10 : 5) + Math.floor(tier / 10) * 3 };
}

export const freshPass = (season) => ({ season, xp: 0, premium: false, free: [], paid: [] });
export const passTier = (xp) => Math.min(PASS_TIERS, Math.floor(xp / TIER_XP));

// A new season starts a new pass. Titles stay with the player.
export function syncPass(s) {
  if (s.pass?.season === s.season) return false;
  s.pass = freshPass(s.season);
  return true;
}

export function addPassXp(s, xp) {
  const from = passTier(s.pass.xp);
  s.pass.xp += xp;
  return { xp, from, to: passTier(s.pass.xp), total: s.pass.xp };
}

// Tiers reached but not claimed yet, per track (premium only once unlocked).
export function claimable(s) {
  const reached = passTier(s.pass.xp);
  const out = [];
  for (let t = 1; t <= reached; t++) {
    if (!s.pass.free.includes(t)) out.push({ tier: t, track: 'free' });
    if (s.pass.premium && !s.pass.paid.includes(t)) out.push({ tier: t, track: 'premium' });
  }
  return out;
}

// Applies a reward. An egg with nothing left to hatch becomes a big tome instead.
export function grant(s, reward) {
  if (reward.type === 'egg' && lockedIds(s).length <= s.eggs) reward = { type: 'tome', xp: 12, fromEgg: true };
  if (reward.type === 'egg') s.eggs++;
  else if (reward.type === 'title') {
    if (!s.titles.includes(reward.id)) s.titles.push(reward.id);
    s.title ??= reward.id;
  } else {
    const squad = s.lineup.map((id) => ({ id, ...addMonsterXp(s.owned[id], reward.xp) }));
    const essence = squad.reduce((a, m) => a + m.over, 0);
    s.essence += essence;
    reward = { ...reward, squad, essence };
  }
  return reward;
}

// Claims one tier on one track (false if it is not reached, already taken or locked).
export function claimTier(s, tier, track) {
  if (!Number.isInteger(tier) || tier < 1 || tier > passTier(s.pass.xp)) return false;
  if (track !== 'free' && track !== 'premium') return false;
  if (track === 'premium' && !s.pass.premium) return false;
  const taken = track === 'premium' ? s.pass.paid : s.pass.free;
  if (taken.includes(tier)) return false;
  taken.push(tier);
  return { tier, track, ...grant(s, tierReward(tier, track)) };
}

export const rewardLabel = (r) => {
  if (r.type === 'egg') return 'Monster egg';
  if (r.type === 'title') return `Title: ${TITLES[r.id]}`;
  return `Training tome · +${r.xp} XP to your squad`;
};

// ---- daily quests ----

const elName = (p) => ELEMENTS[p].name;
const roleName = (p) => ROLES[p].name;
// count(summary, p): how far one ranked match moves the quest.
export const QUESTS = {
  play: { goal: 3, xp: 120, text: () => 'Play 3 ranked matches', count: () => 1 },
  win: { goal: 2, xp: 150, text: () => 'Win 2 ranked matches', count: (m) => (m.won ? 1 : 0) },
  element: { goal: 1, xp: 120, params: ELEMENT_ORDER, text: (p) => `Win with a ${elName(p)} monster in your squad`, count: (m, p) => (m.won && m.lineup.some((id) => BY_ID[id].element === p) ? 1 : 0) },
  role: { goal: 1, xp: 150, params: Object.keys(ROLES), text: (p) => `Win with two ${roleName(p)}s in your squad`, count: (m, p) => (m.won && m.lineup.filter((id) => BY_ID[id].role === p).length >= 2 ? 1 : 0) },
  advantage: { goal: 12, xp: 150, text: () => 'Land 12 super-effective hits', count: (m) => m.advantage },
  crit: { goal: 6, xp: 120, text: () => 'Land 6 critical hits', count: (m) => m.crit },
  skill: { goal: 8, xp: 120, text: () => 'Cast 8 skills', count: (m) => m.skill },
  ko: { goal: 6, xp: 120, text: () => 'Defeat 6 enemy monsters', count: (m) => m.ko },
  flawless: { goal: 1, xp: 200, text: () => 'Win without losing a monster', count: (m) => (m.won && !m.lost ? 1 : 0) },
};
export const DAILY_BONUS = 150;
export const questText = (q) => QUESTS[q.type].text(q.p);

function newQuest(type, rand) {
  const def = QUESTS[type];
  return { type, p: def.params ? def.params[Math.floor(rand() * def.params.length)] : null, n: 0, done: false };
}

// Three quests a day: one of play/win, then two others, all different.
export function rollQuests(rand) {
  const first = rand() < 0.5 ? 'play' : 'win';
  const rest = Object.keys(QUESTS).filter((k) => k !== 'play' && k !== 'win');
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, rest[0], rest[1]].map((t) => newQuest(t, rand));
}

// A new UTC day brings new quests, a fresh reroll and a fresh match-XP allowance.
export function syncDaily(s, day, rand) {
  if (s.daily?.day === day) return false;
  s.daily = { day, quests: rollQuests(rand), rerolled: false, bonus: false, matches: 0, eggs: 0 };
  return true;
}

// Swaps one unfinished quest for one of a type not on today's list, once a day.
export function rerollQuest(s, slot, rand) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= s.daily.quests.length) return false;
  const q = s.daily.quests[slot];
  if (q.done || s.daily.rerolled) return false;
  const have = new Set(s.daily.quests.map((x) => x.type));
  const pool = Object.keys(QUESTS).filter((k) => !have.has(k));
  s.daily.quests[slot] = newQuest(pool[Math.floor(rand() * pool.length)], rand);
  s.daily.rerolled = true;
  return true;
}

// What a ranked match did for your side, read from the server's simulation.
export function matchSummary(res, lineup, won) {
  const mine = new Set(res.start.filter((u) => u.side === 'a').map((u) => u.uid));
  const m = { won, lineup, advantage: 0, crit: 0, skill: 0, ko: 0, lost: 0 };
  for (const e of res.events) {
    if (e.type === 'damage' && e.kind === 'hit' && mine.has(e.src)) {
      if (e.adv > 0) m.advantage++;
      if (e.crit) m.crit++;
    } else if (e.type === 'cast' && mine.has(e.src)) m.skill++;
    else if (e.type === 'death') {
      if (mine.has(e.tgt)) m.lost++;
      else m.ko++;
    }
  }
  return m;
}

// Applies one ranked match: quest progress, quest and bonus XP, and match XP for the pass
// (doubled by an XP booster).
export function applyMatch(s, summary, { xpMult = 1 } = {}) {
  const d = s.daily;
  const done = [];
  for (const q of d.quests) {
    if (q.done) continue;
    const def = QUESTS[q.type];
    q.n = Math.min(def.goal, q.n + def.count(summary, q.p));
    if (q.n >= def.goal) {
      q.done = true;
      done.push({ text: questText(q), xp: def.xp });
    }
  }
  let xp = done.reduce((a, q) => a + q.xp, 0);
  const bonus = !d.bonus && d.quests.every((q) => q.done);
  if (bonus) {
    d.bonus = true;
    xp += DAILY_BONUS;
  }
  const matchXp = d.matches < MATCH_XP_DAILY ? (summary.won ? MATCH_XP.win : MATCH_XP.loss) * xpMult : 0;
  d.matches++;
  return { quests: done, bonus, matchXp, ...addPassXp(s, matchXp + xp) };
}

// ---- invites ----

// An invited player who wins REF_WINS ranked matches with a wallet pays both players an
// egg and REF_XP pass XP; one player is paid for at most REF_CAP invites.
export const REF_WINS = 3;
export const REF_XP = 300;
export const REF_CAP = 20;

// ---- daily check-in ----

// Pass XP for day 1 to 7 of a streak; after day 7 the streak starts again at day 1.
export const CHECKIN = [50, 60, 70, 80, 90, 100, 200];
export const canCheckIn = (s, day) => s.checkin.day !== day;
// The streak day a check-in today would be.
export const nextStreak = (s, day) => (s.checkin.day === day - 1 ? (s.checkin.streak % CHECKIN.length) + 1 : 1);

export function checkIn(s, day) {
  if (!canCheckIn(s, day)) return false;
  const streak = nextStreak(s, day);
  s.checkin = { day, streak };
  return { streak, ...addPassXp(s, CHECKIN[streak - 1]) };
}
