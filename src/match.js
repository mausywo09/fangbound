// Matchmaking against bots. Higher-rated bots line up smarter, counter your
// elements and bring higher levels, so the ladder gets harder as you climb.
import { MONSTERS, BY_ID, elementMult } from './data.js';
import { rng32, MAX_LEVEL } from './sim.js';

const NAMES = [
  'Kiko', 'Ravel', 'Mbak Sari', 'Dex', 'Nori', 'Ozzy', 'Tama', 'Juno', 'Bima', 'Lux', 'Pip', 'Wren',
  'Arka', 'Mochi', 'Zed', 'Indy', 'Kai', 'Rhea', 'Tobi', 'Vega', 'Yuki', 'Bayu', 'Sol', 'Fern',
];
const ROLE_ORDER = { guard: 0, striker: 1, mystic: 2 };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function randomTeam(rand, sensible) {
  const pool = MONSTERS.filter((m) => !m.event).map((m) => m.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const team = pool.slice(0, 3);
  if (sensible) team.sort((x, y) => ROLE_ORDER[BY_ID[x].role] - ROLE_ORDER[BY_ID[y].role]);
  return team;
}

function teamScore(team, vs) {
  const roles = team.map((id) => BY_ID[id].role);
  let score = 0;
  if (roles[0] === 'guard') score += 2;
  if (roles.includes('striker')) score += 1;
  if (new Set(roles).size === 3) score += 1;
  for (const id of team) {
    for (const v of vs) {
      const m = elementMult(BY_ID[id].element, BY_ID[v].element);
      if (m > 1) score += 0.6;
      else if (m < 1) score -= 0.6;
    }
  }
  return score;
}

export function makeOpponent(rating, playerLineup, seed) {
  const rand = rng32(seed ^ 0x9e3779b9);
  const oppRating = Math.max(0, Math.round(rating + rand() * 90 - 45));
  const skill = clamp((oppRating - 950) / 650, 0, 1);
  const tries = 1 + Math.round(skill * 11);
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const team = randomTeam(rand, rand() < 0.25 + skill * 0.75);
    const score = teamScore(team, playerLineup);
    if (score > bestScore) { best = team; bestScore = score; }
  }
  const level = 1 + (oppRating - 1000) / 80;
  return {
    name: NAMES[Math.floor(rand() * NAMES.length)],
    bot: true,
    rating: oppRating,
    team: best.map((id) => ({ id, level: clamp(Math.round(level + rand() * 2 - 1), 1, MAX_LEVEL) })),
  };
}
