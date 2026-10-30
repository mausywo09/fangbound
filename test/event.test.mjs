import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { FIGHT_GAP_MS } from '../server/game.js';
import { simulate } from '../src/sim.js';
import { freshState, lockedIds } from '../src/state.js';
import { syncPass, syncDaily, TITLES } from '../src/pass.js';
import { makeOpponent } from '../src/match.js';
import { MONSTERS } from '../src/data.js';
import {
  EVENTS, activeEvent, syncEvent, trickOrTreat, buyPumpkin, applyEventMatch, raidSummary, applyRaid, claimGift,
  BOSS, BOSS_TEAM, EGG_COST, EVENT_QUESTS, GIFTS, CANDY,
} from '../src/event.js';

const HW = EVENTS.halloween;
const DAY = 864e5;
const player = (day = 1) => {
  const s = freshState(1);
  syncPass(s);
  syncDaily(s, day, () => 0.3);
  syncEvent(s, HW, day);
  return s;
};

test('the event runs by its dates, can be forced and can be switched off', () => {
  assert.equal(activeEvent(HW.start - 1), null);
  assert.equal(activeEvent(HW.start).id, 'halloween');
  assert.equal(activeEvent(HW.end), null);
  assert.equal(activeEvent(HW.start + DAY, 'off'), null);
  const forced = activeEvent(HW.end + 30 * DAY, 'halloween');
  assert.equal(forced.id, 'halloween');
  assert.ok(forced.end > HW.end + 30 * DAY, 'a forced event has time left');
});

test('a new event starts fresh, and raid tries reset each day', () => {
  const s = player(5);
  s.event.candy = 70;
  s.event.boss.tries = 3;
  syncEvent(s, HW, 5);
  assert.equal(s.event.candy, 70);
  assert.equal(s.event.boss.tries, 3);
  syncEvent(s, HW, 6);
  assert.equal(s.event.boss.tries, 0);
  assert.equal(s.event.candy, 70, 'candy carries over days');
  syncEvent(s, { id: 'other' }, 6);
  assert.equal(s.event.candy, 0);
});

test('trick-or-treat opens once a day and counts toward its quest', () => {
  const s = player(1);
  const r = trickOrTreat(s, 1, () => 0);
  assert.equal(r.kind, 'treat');
  assert.equal(s.event.candy, 40);
  assert.equal(trickOrTreat(s, 1, () => 0), false);
  for (let d = 2; d <= EVENT_QUESTS.treat.goal; d++) trickOrTreat(s, d, () => 0.999);
  assert.ok(s.event.done.includes('treat'));
  assert.ok(s.titles.includes('candyfiend'));
});

test('a pumpkin egg hatches Hollowjack first, then a training tome', () => {
  const s = player();
  assert.equal(buyPumpkin(s), false, 'needs candy');
  s.event.candy = EGG_COST * 2;
  const first = buyPumpkin(s);
  assert.equal(first.type, 'monster');
  assert.ok(s.owned.hollowjack);
  assert.ok(s.titles.includes('lanternbearer'));
  assert.equal(s.event.candy, EGG_COST + EVENT_QUESTS.lantern.candy);
  const second = buyPumpkin(s);
  assert.equal(second.type, 'tome');
  assert.ok(!lockedIds(s).includes('hollowjack'), 'normal eggs never hold event monsters');
});

test('ranked matches pay candy only on counted matches', () => {
  const s = player();
  assert.deepEqual(applyEventMatch(s, true, true).candy, CANDY.win);
  assert.deepEqual(applyEventMatch(s, false, true).candy, CANDY.loss);
  assert.deepEqual(applyEventMatch(s, true, false).candy, 0);
  assert.equal(s.event.q.hunt, 2);
});

test('a squad fights the Hollow King alone, and 3v3 battles are unchanged', () => {
  const a = { team: [{ id: 'cindertusk', level: 5 }, { id: 'joltcub', level: 5 }, { id: 'sproutling', level: 5 }] };
  const res = simulate({ seed: 42, a, b: BOSS_TEAM });
  assert.equal(res.start.filter((u) => u.side === 'b').length, 1);
  const sum = raidSummary(res);
  assert.ok(sum.damage > 1000, `the squad deals damage (${sum.damage})`);
  assert.equal(simulate({ seed: 42, a, b: BOSS_TEAM }).events.length, res.events.length, 'deterministic');
  const b = makeOpponent(1000, ['cindertusk', 'joltcub', 'sproutling'], 9);
  assert.ok(b.team.every((m) => !MONSTERS.find((x) => x.id === m.id).event), 'bots never field event monsters');
  const one = simulate({ seed: 7, a, b });
  const two = simulate({ seed: 7, a, b });
  assert.deepEqual(one.events, two.events);
});

test('raids pay candy for damage, three a day', () => {
  const s = player();
  const r = applyRaid(s, { damage: 10000, slain: false });
  assert.equal(r.candy, Math.min(BOSS.max, Math.floor(10000 / BOSS.per)));
  assert.equal(r.triesLeft, BOSS.tries - 1);
  const big = applyRaid(s, { damage: 95000, slain: true });
  assert.equal(big.candy, BOSS.max + BOSS.slain);
  assert.ok(s.event.done.includes('slay'), '100k total damage finishes the quest');
  assert.ok(s.titles.includes('hollowbane'));
  assert.ok(Object.hasOwn(TITLES, EVENT_QUESTS.slay.title));
});

test('community gifts need the total and one raid, and pay once', () => {
  const s = player();
  assert.equal(claimGift(s, 0, GIFTS[0].at), false, 'fight the king first');
  applyRaid(s, { damage: 500, slain: false });
  assert.equal(claimGift(s, 0, GIFTS[0].at - 1), false);
  const before = s.event.candy;
  assert.equal(claimGift(s, 0, GIFTS[0].at).type, 'candy');
  assert.equal(s.event.candy, before + GIFTS[0].reward.n);
  assert.equal(claimGift(s, 0, GIFTS[0].at), false);
  assert.equal(claimGift(s, 2, GIFTS[2].at).type, 'title');
  assert.ok(s.titles.includes('nightwarden'));
  assert.equal(claimGift(s, '__proto__', 1e9), false);
});

// ---- through the API ----

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH = Date.parse('2026-10-26T00:00:00Z');

async function start(t, eventSetting = 'auto', at = EPOCH + 36e5) {
  const clock = { now: at };
  const db = openDb();
  const app = createApp({ db, root, seasonStart: EPOCH, now: () => clock.now, eventSetting });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) cookie = c.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, data: type.startsWith('application/json') ? await res.json() : await res.text() };
  };
  return { call, clock, db };
}

test('pages carry the running event, and nothing when it is off', async (t) => {
  const on = await start(t);
  assert.match((await on.call('GET', '/play')).data, /<html lang="en" data-event="halloween">/);
  assert.match((await on.call('GET', '/')).data, /data-event="halloween"/);
  const off = await start(t, 'off');
  assert.doesNotMatch((await off.call('GET', '/play')).data, /data-event/);
  const me = (await off.call('POST', '/api/session')).data;
  assert.equal(me.event, null);
  assert.equal((await off.call('POST', '/api/event/treat')).status, 409);
});

test('trick-or-treat, a raid and a replay through the API', async (t) => {
  const env = await start(t);
  const me = (await env.call('POST', '/api/session')).data;
  assert.equal(me.event.id, 'halloween');
  assert.equal(me.player.event.candy, 0);

  const treat = await env.call('POST', '/api/event/treat');
  assert.equal(treat.status, 200);
  assert.equal((await env.call('POST', '/api/event/treat')).status, 409);

  const lineup = ['cindertusk', 'joltcub', 'sproutling'];
  const raid = await env.call('POST', '/api/event/raid', { lineup });
  assert.equal(raid.status, 200);
  assert.ok(raid.data.outcome.damage > 0);
  assert.equal(raid.data.me.event.total, raid.data.outcome.damage, 'damage adds to the community total');
  assert.equal(raid.data.me.player.event.boss.tries, 1);
  const replay = (await env.call('GET', `/api/match/${raid.data.match.id}`)).data;
  assert.equal(simulate(replay).winner, raid.data.match.winner, 'the replay plays the same raid');

  assert.equal((await env.call('POST', '/api/event/raid', { lineup })).status, 429, 'fight gap');
  for (let i = 0; i < BOSS.tries - 1; i++) {
    env.clock.now += FIGHT_GAP_MS;
    assert.equal((await env.call('POST', '/api/event/raid', { lineup })).status, 200);
  }
  env.clock.now += FIGHT_GAP_MS;
  assert.equal((await env.call('POST', '/api/event/raid', { lineup })).status, 409, 'three a day');

  const now = (await env.call('GET', '/api/me')).data;
  assert.equal(now.history.length, 0, 'raids are not ranked matches');
  assert.equal((await env.call('POST', '/api/event/egg')).status, now.player.event.candy >= EGG_COST ? 200 : 409);
});
