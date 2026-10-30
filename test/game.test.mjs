import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, ELEMENTS, ELEMENT_ORDER, elementMult } from '../src/data.js';
import { simulate, rng32, TIME_LIMIT, DT, MAX_LEVEL } from '../src/sim.js';
import { freshState, applyResult, xpToNext, rollHatch, hatch, lockedIds, WINS_PER_EGG, seasonAt, syncSeason, SEASON_MS, validLineup, cleanName, defenseDelta, applyDefense } from '../src/state.js';
import { makeOpponent } from '../src/match.js';

const team = (...ids) => ids.map((id, i) => ({ id, level: i + 1 }));
const MATCH = {
  seed: 42,
  a: { name: 'Ayu', rating: 1010, team: team('cindertusk', 'joltcub', 'sproutling') },
  b: { name: 'Budi', rating: 990, team: team('shellguard', 'riptide', 'mistling') },
};

function randomMatch(rand) {
  const pick = () => {
    const ids = MONSTERS.map((m) => m.id).sort(() => rand() - 0.5).slice(0, 3);
    return ids.map((id) => ({ id, level: 1 + Math.floor(rand() * MAX_LEVEL) }));
  };
  return { seed: (rand() * 2 ** 32) >>> 0, a: { team: pick() }, b: { team: pick() } };
}

test('the same match replays identically', () => {
  assert.deepEqual(simulate(MATCH), simulate(MATCH));
});

test('a different seed changes the battle', () => {
  assert.notDeepEqual(simulate(MATCH).events, simulate({ ...MATCH, seed: 43 }).events);
});

test('every battle ends with a winner inside the time limit', () => {
  const rand = rng32(7);
  for (let i = 0; i < 300; i++) {
    const r = simulate(randomMatch(rand));
    assert.ok(r.winner === 'a' || r.winner === 'b');
    assert.ok(r.duration <= TIME_LIMIT + DT);
    assert.equal(r.events.at(-1).type, 'end');
    for (const e of r.events) if (e.s) assert.ok(e.s.hp >= 0 && e.s.mp >= 0 && e.s.mp <= 100);
  }
});

test('the element cycle: each beats exactly one and loses to exactly one', () => {
  assert.equal(ELEMENT_ORDER.length, Object.keys(ELEMENTS).length);
  for (const e of ELEMENT_ORDER) {
    const others = ELEMENT_ORDER.filter((x) => x !== e);
    assert.equal(others.filter((x) => elementMult(e, x) > 1).length, 1);
    assert.equal(others.filter((x) => elementMult(e, x) < 1).length, 1);
  }
});

test('every skill description renders its numbers', () => {
  for (const m of MONSTERS) {
    const text = m.skill.desc(m.skill.p);
    assert.doesNotMatch(text, /undefined|NaN/, m.id);
  }
});

test('a ranked win raises rating, grants XP and counts toward an egg', () => {
  const s = freshState(0);
  const out = applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.ok(out.delta >= 10);
  assert.equal(s.rating, 1000 + out.delta);
  assert.equal(s.wins, 1);
  assert.equal(s.eggWins, 1);
  for (const id of s.lineup) assert.equal(s.owned[id].xp, 3);
  const loss = applyResult(s, { won: false, oppRating: 1000, team: s.lineup });
  assert.ok(loss.delta <= -8);
  assert.equal(s.streak, 0);
});

test('levels cap at max and XP carries over', () => {
  const s = freshState(0);
  const id = s.lineup[0];
  s.owned[id] = { level: 1, xp: xpToNext(1) - 1 };
  applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.equal(s.owned[id].level, 2);
  assert.equal(s.owned[id].xp, 2);
  s.owned[id] = { level: MAX_LEVEL - 1, xp: xpToNext(MAX_LEVEL - 1) - 1 };
  applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.deepEqual(s.owned[id], { level: MAX_LEVEL, xp: 0 });
});

test('eggs hatch one of the offered monsters and the offer cannot be rerolled', () => {
  const s = freshState(0);
  for (let i = 0; i < WINS_PER_EGG; i++) applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.equal(s.eggs, 1);
  const first = rollHatch(s, rng32(1));
  assert.equal(first.length, 3);
  assert.deepEqual(rollHatch(s, rng32(2)), first);
  assert.equal(hatch(s, 'cindertusk'), false);
  const before = lockedIds(s).length;
  assert.equal(hatch(s, first[1]), true);
  assert.equal(lockedIds(s).length, before - 1);
  assert.equal(s.eggs, 0);
});

test('seasons run back to back and a missed season soft-resets rating', () => {
  assert.deepEqual(seasonAt(1000, 0), { n: 1, start: 0, end: SEASON_MS });
  assert.equal(seasonAt(SEASON_MS, 0).n, 2);
  assert.equal(seasonAt(-5, 0).n, 1);
  const s = freshState(1);
  s.rating = 1400;
  s.seasonGames = 9;
  assert.equal(syncSeason(s, 1), false);
  assert.equal(syncSeason(s, 2), true);
  assert.deepEqual([s.season, s.rating, s.peak, s.seasonGames], [2, 1200, 1200, 0]);
  syncSeason(s, 4);
  assert.equal(s.rating, 1050);
});

test('lineups must be three different owned monsters, and names are cleaned', () => {
  const s = freshState();
  assert.ok(validLineup(s, ['geowl', 'vinelash', 'shellguard']));
  for (const bad of [['geowl', 'geowl', 'vinelash'], ['riptide', 'geowl', 'vinelash'], ['geowl'], 'geowl', null, ['geowl', 'vinelash', 'constructor']]) {
    assert.equal(validLineup(s, bad), false, JSON.stringify(bad));
  }
  assert.equal(cleanName('  Sari \n  the   Great  '), 'Sari the Great');
  assert.equal(cleanName(''), 'Trainer');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
});

test('opponents are deterministic per seed and stronger higher up', () => {
  const lineup = ['cindertusk', 'joltcub', 'sproutling'];
  assert.deepEqual(makeOpponent(1000, lineup, 5), makeOpponent(1000, lineup, 5));
  const avgLevel = (rating) => {
    let sum = 0;
    for (let seed = 0; seed < 50; seed++) sum += makeOpponent(rating, lineup, seed).team.reduce((x, m) => x + m.level, 0) / 3;
    return sum / 50;
  };
  assert.ok(avgLevel(1600) > avgLevel(1000) + 4);
});

test('a defense is worth half an attack and never takes rating below zero', () => {
  assert.equal(defenseDelta(1000, 1000, true), 9);
  assert.equal(defenseDelta(1000, 1000, false), -9);
  assert.ok(defenseDelta(1000, 1300, true) > 9, 'holding off a stronger attacker pays more');
  const s = freshState();
  s.rating = 4;
  assert.deepEqual(applyDefense(s, { won: false, attackerRating: 4 }), { won: false, delta: -4 });
  assert.equal(s.rating, 0);
});
