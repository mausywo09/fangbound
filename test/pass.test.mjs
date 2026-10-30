import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, rng32 } from '../src/sim.js';
import { freshState, lockedIds, xpToNext } from '../src/state.js';
import { MONSTERS } from '../src/data.js';
import {
  QUESTS, rollQuests, syncDaily, rerollQuest, matchSummary, applyMatch, DAILY_BONUS, MATCH_XP, MATCH_XP_DAILY,
  syncPass, passTier, TIER_XP, PASS_TIERS, claimTier, claimable, tierReward, checkIn, canCheckIn, CHECKIN,
} from '../src/pass.js';

const DAY = 20_400;
function player(season = 1) {
  const s = freshState(season);
  syncPass(s);
  syncDaily(s, DAY, rng32(1));
  return s;
}
const summary = (over = {}) => ({ won: true, lineup: ['cindertusk', 'joltcub', 'sproutling'], advantage: 0, crit: 0, skill: 0, ko: 0, lost: 0, ...over });

test('each day brings three different quests, the first one play or win', () => {
  const rand = rng32(3);
  for (let i = 0; i < 200; i++) {
    const qs = rollQuests(rand);
    assert.equal(qs.length, 3);
    assert.equal(new Set(qs.map((q) => q.type)).size, 3);
    assert.ok(qs[0].type === 'play' || qs[0].type === 'win');
    for (const q of qs) assert.equal(q.p !== null, !!QUESTS[q.type].params);
  }
  const s = player();
  const today = JSON.stringify(s.daily);
  assert.equal(syncDaily(s, DAY, rng32(99)), false);
  assert.equal(JSON.stringify(s.daily), today);
  assert.equal(syncDaily(s, DAY + 1, rng32(99)), true);
  assert.equal(s.daily.day, DAY + 1);
});

test('matches move quests, finished quests pay once and all three add the daily bonus', () => {
  const s = player();
  s.daily.quests = [{ type: 'play', p: null, n: 0, done: false }, { type: 'crit', p: null, n: 0, done: false }, { type: 'element', p: 'volt', n: 0, done: false }];
  let out = applyMatch(s, summary({ won: false, crit: 4 }));
  assert.deepEqual(out.quests, []);
  assert.equal(out.xp, MATCH_XP.loss);
  out = applyMatch(s, summary({ crit: 5 }));
  assert.deepEqual(out.quests.map((q) => q.xp).sort(), [QUESTS.crit.xp, QUESTS.element.xp].sort());
  assert.equal(s.daily.quests[1].n, QUESTS.crit.goal);
  out = applyMatch(s, summary());
  assert.equal(out.bonus, true);
  assert.equal(out.xp, MATCH_XP.win + QUESTS.play.xp + DAILY_BONUS);
  out = applyMatch(s, summary());
  assert.equal(out.bonus, false);
  assert.equal(out.xp, MATCH_XP.win);
});

test('only the first matches of a day give pass XP', () => {
  const s = player();
  s.daily.quests.forEach((q) => { q.done = true; });
  s.daily.bonus = true;
  for (let i = 0; i < MATCH_XP_DAILY; i++) applyMatch(s, summary());
  assert.equal(s.pass.xp, MATCH_XP_DAILY * MATCH_XP.win);
  assert.equal(applyMatch(s, summary()).xp, 0);
  syncDaily(s, DAY + 1, rng32(2));
  assert.equal(applyMatch(s, summary({ won: false })).matchXp, MATCH_XP.loss);
});

test('one unfinished quest can be rerolled once a day, to a type not on the list', () => {
  const s = player();
  s.daily.quests[0].done = true;
  assert.equal(rerollQuest(s, 0, rng32(5)), false);
  const before = s.daily.quests.map((q) => q.type);
  assert.equal(rerollQuest(s, 1, rng32(5)), true);
  assert.ok(!before.includes(s.daily.quests[1].type));
  assert.equal(rerollQuest(s, 2, rng32(5)), false);
  assert.equal(rerollQuest(s, 7, rng32(5)), false);
});

test('a match summary counts your hits, skills and knockouts from the simulation', () => {
  const lineup = ['cindertusk', 'joltcub', 'sproutling'];
  const match = { seed: 9, a: { team: lineup.map((id) => ({ id, level: 5 })) }, b: { team: ['shellguard', 'vinelash', 'geowl'].map((id) => ({ id, level: 1 })) } };
  const res = simulate(match);
  const m = matchSummary(res, lineup, res.winner === 'a');
  const mine = new Set(res.start.filter((u) => u.side === 'a').map((u) => u.uid));
  const deaths = res.events.filter((e) => e.type === 'death');
  assert.equal(m.ko + m.lost, deaths.length);
  assert.equal(m.lost, deaths.filter((e) => mine.has(e.tgt)).length);
  assert.equal(m.skill, res.events.filter((e) => e.type === 'cast' && mine.has(e.src)).length);
  assert.ok(m.advantage > 0, 'ember and volt hit bloom and tide here');
  if (m.won) assert.equal(m.ko, 3);
});

test('check-ins build a 7-day streak, reset after a missed day and pay once a day', () => {
  const s = player();
  const xp = [];
  for (let d = 0; d < 8; d++) xp.push(checkIn(s, DAY + d).xp);
  assert.deepEqual(xp, [...CHECKIN, CHECKIN[0]]);
  assert.equal(canCheckIn(s, DAY + 7), false);
  assert.equal(checkIn(s, DAY + 7), false);
  assert.equal(checkIn(s, DAY + 9).streak, 1);
});

test('pass tiers are claimed once, in reach only, and premium stays locked', () => {
  const s = player();
  assert.equal(claimTier(s, 1, 'free'), false);
  s.pass.xp = TIER_XP * 5 + 10;
  assert.equal(passTier(s.pass.xp), 5);
  assert.deepEqual(claimable(s).map((c) => c.tier), [1, 2, 3, 4, 5]);
  assert.equal(claimTier(s, 6, 'free'), false);
  assert.equal(claimTier(s, 1, 'premium'), false);
  // Total XP a monster has gathered, counting the levels it went through.
  const total = (o) => o.xp + Array.from({ length: o.level - 1 }, (_, i) => xpToNext(i + 1)).reduce((a, b) => a + b, 0);
  const before = s.lineup.map((id) => total(s.owned[id]));
  const tome = claimTier(s, 1, 'free');
  assert.equal(tome.type, 'tome');
  assert.deepEqual(s.lineup.map((id) => total(s.owned[id])), before.map((x) => x + tome.xp), 'XP went to the squad');
  assert.equal(tome.squad.length, 3);
  assert.equal(claimTier(s, 1, 'free'), false);
  const eggs = s.eggs;
  assert.equal(claimTier(s, 4, 'free').type, 'egg');
  assert.equal(s.eggs, eggs + 1);
  const title = claimTier(s, 5, 'free');
  assert.deepEqual([title.type, s.title, s.titles], ['title', 'initiate', ['initiate']]);
  s.pass.premium = true;
  assert.equal(claimTier(s, 5, 'premium').type, 'egg');
  s.pass.xp = TIER_XP * 99;
  assert.equal(passTier(s.pass.xp), PASS_TIERS);
});

test('an egg with nothing left to hatch becomes a tome', () => {
  const s = player();
  for (const m of MONSTERS) s.owned[m.id] ??= { level: 1, xp: 0 };
  assert.equal(lockedIds(s).length, 0);
  s.pass.xp = TIER_XP * 4;
  const r = claimTier(s, 4, 'free');
  assert.deepEqual([r.type, r.fromEgg, s.eggs], ['tome', true, 0]);
});

test('every tier has a reward on both tracks, and a new season starts a new pass', () => {
  for (let t = 1; t <= PASS_TIERS; t++) for (const track of ['free', 'premium']) assert.ok(['tome', 'egg', 'title'].includes(tierReward(t, track).type));
  const s = player();
  s.pass.xp = 5000;
  s.titles = ['seeker'];
  assert.equal(syncPass(s), false);
  s.season = 2;
  assert.equal(syncPass(s), true);
  assert.deepEqual([s.pass.season, s.pass.xp, s.titles], [2, 0, ['seeker']]);
});
