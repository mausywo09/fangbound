import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { FIGHT_GAP_MS } from '../server/game.js';
import { simulate } from '../src/sim.js';
import { freshState, STARTERS } from '../src/state.js';
import { TRAINING, TUTORIAL_XP, TRAINING_SEED, TRAINING_TRIES, needsTutorial } from '../src/tutorial.js';

test('a brand-new player needs the tutorial; a player with games or a finished one does not', () => {
  const s = freshState();
  assert.equal(needsTutorial(s), true);
  assert.equal(needsTutorial({ ...s, wins: 1 }), false);
  assert.equal(needsTutorial({ ...s, tutorial: { done: 1, rewarded: false } }), false);
});

test('every starter lineup can win the training battle within the tries', () => {
  // All 120 ordered three-monster lineups of the starters (any front-to-back order the
  // player might set before the tutorial).
  const lineups = [];
  for (const a of STARTERS) for (const b of STARTERS) for (const c of STARTERS) if (new Set([a, b, c]).size === 3) lineups.push([a, b, c]);
  let lost = 0;
  for (const ids of lineups) {
    const a = { team: ids.map((id) => ({ id, level: 1 })) };
    let won = false;
    for (let k = 0; k < TRAINING_TRIES && !won; k++) won = simulate({ seed: TRAINING_SEED + k, a, b: TRAINING }).winner === 'a';
    if (!won) lost++;
  }
  assert.equal(lost, 0, `${lost} of ${lineups.length} lineups never win`);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH = Date.parse('2026-10-26T00:00:00Z');
async function start(t) {
  const clock = { now: EPOCH + 36e5 };
  const db = openDb();
  const app = createApp({ db, root, seasonStart: EPOCH, now: () => clock.now });
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

test('the training battle wins, pays once, and touches no rating or history', async (t) => {
  const env = await start(t);
  const me = (await env.call('POST', '/api/session')).data;
  assert.equal(me.player.tutorial, null);
  const xp0 = me.player.pass.xp;
  const first = (await env.call('POST', '/api/tutorial/fight', { lineup: me.player.lineup })).data;
  assert.equal(first.outcome.won, true);
  assert.equal(first.match.winner, 'a');
  assert.equal(simulate(first.match).winner, 'a', 'the browser replays the same battle');
  assert.equal(first.outcome.reward.pass.xp, TUTORIAL_XP);
  assert.equal(first.me.player.pass.xp, xp0 + TUTORIAL_XP);
  assert.equal(first.me.player.rating, me.player.rating);
  assert.equal(first.me.history.length, 0);
  assert.equal(first.me.player.tutorial.rewarded, true);
  assert.equal((await env.call('POST', '/api/tutorial/fight', { lineup: me.player.lineup })).status, 429, 'fight gap');
  env.clock.now += FIGHT_GAP_MS;
  const again = (await env.call('POST', '/api/tutorial/fight', { lineup: me.player.lineup })).data;
  assert.equal(again.outcome.reward, null, 'the reward is paid once');
  assert.equal((await env.call('POST', '/api/tutorial/fight', { lineup: ['hollowjack', 'joltcub', 'geowl'] })).status, 400);
});

test('skipping keeps the reward for a later training battle', async (t) => {
  const env = await start(t);
  const me = (await env.call('POST', '/api/session')).data;
  const skipped = (await env.call('POST', '/api/tutorial/skip')).data;
  assert.equal(skipped.player.tutorial.rewarded, false);
  const later = (await env.call('POST', '/api/tutorial/fight', { lineup: me.player.lineup })).data;
  assert.ok(later.outcome.reward);
});
