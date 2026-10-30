import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { encode } from '../server/base58.js';
import { FIGHT_GAP_MS, CHALLENGE_TTL } from '../server/game.js';
import { REF_XP } from '../src/pass.js';
import { newSignIn, signInMessage, SIGN_IN_TTL_MS } from '../src/signin.js';
import { simulate } from '../src/sim.js';
import { SEASON_MS, defenseDelta } from '../src/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH = Date.parse('2026-10-26T00:00:00Z');
const LINEUP = ['geowl', 'vinelash', 'shellguard'];

async function start(t) {
  const clock = { now: EPOCH + 36e5 };
  const db = openDb();
  const app = createApp({ db, root, seasonStart: EPOCH, now: () => clock.now });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, host: new URL(base).host, clock, db };
}

// A browser stand-in with its own cookie jar.
function client(env) {
  let cookie = '';
  async function call(method, url, body, headers = {}) {
    const res = await fetch(env.base + url, {
      method,
      headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, data: type.startsWith('application/json') ? await res.json() : await res.text() };
  }
  return { call, get cookie() { return cookie; } };
}

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = encode(publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
  return { address, sign: (message) => sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64') };
}

function signedIn(env, w, { host = env.host, at = env.clock.now } = {}) {
  const message = signInMessage(newSignIn(w.address, `http://${host}`, new Date(at)));
  return { message, signature: w.sign(message) };
}

const signIn = (c, env, w, opts) => c.call('POST', '/api/auth/sign-in', signedIn(env, w, opts));

async function playOne(c, env, lineup = LINEUP) {
  env.clock.now += FIGHT_GAP_MS;
  const { data } = await c.call('POST', '/api/match/find');
  const res = await c.call('POST', '/api/match/fight', { id: data.pending.id, lineup });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}

test('a visitor becomes a guest and keeps that session', async (t) => {
  const env = await start(t);
  const c = client(env);
  const first = await c.call('POST', '/api/session');
  assert.equal(first.status, 200);
  assert.equal(first.data.wallet, null);
  assert.equal(first.data.player.rating, 1000);
  assert.equal(first.data.season.n, 1);
  assert.match(c.cookie, /^cl_session=[\w-]{43}$/);
  await c.call('POST', '/api/profile', { name: '  Ayu \n ' });
  assert.equal((await c.call('GET', '/api/me')).data.player.name, 'Ayu');
  assert.equal((await client(env).call('GET', '/api/me')).status, 401);
});

test('the seed stays secret and the opponent stays fixed until the fight', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const { pending } = (await c.call('POST', '/api/match/find')).data;
  assert.equal(pending.seed, undefined);
  assert.equal(pending.opp.bot, true);
  assert.equal(pending.opp.team.length, 3);
  assert.deepEqual((await c.call('POST', '/api/match/find')).data.pending, pending);
  assert.deepEqual((await c.call('GET', '/api/me')).data.pending, pending);
  assert.equal((await c.call('GET', `/api/match/${pending.id}`)).status, 404);
});

test('the server decides the fight, applies it once and publishes the replay', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const { match, outcome, me } = await playOne(c, env);
  assert.equal(simulate(match).winner, match.winner);
  assert.equal(outcome.won, match.winner === 'a');
  assert.deepEqual(match.a.team.map((m) => m.id), LINEUP);
  assert.equal(me.player.rating, 1000 + outcome.delta);
  assert.deepEqual(me.player.lineup, LINEUP);
  assert.equal(me.pending, null);
  assert.deepEqual(me.history[0], { id: match.id, won: outcome.won, opp: match.b.name, oppRating: match.b.rating, bot: true, delta: outcome.delta });

  const again = await c.call('POST', '/api/match/fight', { id: match.id, lineup: LINEUP });
  assert.equal(again.status, 409);
  const pub = await client(env).call('GET', `/api/match/${match.id}`);
  assert.equal(pub.status, 200);
  assert.deepEqual([pub.data.seed, pub.data.a, pub.data.b, pub.data.winner], [match.seed, match.a, match.b, match.winner]);
});

test('fights refuse monsters you do not own, other players matches and spamming', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const { pending } = (await c.call('POST', '/api/match/find')).data;
  for (const lineup of [['riptide', 'geowl', 'vinelash'], ['geowl', 'geowl', 'vinelash'], ['geowl'], 'geowl', undefined]) {
    assert.equal((await c.call('POST', '/api/match/fight', { id: pending.id, lineup })).status, 400, JSON.stringify(lineup));
  }
  const other = client(env);
  await other.call('POST', '/api/session');
  assert.equal((await other.call('POST', '/api/match/fight', { id: pending.id, lineup: LINEUP })).status, 404);

  assert.equal((await c.call('POST', '/api/match/fight', { id: pending.id, lineup: LINEUP })).status, 200);
  const next = (await c.call('POST', '/api/match/find')).data.pending;
  assert.equal((await c.call('POST', '/api/match/fight', { id: next.id, lineup: LINEUP })).status, 429);
  env.clock.now += FIGHT_GAP_MS;
  assert.equal((await c.call('POST', '/api/match/fight', { id: next.id, lineup: LINEUP })).status, 200);
});

test('signing in ties the guest progress to the wallet, and another device gets it back', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  await playOne(c, env);
  const w = wallet();
  const proof = signedIn(env, w);
  const linked = await c.call('POST', '/api/auth/sign-in', proof);
  assert.equal(linked.status, 200, JSON.stringify(linked.data));
  assert.equal(linked.data.result, 'linked');
  assert.equal(linked.data.wallet, w.address);
  assert.equal(linked.data.player.wins + linked.data.player.losses, 1);

  const phone = client(env);
  await phone.call('POST', '/api/session');
  assert.equal((await phone.call('POST', '/api/auth/sign-in', proof)).status, 401, 'a used sign-in cannot be replayed');
  const back = await signIn(phone, env, w);
  assert.equal(back.data.result, 'switched');
  assert.equal(back.data.player.wins + back.data.player.losses, 1);
  assert.equal((await phone.call('GET', '/api/me')).data.wallet, w.address);

  await c.call('POST', '/api/auth/sign-out');
  assert.equal(c.cookie, '');
  assert.equal((await c.call('GET', '/api/me')).status, 401);
});

test('sign-in refuses forged, foreign and stale messages', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const w = wallet();
  const forged = signedIn(env, w);
  forged.signature = wallet().sign(forged.message);
  assert.equal((await c.call('POST', '/api/auth/sign-in', forged)).status, 401);
  assert.equal((await signIn(c, env, w, { host: 'evil.example' })).status, 401);
  assert.equal((await signIn(c, env, w, { at: env.clock.now - SIGN_IN_TTL_MS - 1 })).status, 401);
  const edited = signedIn(env, w);
  edited.message = edited.message.replace('costs nothing', 'costs 1 SOL');
  assert.equal((await c.call('POST', '/api/auth/sign-in', edited)).status, 400);
  assert.equal((await c.call('GET', '/api/me')).data.wallet, null);
});

test('only wallet players who fought this season are on the leaderboard', async (t) => {
  const env = await start(t);
  const guest = client(env);
  await guest.call('POST', '/api/session');
  await playOne(guest, env);
  const idle = client(env);
  await idle.call('POST', '/api/session');
  await signIn(idle, env, wallet());
  const ranked = client(env);
  await ranked.call('POST', '/api/session');
  const w = wallet();
  await signIn(ranked, env, w);
  await ranked.call('POST', '/api/profile', { name: 'Budi' });
  const { me } = await playOne(ranked, env);

  const board = (await ranked.call('GET', '/api/leaderboard')).data;
  assert.equal(board.players, 1);
  assert.deepEqual(board.rows, [{ rank: 1, name: 'Budi', title: null, wallet: w.address, rating: me.player.rating, you: true }]);
  assert.equal(board.you.rank, 1);
  assert.equal((await guest.call('GET', '/api/leaderboard')).data.you, null);
});

test('a new season freezes the final standings and soft-resets ratings', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const w = wallet();
  await signIn(c, env, w);
  const { me } = await playOne(c, env);
  const final = me.player.rating;
  await c.call('POST', '/api/match/find');

  env.clock.now += SEASON_MS;
  const board = (await client(env).call('GET', '/api/leaderboard')).data;
  assert.equal(board.season.n, 2);
  assert.deepEqual(board.last, { season: 1, rows: [{ rank: 1, wallet: w.address, name: 'Trainer', rating: final }] });
  assert.deepEqual(board.rows, []);
  const now = (await c.call('GET', '/api/me')).data;
  assert.equal(now.player.season, 2);
  assert.equal(now.player.rating, Math.round(1000 + (final - 1000) / 2));
  assert.equal(now.pending, null, 'a match found last season is dropped');
});

test('egg choices stick until one is hatched', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  assert.equal((await c.call('POST', '/api/egg/open')).status, 409);
  env.db.prepare("UPDATE players SET state = json_set(state, '$.eggs', 1)").run();
  const { options } = (await c.call('POST', '/api/egg/open')).data;
  assert.equal(options.length, 3);
  assert.deepEqual((await c.call('POST', '/api/egg/open')).data.options, options);
  assert.equal((await c.call('POST', '/api/egg/hatch', { id: 'cindertusk' })).status, 400);
  const me = (await c.call('POST', '/api/egg/hatch', { id: options[1] })).data;
  assert.deepEqual(me.player.owned[options[1]], { level: 1, xp: 0 });
  assert.equal(me.player.eggs, 0);
  assert.equal((await c.call('POST', '/api/egg/hatch', { id: options[0] })).status, 400);
});

test('cross-site writes and private files are refused', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  assert.equal((await c.call('POST', '/api/match/find', undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.call('POST', '/api/match/find', undefined, { 'content-type': 'text/plain' })).status, 200, 'an empty body needs no JSON type');
  const plain = await fetch(`${env.base}/api/profile`, { method: 'POST', headers: { cookie: c.cookie, 'content-type': 'text/plain' }, body: '{"name":"x"}' });
  assert.equal(plain.status, 415);

  const page = await c.call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.type, /^text\/html/);
  assert.equal((await c.call('GET', '/src/sim.js')).status, 200);
  assert.match((await c.call('GET', '/play')).data, /<title>Play/);
  assert.equal((await c.call('GET', '/src/three/kit.js')).status, 200);
  assert.equal((await c.call('GET', '/vendor/three/three.module.js')).status, 200);
  const img = await fetch(`${env.base}/media/mon/cindertusk.webp`);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  const part = await fetch(`${env.base}/media/hero-wide.mp4`, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206, 'video is served in ranges for Safari');
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.match(part.headers.get('content-range'), /^bytes 0-99\/\d+$/);
  for (const url of ['/server/app.js', '/data/fangbound.db', '/package.json', '/test/server.test.mjs', '/src/%2e%2e/server/app.js', '/tools/studio.html', '/node_modules/three/package.json', '/media/../server/app.js']) {
    assert.equal((await c.call('GET', url)).status, 404, url);
  }
});

async function rankedPlayer(env, name, lineup = LINEUP) {
  const c = client(env);
  await c.call('POST', '/api/session');
  const w = wallet();
  await signIn(c, env, w);
  await c.call('POST', '/api/profile', { name });
  const { me } = await playOne(c, env, lineup);
  return { c, w, me };
}

test('wallet players fight a real defense team near their rating, and the defender gets half', async (t) => {
  const env = await start(t);
  const def = await rankedPlayer(env, 'Dina', ['shellguard', 'vinelash', 'sproutling']);
  await def.c.call('POST', '/api/lineup', { lineup: ['geowl', 'joltcub', 'cindertusk'] });

  const a = client(env);
  await a.call('POST', '/api/session');
  await signIn(a, env, wallet());
  const { pending } = (await a.call('POST', '/api/match/find')).data;
  assert.equal(pending.opp.bot, undefined);
  assert.equal(pending.opp.name, 'Dina');
  assert.equal(pending.opp.wallet, def.w.address);
  assert.deepEqual(pending.opp.team, def.me.player.defense, 'the team from their last ranked match, not their edited lineup');
  assert.deepEqual(pending.opp.team.map((m) => m.id), ['shellguard', 'vinelash', 'sproutling']);

  const before = (await def.c.call('GET', '/api/me')).data.player.rating;
  env.clock.now += FIGHT_GAP_MS;
  const { match } = (await a.call('POST', '/api/match/fight', { id: pending.id, lineup: LINEUP })).data;
  const after = (await def.c.call('GET', '/api/me')).data;
  const d = after.defenses[0];
  assert.deepEqual([d.id, d.won, d.attacker, d.rating], [match.id, match.winner === 'b', 'Trainer', 1000]);
  assert.equal(d.delta, defenseDelta(before, 1000, d.won));
  assert.equal(after.player.rating, before + d.delta);

  env.clock.now += FIGHT_GAP_MS;
  assert.equal((await a.call('POST', '/api/match/find')).data.pending.opp.bot, true, 'a defender just fought is skipped for a while');

  const back = (await def.c.call('POST', '/api/session')).data;
  assert.deepEqual(back.away, { n: 1, delta: d.delta, duels: { n: 0, held: 0 }, refs: 0 });
  assert.equal((await def.c.call('POST', '/api/session')).data.away, null);
});

test('guests only meet bots, and players far from your rating are skipped', async (t) => {
  const env = await start(t);
  await rankedPlayer(env, 'Dina');
  const g = client(env);
  await g.call('POST', '/api/session');
  assert.equal((await g.call('POST', '/api/match/find')).data.pending.opp.bot, true);

  env.db.prepare("UPDATE players SET rating = 1400, state = json_set(state, '$.rating', 1400) WHERE wallet IS NOT NULL").run();
  const a = client(env);
  await a.call('POST', '/api/session');
  await signIn(a, env, wallet());
  assert.equal((await a.call('POST', '/api/match/find')).data.pending.opp.bot, true);
});

test('ranked matches move daily quests and the pass; check-ins, rerolls and claims pay once', async (t) => {
  const env = await start(t);
  const c = client(env);
  const me = (await c.call('POST', '/api/session')).data;
  assert.equal(me.player.daily.quests.length, 3);
  assert.equal(me.today.day, Math.floor(env.clock.now / 864e5));
  assert.equal(me.player.pass.xp, 0);

  const { outcome, me: after } = await playOne(c, env);
  assert.ok(outcome.progress.matchXp > 0);
  assert.equal(after.player.pass.xp, outcome.progress.total);
  assert.equal(after.player.daily.matches, 1);

  const ci = await c.call('POST', '/api/daily/checkin');
  assert.equal(ci.status, 200);
  assert.equal(ci.data.reward.streak, 1);
  assert.equal((await c.call('POST', '/api/daily/checkin')).status, 409);

  const open = ci.data.me.player.daily.quests.findIndex((q) => !q.done);
  if (open >= 0) {
    assert.equal((await c.call('POST', '/api/quest/reroll', { slot: '__proto__' })).status, 409);
    assert.equal((await c.call('POST', '/api/quest/reroll', { slot: open })).status, 200);
    assert.equal((await c.call('POST', '/api/quest/reroll', { slot: open })).status, 409);
  }

  assert.equal((await c.call('POST', '/api/pass/claim', { tier: 30, track: 'free' })).status, 409);
  assert.equal((await c.call('POST', '/api/title', { id: 'initiate' })).status, 400);
  // Seven days of check-ins reach the first tiers.
  let last;
  for (let d = 1; d < 7; d++) {
    env.clock.now += 864e5;
    last = (await c.call('POST', '/api/daily/checkin')).data;
  }
  assert.equal(last.reward.streak, 7);
  assert.notEqual(last.me.player.daily.day, me.player.daily.day, 'a new day brings new quests');
  const claim = await c.call('POST', '/api/pass/claim', { all: true });
  assert.equal(claim.status, 200);
  assert.ok(claim.data.rewards.length >= 1);
  assert.ok(claim.data.rewards.every((r) => r.track === 'free'), 'premium stays locked');
  assert.equal((await c.call('POST', '/api/pass/claim', { all: true })).status, 409);
});

test('a Lv 10 monster evolves for essence and fights evolved', async (t) => {
  const env = await start(t);
  const c = client(env);
  await c.call('POST', '/api/session');
  const evolveIt = () => c.call('POST', '/api/monster/evolve', { id: 'geowl' });
  assert.equal((await c.call('POST', '/api/monster/evolve', { id: 'riptide' })).status, 400);
  assert.equal((await evolveIt()).status, 409, 'not Lv 10 yet');
  env.db.prepare("UPDATE players SET state = json_set(state, '$.owned.geowl', json('{\"level\":10,\"xp\":0}'), '$.essence', 70)").run();
  const ok = await evolveIt();
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.player.owned.geowl.evo, ok.data.player.essence], [true, 10]);
  assert.equal((await evolveIt()).status, 409, 'only once');

  const { match, outcome } = await playOne(c, env);
  assert.deepEqual(match.a.team[0], { id: 'geowl', level: 10, evo: true });
  assert.equal(outcome.essence, outcome.won ? 3 : 1, 'the Lv 10 monster pays its XP as essence');
  const pub = (await client(env).call('GET', `/api/match/${match.id}`)).data;
  assert.equal(simulate(pub).start[0].evo, true);
});

test('a challenge link is a one-time friendly duel: no rating moves, and its owner sees the result', async (t) => {
  const env = await start(t);
  const a = client(env);
  await a.call('POST', '/api/session');
  await a.call('POST', '/api/profile', { name: 'Ayu' });
  const { challenge } = (await a.call('POST', '/api/challenge')).data;
  assert.match(challenge.id, /^[\w-]{8}$/);
  assert.equal((await a.call('POST', '/api/challenge')).data.challenge.id, challenge.id, 'the same squad reuses its link');
  assert.equal((await a.call('GET', `/api/challenge/${challenge.id}`)).data.mine, true);
  env.clock.now += FIGHT_GAP_MS;
  assert.equal((await a.call('POST', '/api/challenge/fight', { id: challenge.id, lineup: LINEUP })).status, 409, 'not your own');

  const b = client(env);
  await b.call('POST', '/api/session', { challenge: challenge.id });
  const view = (await b.call('GET', `/api/challenge/${challenge.id}`)).data;
  assert.deepEqual([view.from.name, view.from.team.length, view.mine, view.fought], ['Ayu', 3, false, null]);
  env.clock.now += FIGHT_GAP_MS;
  const res = await b.call('POST', '/api/challenge/fight', { id: challenge.id, lineup: LINEUP });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { match, outcome, me } = res.data;
  assert.equal(simulate(match).winner, match.winner);
  assert.equal(outcome.won, match.winner === 'a');
  assert.deepEqual([me.player.rating, me.player.wins + me.player.losses, me.history.length, me.player.pass.xp], [1000, 0, 0, 0], 'no rating, record, history or pass XP');
  env.clock.now += FIGHT_GAP_MS;
  assert.equal((await b.call('POST', '/api/challenge/fight', { id: challenge.id, lineup: LINEUP })).status, 409, 'once per friend');
  assert.equal((await b.call('GET', `/api/challenge/${challenge.id}`)).data.fought, match.id);
  assert.equal((await client(env).call('GET', `/api/match/${match.id}`)).status, 200, 'the replay is public');

  const back = (await a.call('POST', '/api/session')).data;
  assert.deepEqual([back.friends.log[0].id, back.friends.log[0].name, back.friends.log[0].held], [match.id, 'Trainer', match.winner === 'b']);
  assert.deepEqual(back.away.duels, { n: 1, held: match.winner === 'b' ? 1 : 0 });
  assert.deepEqual([back.player.rating, back.defenses.length, back.player.invites.joined], [1000, 0, 1], 'a duel is not a defense; the friend counts as invited');

  env.clock.now += CHALLENGE_TTL;
  const late = client(env);
  await late.call('POST', '/api/session');
  assert.equal((await late.call('POST', '/api/challenge/fight', { id: challenge.id, lineup: LINEUP })).status, 410);
  assert.equal((await late.call('GET', '/api/challenge/nope1234')).status, 404);
});

test('an invited friend who wins 3 ranked matches with a wallet pays both players, once', async (t) => {
  const env = await start(t);
  const a = client(env);
  const { code } = (await a.call('POST', '/api/session')).data.friends;
  assert.match(code, /^[\w-]{8}$/);
  const b = client(env);
  const first = (await b.call('POST', '/api/session', { ref: code })).data;
  assert.equal(first.invited.name, 'Trainer');
  assert.equal((await b.call('POST', '/api/session', { ref: code })).data.invited, null, 'only new players are invited');

  // Guest wins don't count, so sign in, and make the squad strong enough to win fast.
  await signIn(b, env, wallet());
  env.db.prepare(`UPDATE players SET state = json_set(state, '$.owned.geowl', json('{"level":10,"xp":0}'),
    '$.owned.vinelash', json('{"level":10,"xp":0}'), '$.owned.shellguard', json('{"level":10,"xp":0}')) WHERE wallet IS NOT NULL`).run();
  let paid = null;
  let me = null;
  for (let i = 0; i < 25 && !paid; i++) ({ outcome: { referral: paid = null }, me } = await playOne(b, env));
  assert.ok(paid, 'three wallet wins pay the invite');
  assert.deepEqual([paid.name, paid.rewards.length, me.player.ref.done], ['Trainer', 2, true]);
  assert.ok(me.player.pass.xp >= REF_XP);

  const inviter = (await a.call('POST', '/api/session')).data;
  assert.deepEqual([inviter.player.invites.joined, inviter.player.invites.paid, inviter.away.refs], [1, 1, 1]);
  assert.deepEqual([inviter.player.pass.xp, inviter.player.eggs], [REF_XP, 1]);
  assert.equal((await a.call('POST', '/api/session')).data.away, null, 'announced once');
  const again = await playOne(b, env);
  assert.equal(again.outcome.referral, undefined, 'paid once');
});
