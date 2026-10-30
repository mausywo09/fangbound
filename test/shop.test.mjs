import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { FIGHT_GAP_MS } from '../server/game.js';
import { MONSTERS, BY_ID } from '../src/data.js';
import { rng32 } from '../src/sim.js';
import { freshState, applyResult, rollHatch, hatch, lockedIds, STARTERS, WINS_PER_EGG, WIN_EGGS_PER_DAY, EPIC_PITY } from '../src/state.js';
import { syncPass, syncDaily, matchSummary, applyMatch, MATCH_XP } from '../src/pass.js';
import { SHOP_ITEMS, syncShop, buyBlock, applyItem, xpMult, ESSENCE_VIAL, TEST_BALANCE } from '../src/shop.js';
import { DAY_MS } from '../src/pass.js';

const player = (day = 1) => {
  const s = freshState(1);
  syncPass(s);
  syncDaily(s, day, () => 0.3);
  syncShop(s, day);
  return s;
};

test('every monster has a rarity: the starters are common, eggs hold rares and epics', () => {
  for (const m of MONSTERS) assert.ok(['common', 'rare', 'epic', 'event'].includes(m.rarity), m.id);
  for (const id of STARTERS) assert.equal(BY_ID[id].rarity, 'common');
  const s = player();
  assert.ok(lockedIds(s).every((id) => ['rare', 'epic'].includes(BY_ID[id].rarity)));
  assert.equal(lockedIds(s).filter((id) => BY_ID[id].rarity === 'epic').length, 3);
});

test('an egg offer holds an epic after the pity runs out', () => {
  const s = player();
  s.eggs = 1;
  s.pity = EPIC_PITY;
  const offer = rollHatch(s, rng32(5));
  assert.ok(offer.some((id) => BY_ID[id].rarity === 'epic'));
  assert.equal(s.pity, 0);
  // Without pity, epics show up in fewer offers than an even draw would give (about 43%
  // against 76%), and an offer without one counts the pity up.
  let withEpic = 0;
  for (let i = 0; i < 600; i++) {
    const t = player();
    t.eggs = 1;
    const o = rollHatch(t, rng32(1000 + i));
    const epic = o.some((id) => BY_ID[id].rarity === 'epic');
    if (epic) withEpic++;
    assert.equal(t.pity, epic ? 0 : 1);
    assert.equal(new Set(o).size, 3);
  }
  assert.ok(withEpic / 600 > 0.33 && withEpic / 600 < 0.53, `epic offers ${withEpic}/600`);
  const u = player();
  u.eggs = 1;
  assert.ok(hatch(u, rollHatch(u, rng32(3))[0]));
});

test('eggs from wins come every 3 wins, at most 3 a day', () => {
  const s = player();
  for (let i = 0; i < WINS_PER_EGG * (WIN_EGGS_PER_DAY + 1); i++) applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.equal(s.eggs, WIN_EGGS_PER_DAY);
  const r = applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.equal(r.egg, false);
  assert.equal(r.eggCapped, true);
  syncDaily(s, 2, () => 0.3);
  for (let i = 0; i < WINS_PER_EGG; i++) applyResult(s, { won: true, oppRating: 1000, team: s.lineup });
  assert.equal(s.eggs, WIN_EGGS_PER_DAY + 1, 'a new day opens the cap again');
});

test('XP x2 doubles monster XP and pass match XP, never battle numbers', () => {
  const s = player();
  const now = 1000;
  assert.equal(xpMult(s, now), 1);
  s.fang = 1000;
  assert.equal(buyBlock(s, 'xp2', { now, balance: s.fang }), null);
  applyItem(s, 'xp2', now);
  assert.equal(xpMult(s, now + 1), 2);
  assert.equal(xpMult(s, now + DAY_MS + 1), 1, 'it runs out after 24 h');
  const r = applyResult(s, { won: true, oppRating: 1000, team: s.lineup, xpMult: 2 });
  assert.equal(r.xp[0].gain, 6);
  const g = applyMatch(s, matchSummary({ start: [], events: [] }, s.lineup, true), { xpMult: 2 });
  assert.equal(g.matchXp, MATCH_XP.win * 2);
  assert.equal(buyBlock(s, 'xp2', { now: now + 5, balance: 1000 }), 'XP ×2 is already running.');
});

test('shop items: limits, balance, and only what still helps', () => {
  const s = player();
  const ctx = { now: 0, balance: 10000 };
  assert.match(buyBlock(s, 'nope', ctx), /not in the shop/);
  assert.match(buyBlock(s, '__proto__', ctx), /not in the shop/);
  assert.match(buyBlock(s, 'egg', { now: 0, balance: 10 }), /Not enough/);
  for (let i = 0; i < SHOP_ITEMS.egg.limit; i++) { assert.equal(buyBlock(s, 'egg', ctx), null); applyItem(s, 'egg', 0); }
  assert.match(buyBlock(s, 'egg', ctx), /Daily limit/);
  assert.match(buyBlock(s, 'reroll', ctx), /free quest swap/);
  s.daily.rerolled = true;
  assert.equal(buyBlock(s, 'reroll', ctx), null);
  applyItem(s, 'reroll', 0);
  assert.equal(s.daily.rerolled, false);
  assert.match(buyBlock(s, 'raid', ctx), /during an event/);
  const before = s.essence;
  applyItem(s, 'essence', 0);
  assert.equal(s.essence, before + ESSENCE_VIAL);
  assert.equal(buyBlock(s, 'premium', ctx), null);
  applyItem(s, 'premium', 0);
  assert.equal(s.pass.premium, true);
  assert.match(buyBlock(s, 'premium', ctx), /already unlocked/);
  // No eggs once every monster left has one waiting.
  const full = player();
  full.eggs = lockedIds(full).length;
  assert.match(buyBlock(full, 'egg', ctx), /every monster/);
});

// ---- through the API ----

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH = Date.parse('2026-10-26T00:00:00Z');
async function start(t, shopMode) {
  const clock = { now: EPOCH + 36e5 };
  const db = openDb();
  const app = createApp({ db, root, seasonStart: EPOCH, now: () => clock.now, shopMode });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) cookie = c.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  return { call, clock };
}

test('the shop stays closed until $FANG is live', async (t) => {
  const env = await start(t, 'off');
  const me = (await env.call('POST', '/api/session')).data;
  assert.deepEqual(me.shop, { mode: 'off', balance: 0 });
  assert.equal((await env.call('POST', '/api/shop/buy', { item: 'egg' })).status, 409);
});

test('test mode: a separate test balance pays for items, the XP booster speeds up a match', async (t) => {
  const env = await start(t, 'test');
  const me = (await env.call('POST', '/api/session')).data;
  assert.equal(me.shop.balance, TEST_BALANCE);
  assert.equal(me.player.fang, 0, 'real $FANG is untouched');
  const egg = await env.call('POST', '/api/shop/buy', { item: 'egg' });
  assert.equal(egg.status, 200);
  assert.equal(egg.data.me.player.eggs, 1);
  assert.equal(egg.data.me.shop.balance, TEST_BALANCE - SHOP_ITEMS.egg.price);
  assert.equal((await env.call('POST', '/api/shop/buy', { item: 'xp2' })).status, 200);
  const { data: found } = await env.call('POST', '/api/match/find');
  env.clock.now += FIGHT_GAP_MS;
  const fight = (await env.call('POST', '/api/match/fight', { id: found.pending.id, lineup: me.player.lineup })).data;
  assert.equal(fight.outcome.boost, 2);
  assert.equal(fight.outcome.xp[0].gain, fight.outcome.won ? 6 : 2);
  const premium = await env.call('POST', '/api/shop/buy', { item: 'premium' });
  assert.equal(premium.data.me.player.pass.premium, true);
  assert.equal((await env.call('POST', '/api/shop/buy', { item: 'premium' })).status, 409);
});
