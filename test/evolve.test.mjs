import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnits, simulate, MAX_LEVEL, EVO_MULT } from '../src/sim.js';
import { freshState, applyResult, evolve, evolveBlock, EVOLVE_COST, addMonsterXp, xpToNext } from '../src/state.js';
import { monName, MONSTERS, EVO_TITLE, BY_ID } from '../src/data.js';

test('XP past Lv 10 turns into essence, from wins and when the cap is crossed', () => {
  const s = freshState(1);
  const [a, b] = s.lineup;
  s.owned[a] = { level: MAX_LEVEL, xp: 0 };
  s.owned[b] = { level: MAX_LEVEL - 1, xp: xpToNext(MAX_LEVEL - 1) - 1 };
  const out = applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  // a: all 3 XP past the cap; b: 1 XP to reach Lv 10, 2 past it.
  assert.equal(out.essence, 5);
  assert.equal(s.essence, 5);
  assert.deepEqual([s.owned[a], s.owned[b]], [{ level: MAX_LEVEL, xp: 0 }, { level: MAX_LEVEL, xp: 0 }]);
  assert.deepEqual(addMonsterXp({ level: 3, xp: 0 }, 2), { gain: 2, from: 3, to: 3, over: 0 });
});

test('evolving needs Lv 10 and the essence, costs it once and cannot repeat', () => {
  const s = freshState(1);
  const id = s.lineup[0];
  assert.match(evolveBlock(s, 'riptide'), /Hatch/);
  assert.match(evolveBlock(s, id), /Lv 10/);
  s.owned[id] = { level: MAX_LEVEL, xp: 0 };
  s.essence = EVOLVE_COST - 1;
  assert.match(evolveBlock(s, id), /essence/);
  assert.equal(evolve(s, id), false);
  s.essence = EVOLVE_COST + 4;
  assert.equal(evolve(s, id), true);
  assert.deepEqual([s.owned[id].evo, s.essence], [true, 4]);
  assert.match(evolveBlock(s, id), /Already/);
  assert.equal(evolve(s, id), false);
});

test('an evolved monster has more HP and ATK, and the battle reports it', () => {
  const team = (evo) => [{ id: 'cindertusk', level: 10, evo }, { id: 'joltcub', level: 10 }, { id: 'geowl', level: 10 }];
  const [plain] = buildUnits('a', team(false));
  const [evolved] = buildUnits('a', team(true));
  assert.ok(Math.abs(evolved.maxHp - plain.maxHp * EVO_MULT) <= 1, 'HP is rounded once, from the unrounded base');
  assert.ok(Math.abs(evolved.atk - plain.atk * EVO_MULT) < 1e-9);
  const res = simulate({ seed: 5, a: { team: team(true) }, b: { team: team(false) } });
  assert.deepEqual(res.start.map((u) => u.evo), [true, false, false, false, false, false]);
});

test('every element has an evolved title', () => {
  for (const m of MONSTERS) assert.equal(monName(m.id, true), `${EVO_TITLE[BY_ID[m.id].element]} ${m.name}`);
  assert.equal(monName('cindertusk'), 'Cindertusk');
});
