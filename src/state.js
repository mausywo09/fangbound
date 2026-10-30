// Player progress: rating, roster, levels, eggs and the season. Pure rules shared by the
// server, which owns every player's state, and the browser, which only displays it.
import { MONSTERS, BY_ID, RARITIES } from './data.js';
import { MAX_LEVEL } from './sim.js';

export const STARTERS = ['cindertusk', 'shellguard', 'vinelash', 'joltcub', 'sproutling', 'geowl'];
export const SEASON_DAYS = 14;
export const SEASON_MS = SEASON_DAYS * 864e5;
// An egg every 3 ranked wins, at most 3 such eggs a UTC day, so the roster fills over
// days of play (pass, invite and shop eggs come on top).
export const WINS_PER_EGG = 3;
export const WIN_EGGS_PER_DAY = 3;
// After this many egg offers without an epic, the next offer holds one.
export const EPIC_PITY = 3;
export const NAME_MAX = 16;

export const TIERS = [
  // Ratings below 900 are still Bronze; 900 is where its progress bar starts.
  { name: 'Bronze', min: 900, color: '#d39a6a' },
  { name: 'Silver', min: 1100, color: '#c9d4e6' },
  { name: 'Gold', min: 1250, color: '#ffcf4a' },
  { name: 'Platinum', min: 1400, color: '#6fe3d6' },
  { name: 'Diamond', min: 1550, color: '#86b0ff' },
  { name: 'Mythic', min: 1700, color: '#ff7ae0' },
];

export function tierOf(rating) {
  let tier = TIERS[0];
  for (const t of TIERS) if (rating >= t.min) tier = t;
  return tier;
}
export const nextTier = (rating) => TIERS.find((t) => t.min > rating) || null;
export const xpToNext = (level) => 2 + 2 * level;

export function freshState(season = 1) {
  return {
    v: 2, name: 'Trainer', season, seasonGames: 0,
    rating: 1000, peak: 1000, wins: 0, losses: 0, streak: 0,
    owned: Object.fromEntries(STARTERS.map((id) => [id, { level: 1, xp: 0 }])),
    lineup: ['cindertusk', 'joltcub', 'sproutling'],
    eggs: 0, eggWins: 0, hatchOptions: null, pity: 0,
    // XP that Lv 10 monsters earn past the cap; it pays for evolutions.
    essence: 0,
    // The team (with levels) from the last ranked match; other players fight it.
    defense: null, defSeen: 0,
    // Season pass and daily quests (src/pass.js fills them in on load); titles are kept.
    pass: null, daily: null, checkin: { day: -1, streak: 0 }, titles: [], title: null,
    // Referrals: who invited this player ({ by, name, wins, done }), and how many this
    // player invited (joined, paid out, and paid out already announced).
    ref: null, invites: { joined: 0, paid: 0, seen: 0 },
    // The first-match tutorial: null until finished or skipped ({ done, rewarded }).
    tutorial: null,
  };
}

// Gives XP to one monster, levelling it up to the cap. XP past the cap comes back as
// `over`, which the caller adds to the player's essence.
export function addMonsterXp(o, gain) {
  const from = o.level;
  o.xp += gain;
  while (o.level < MAX_LEVEL && o.xp >= xpToNext(o.level)) { o.xp -= xpToNext(o.level); o.level++; }
  let over = 0;
  if (o.level >= MAX_LEVEL) {
    over = o.xp;
    o.xp = 0;
  }
  return { gain, from, to: o.level, over };
}

// ---- evolution ----

export const EVOLVE_COST = 60;

// Why a monster can't evolve yet, or null when it can.
export function evolveBlock(s, id) {
  const o = s.owned[id];
  if (!o) return 'Hatch this monster first.';
  if (o.evo) return 'Already evolved.';
  if (o.level < MAX_LEVEL) return `Reach Lv ${MAX_LEVEL} first.`;
  if (s.essence < EVOLVE_COST) return `Needs ${EVOLVE_COST} essence.`;
  return null;
}

export function evolve(s, id) {
  if (evolveBlock(s, id)) return false;
  s.essence -= EVOLVE_COST;
  s.owned[id].evo = true;
  return true;
}

// Seasons run back to back from `epoch`, the start of season 1.
export function seasonAt(now, epoch) {
  const n = Math.max(1, Math.floor((now - epoch) / SEASON_MS) + 1);
  const start = epoch + (n - 1) * SEASON_MS;
  return { n, start, end: start + SEASON_MS };
}

// Catches a player up to the current season: each finished season soft-resets rating
// halfway back to 1000.
export function syncSeason(s, season) {
  if (s.season >= season) return false;
  while (s.season < season) {
    s.season++;
    s.rating = Math.round(1000 + (s.rating - 1000) / 2);
  }
  s.peak = s.rating;
  s.streak = 0;
  s.seasonGames = 0;
  return true;
}

export const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) || 'Trainer';

// Three different monsters the player owns.
export const validLineup = (s, lineup) =>
  Array.isArray(lineup) && lineup.length === 3 && new Set(lineup).size === 3 && lineup.every((id) => typeof id === 'string' && Object.hasOwn(s.owned, id));

// Monsters still to hatch from normal eggs (event monsters come from event eggs only).
export const lockedIds = (s) => MONSTERS.filter((m) => !m.event && !s.owned[m.id]).map((m) => m.id);

export function ratingDelta(me, opp, won, streak) {
  const expected = 1 / (1 + 10 ** ((opp - me) / 400));
  const d = Math.round(36 * ((won ? 1 : 0) - expected));
  if (!won) return Math.min(-8, d);
  return Math.max(10, d) + Math.min(6, 2 * Math.max(0, streak - 1));
}

// Applies a finished ranked match (mutates s) and reports what changed for the result screen.
// xpMult: an XP booster (×2) doubles the monster XP from this match.
export function applyResult(s, { won, oppRating, team, xpMult = 1 }) {
  const prev = s.rating;
  s.streak = won ? s.streak + 1 : 0;
  const delta = ratingDelta(prev, oppRating, won, s.streak);
  s.rating = Math.max(0, prev + delta);
  s.peak = Math.max(s.peak, s.rating);
  s.seasonGames++;
  if (won) s.wins++;
  else s.losses++;

  const gain = (won ? 3 : 1) * xpMult;
  const xp = team.map((id) => ({ id, evo: !!s.owned[id].evo, ...addMonsterXp(s.owned[id], gain) }));
  const essence = xp.reduce((a, x) => a + x.over, 0);
  s.essence += essence;

  let egg = false;
  const capped = (s.daily?.eggs ?? 0) >= WIN_EGGS_PER_DAY;
  if (won && !capped && lockedIds(s).length > s.eggs) {
    s.eggWins++;
    if (s.eggWins >= WINS_PER_EGG) {
      s.eggWins = 0;
      s.eggs++;
      egg = true;
      if (s.daily) s.daily.eggs = (s.daily.eggs ?? 0) + 1;
    }
  }
  const tierChange = tierOf(prev).name === tierOf(s.rating).name ? null : s.rating > prev ? 'up' : 'down';
  return { won, delta, prev, rating: s.rating, tierChange, xp, essence, egg, eggWins: s.eggWins, streak: s.streak, collecting: lockedIds(s).length > s.eggs, eggCapped: won && capped && lockedIds(s).length > s.eggs };
}

// Another player fought this player's defense team: half the stakes of an attack, with
// no streak bonus and no minimum.
export function defenseDelta(me, attacker, won) {
  const expected = 1 / (1 + 10 ** ((attacker - me) / 400));
  return Math.round(18 * ((won ? 1 : 0) - expected));
}

export function applyDefense(s, { won, attackerRating }) {
  const delta = Math.max(-s.rating, defenseDelta(s.rating, attackerRating, won));
  s.rating += delta;
  s.peak = Math.max(s.peak, s.rating);
  return { won, delta };
}

// The three choices stick until one is picked, so reopening the egg cannot reroll them.
// Each choice is drawn by rarity weight (rare 3 : epic 1); after EPIC_PITY offers without
// an epic, one choice is an epic for sure.
export function rollHatch(s, rand = Math.random) {
  if (!s.eggs) return null;
  if (!s.hatchOptions) {
    const pool = lockedIds(s);
    const weight = (id) => RARITIES[BY_ID[id].rarity].weight || 1;
    const pick = (list) => {
      let r = rand() * list.reduce((a, id) => a + weight(id), 0);
      return list.find((id) => (r -= weight(id)) < 0) ?? list[list.length - 1];
    };
    const options = [];
    const epics = pool.filter((id) => BY_ID[id].rarity === 'epic');
    if ((s.pity ?? 0) >= EPIC_PITY && epics.length) options.push(pick(epics));
    while (options.length < 3 && options.length < pool.length) options.push(pick(pool.filter((id) => !options.includes(id))));
    s.pity = options.some((id) => BY_ID[id].rarity === 'epic') ? 0 : (s.pity ?? 0) + 1;
    s.hatchOptions = options;
  }
  return s.hatchOptions;
}

export function hatch(s, id) {
  if (!s.eggs || !s.hatchOptions?.includes(id) || s.owned[id]) return false;
  s.owned[id] = { level: 1, xp: 0 };
  s.eggs--;
  s.hatchOptions = null;
  return true;
}
