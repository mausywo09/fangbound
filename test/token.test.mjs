import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DBC_PROGRAM, b58encode, findLaunch, createLaunchResolver } from '../server/launch.js';
import { createToken, xLink, poolShare } from '../server/token.js';
import { backupDaily } from '../server/backup.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const addr = () => b58encode(randomBytes(32));
const CREATOR = addr();
const SINCE = Date.parse('2026-10-30T00:00:00Z') / 1000;

// initialize_virtual_pool_with_spl_token data: discriminator, then Borsh name, symbol, uri.
function initData(name, symbol) {
  const str = (s) => {
    const b = Buffer.from(s);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(b.length);
    return Buffer.concat([len, b]);
  };
  return b58encode(Buffer.concat([Buffer.from([140, 85, 215, 176, 102, 54, 104, 79]), str(name), str(symbol), str('https://example.com/m.json')]));
}

// A jsonParsed launch transaction: creator and mint sign, the DBC init names them.
function launchTx({ symbol = 'FANG', creatorSigns = true, mint = addr(), pool = addr() } = {}) {
  return {
    meta: { err: null, innerInstructions: [] },
    transaction: {
      message: {
        accountKeys: [{ pubkey: CREATOR, signer: creatorSigns }, { pubkey: mint, signer: true }, { pubkey: pool, signer: false }],
        instructions: [{ programId: DBC_PROGRAM, accounts: [addr(), addr(), CREATOR, mint, addr(), pool], data: initData('Fangbound', symbol) }],
      },
    },
    mint,
    pool,
  };
}

// A fake RPC with the wallet history (newest first, like the real one) and transactions by signature.
function fakeRpc(history, txs) {
  return async (method, params) => {
    if (method === 'getSignaturesForAddress') return history;
    if (method === 'getTransaction') {
      const tx = txs[params[0]];
      if (tx === 'v1') throw Object.assign(new Error('Transaction version (1) is not supported'), { code: -32015 });
      return tx ?? null;
    }
    throw new Error(`unexpected ${method}`);
  };
}

test('the first FANG launch signed by the launch wallet wins', async () => {
  const test1 = launchTx({ symbol: 'TEST' });
  const real = launchTx();
  const later = launchTx();
  const history = [
    { signature: 'later', blockTime: SINCE + 900 },
    { signature: 'real', blockTime: SINCE + 600 },
    { signature: 'v1trade', blockTime: SINCE + 500 },
    { signature: 'test', blockTime: SINCE + 300 },
    { signature: 'transfer', blockTime: SINCE + 200 },
    { signature: 'before', blockTime: SINCE - 60 },
  ];
  const txs = { later, real, v1trade: 'v1', test: test1, transfer: { meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: CREATOR, signer: true }], instructions: [] } } }, before: launchTx() };
  const hit = await findLaunch(fakeRpc(history, txs), { creator: CREATOR, since: SINCE, symbol: 'FANG' });
  assert.equal(hit.mint, real.mint, 'skips the TEST token, the v1 trade and launches before FANG_SINCE');
  assert.equal(hit.pool, real.pool);
  assert.equal(hit.symbol, 'FANG');
  assert.equal(hit.signature, 'real');
});

test('a pool handed to the wallet without its signature is not the launch', async () => {
  const foreign = launchTx({ creatorSigns: false });
  const hit = await findLaunch(fakeRpc([{ signature: 'f', blockTime: SINCE + 10 }], { f: foreign }), { creator: CREATOR, since: SINCE, symbol: 'FANG' });
  assert.equal(hit, null);
});

test('without a launch wallet the token is not configured; before launch it says so', async () => {
  const none = createLaunchResolver({ rpc: fakeRpc([], {}), env: { FANG_CREATOR: '' } });
  assert.deepEqual(await none.get(), { status: 'not-configured' });
  const waiting = createLaunchResolver({ rpc: fakeRpc([], {}), env: { FANG_CREATOR: CREATOR } });
  assert.deepEqual(await waiting.get(), { status: 'not-launched' });
  const down = createLaunchResolver({ rpc: async () => { throw new Error('RPC 503'); }, env: { FANG_CREATOR: CREATOR } });
  assert.deepEqual(await down.get(), { status: 'unavailable' });
});

test('X links and the pool share are read leniently and checked', () => {
  for (const s of ['https://x.com/fangbound', 'x.com/fangbound', '@fangbound', 'fangbound', 'https://twitter.com/fangbound/']) assert.equal(xLink(s), 'https://x.com/fangbound', s);
  for (const s of ['', 'https://evil.com/fangbound', 'a b', 'https://x.com/way_too_long_handle_here']) assert.equal(xLink(s), null, s);
  assert.equal(poolShare('30'), 30);
  assert.equal(poolShare('25%'), 25);
  for (const s of ['', '0', '120', 'half']) assert.equal(poolShare(s), null, s);
});

test('the prize pool is the pool wallet balance, read through the RPC', async () => {
  const wallet = addr();
  let calls = 0;
  const fakeFetch = async (url, { body }) => {
    const { method, params } = JSON.parse(body);
    calls++;
    assert.equal(method, 'getBalance');
    assert.equal(params[0], wallet);
    return { status: 200, json: async () => ({ result: { context: { slot: 1 }, value: 1_234_567_890 } }) };
  };
  const token = createToken({ env: { FANG_CREATOR: '', FANG_POOL_WALLET: wallet, FANG_POOL_SHARE: '30', FANG_POOL_TOPUP: '0', FANG_X: '@fangbound' }, fetch: fakeFetch, log: () => {} });
  const t = await token.get();
  assert.equal(t.status, 'not-configured');
  assert.deepEqual(t.prize, { share: 30, topUp: false, wallet, sol: 1.234 });
  assert.deepEqual(t.links, { x: 'https://x.com/fangbound' });
  await token.get();
  assert.equal(calls, 1, 'the balance is cached');
});

test('GET /api/token answers what the token module says', async (t) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const db = openDb();
  const answer = { status: 'live', mint: addr(), prize: { share: 30, wallet: null, sol: null }, links: { x: null } };
  const app = createApp({ db, root, seasonStart: Date.parse('2026-10-26T00:00:00Z'), fang: { get: async () => answer } });
  const server = createServer(app.handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); db.close(); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/token`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), answer);
});

test('the daily backup writes one copy a day and keeps the newest seven', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fangbound-backup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openDb();
  t.after(() => db.close());
  db.exec("INSERT INTO players (state, season, rating, created, seen) VALUES ('{}', 1, 1000, 0, 0)");
  for (let d = 1; d <= 8; d++) writeFileSync(path.join(dir, `fangbound-2026-10-0${d}.db`), '');
  const now = () => Date.parse('2026-10-30T12:00:00Z');
  const file = backupDaily(db, dir, { now });
  assert.ok(file.endsWith('fangbound-2026-10-30.db'));
  assert.equal(backupDaily(db, dir, { now }), null, 'once a day');
  const kept = readdirSync(dir).sort();
  assert.equal(kept.length, 7);
  assert.equal(kept.at(-1), 'fangbound-2026-10-30.db');
  assert.equal(kept[0], 'fangbound-2026-10-03.db');
  const copy = openDb(file);
  assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM players').get().c, 1, 'the copy holds the data');
  copy.close();
});
