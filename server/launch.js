// $FANG on-chain: finds the launch and reads its Meteora DBC facts, so fangbound.com shows
// the contract address, the curve and the tokenomics by itself right after launch. No SDK:
// raw account bytes at offsets checked against the SDK decoder on mainnet (ported from the
// $UCC and $CTAP sites, where it found both launches within seconds).
//
// Detection rule: the first Meteora DBC pool-creation transaction SIGNED by the launch
// wallet (FANG_CREATOR) after FANG_SINCE whose symbol is FANG_SYMBOL. It reads the wallet's
// own history, not the pools' `creator` field, because `transfer_pool_creator` lets anyone
// hand a pool to any wallet without its signature. FANG_MINT pins a mint by hand and wins.

export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
// The launch wallet (fresh, no transactions on 2026-10-30); FANG_CREATOR overrides.
export const DEFAULT_CREATOR = '9m9kk38sboC6mFpjutmeMwBr62HB725or5J7gJTG5PSL';
export const DEFAULT_SINCE = '2026-10-30T00:00:00Z';
export const DEFAULT_SYMBOL = 'FANG';
// How often, at most, the chain is asked for the launch before it is found.
const CHECK_MS = 8_000;

// Anchor discriminators of initialize_virtual_pool_with_spl_token / _with_token2022.
const INIT = [
  [140, 85, 215, 176, 102, 54, 104, 79],
  [169, 118, 51, 78, 145, 110, 220, 155],
];
// Account order of both initialize instructions: config, pool_authority, creator, base_mint, quote_mint, pool, …
const IX_CREATOR = 2;
const IX_MINT = 3;
const IX_POOL = 5;
// Newest transaction version requested (legacy, v0, v1). Trading terminals send v1, and with 0
// the RPC refuses every one of those with -32015 ("Transaction version (1) is not supported").
const MAX_TX_VERSION = 1;
const UNSUPPORTED_TX_VERSION = -32015;

const POOL_SIZE = 424;
const POOL = { config: 72, baseMint: 136, quoteReserve: 240, isMigrated: 305 };
const CFG = {
  quoteMint: 8, cliffFee: 104, secondFactor: 112, thirdFactor: 120, firstFactor: 128, baseFeeMode: 130,
  partnerVesting: 185, creatorVesting: 201, migrationOption: 233, activationType: 234, tokenDecimal: 235,
  partnerLocked: 239, partnerLp: 240, creatorLocked: 241, creatorLp: 242, migrationFeeOption: 243,
  swapBase: 256, quoteThreshold: 264, baseThreshold: 272, vestPerPeriod: 296, vestPeriods: 320, vestCliff: 328,
  migratedPoolFeeBps: 362,
};
const QUOTES = {
  So11111111111111111111111111111111111111112: { symbol: 'SOL', decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', decimals: 6 },
};
// DAMM pool fee tiers by migration_fee_option; 6 = custom (migrated_pool_fee_bps).
const MIGRATION_FEES = [0.25, 0.3, 1, 2, 4, 6];

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  if (typeof s !== 'string' || !s || s.length > 2000) return null;
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const out = [];
  for (; n > 0n; n >>= 8n) out.unshift(Number(n & 255n));
  for (const c of s) {
    if (c !== '1') break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}
export function b58encode(b) {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of b) {
    if (x !== 0) break;
    s = '1' + s;
  }
  return s;
}
export const isAddress = (s) => typeof s === 'string' && s.length >= 32 && s.length <= 44 && b58decode(s)?.length === 32;

// JSON-RPC over fetch, trying each endpoint in turn on 429 / 5xx / network errors.
export function jsonRpc(urls, doFetch = fetch) {
  return async (method, params) => {
    let last = null;
    for (const url of urls) {
      try {
        const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
        if (res.status === 429 || res.status >= 500) {
          last = new Error(`RPC ${res.status}`);
          continue;
        }
        const json = await res.json();
        if (json.error) throw Object.assign(new Error(json.error.message || 'RPC error'), { code: json.error.code });
        return json.result;
      } catch (e) {
        if (e instanceof Error && !/^RPC \d|fetch|network|abort|timeout/i.test(e.message)) throw e;
        last = e;
      }
    }
    throw last instanceof Error ? last : new Error('No RPC endpoint answered');
  };
}

// Name and symbol from the initialize instruction's params (Borsh strings name, symbol, uri
// after the discriminator).
export function poolParams(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = [];
  let at = 8;
  for (let i = 0; i < 2; i++) {
    if (at + 4 > data.length) return null;
    const len = v.getUint32(at, true);
    if (len > 200 || at + 4 + len > data.length) return null;
    out.push(new TextDecoder().decode(data.subarray(at + 4, at + 4 + len)));
    at += 4 + len;
  }
  return { name: out[0], symbol: out[1] };
}
const normSymbol = (s) => s.trim().replace(/^\$/, '').toUpperCase();

function launchIn(tx, creator, symbol = '') {
  const msg = tx?.transaction?.message;
  if (!msg || tx.meta?.err) return null;
  const signers = (msg.accountKeys ?? []).filter((k) => k?.signer).map((k) => k.pubkey);
  if (!signers.includes(creator)) return null;
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions ?? []);
  for (const ix of [...(msg.instructions ?? []), ...inner]) {
    if (ix?.programId !== DBC_PROGRAM || !Array.isArray(ix.accounts) || typeof ix.data !== 'string') continue;
    const data = b58decode(ix.data);
    if (!data || !INIT.some((d) => d.every((b, i) => data[i] === b))) continue;
    const [mint, pool] = [ix.accounts[IX_MINT], ix.accounts[IX_POOL]];
    if (ix.accounts[IX_CREATOR] !== creator || !signers.includes(mint) || !isAddress(mint) || !isAddress(pool)) continue;
    const params = poolParams(data);
    if (symbol && (!params || normSymbol(params.symbol) !== normSymbol(symbol))) continue;
    return { mint, pool, ...(params ?? {}) };
  }
  return null;
}

// A transaction in a version newer than MAX_TX_VERSION counts as unreadable, so it never stops the scan.
function unsupportedAsNull(e) {
  if (e?.code === UNSUPPORTED_TX_VERSION) return null;
  throw e;
}

// The first DBC launch signed by `creator` at or after `since` (unix seconds) with `symbol`
// (if given), or null.
export async function findLaunch(rpc, { creator, since, symbol = '', maxPages = 5, maxTx = 40 }) {
  const candidates = [];
  let before;
  for (let page = 0; page < maxPages; page++) {
    const sigs = (await rpc('getSignaturesForAddress', [creator, { limit: 1000, before, commitment: 'confirmed' }])) ?? [];
    for (const s of sigs) if (!s.err && (s.blockTime ?? 0) >= since) candidates.push({ signature: s.signature, blockTime: s.blockTime ?? 0 });
    const last = sigs[sigs.length - 1];
    if (sigs.length < 1000 || !last || (last.blockTime ?? 0) < since) break;
    before = last.signature;
  }
  candidates.sort((a, b) => a.blockTime - b.blockTime); // oldest first: the first launch wins
  for (const c of candidates.slice(0, maxTx)) {
    const tx = await rpc('getTransaction', [c.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' }]).catch(unsupportedAsNull);
    const hit = launchIn(tx, creator, symbol);
    if (hit) return { ...hit, signature: c.signature, blockTime: c.blockTime };
  }
  return null;
}

async function readAccount(rpc, address) {
  const r = await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  const b64 = r?.value?.data?.[0];
  return typeof b64 === 'string' ? new Uint8Array(Buffer.from(b64, 'base64')) : null;
}

// The DBC pool of a mint (for a pinned FANG_MINT).
async function findPoolByMint(rpc, mint) {
  const r = await rpc('getProgramAccounts', [DBC_PROGRAM, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, filters: [{ dataSize: POOL_SIZE }, { memcmp: { offset: POOL.baseMint, bytes: mint } }] }]);
  return Array.isArray(r) && r[0]?.pubkey ? String(r[0].pubkey) : null;
}

const reader = (b) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    u8: (at) => b[at],
    u16: (at) => v.getUint16(at, true),
    u64: (at) => v.getBigUint64(at, true),
    key: (at) => b58encode(b.subarray(at, at + 32)),
  };
};

export function decodePool(b) {
  const r = reader(b);
  return { config: r.key(POOL.config), baseMint: r.key(POOL.baseMint), quoteReserve: r.u64(POOL.quoteReserve), migrated: r.u8(POOL.isMigrated) === 1 };
}

export function decodeConfig(b) {
  const r = reader(b);
  return {
    quoteMint: r.key(CFG.quoteMint),
    cliffFee: r.u64(CFG.cliffFee), firstFactor: r.u16(CFG.firstFactor), secondFactor: r.u64(CFG.secondFactor), thirdFactor: r.u64(CFG.thirdFactor), baseFeeMode: r.u8(CFG.baseFeeMode),
    migrationOption: r.u8(CFG.migrationOption), activationType: r.u8(CFG.activationType), tokenDecimal: r.u8(CFG.tokenDecimal),
    partnerLocked: r.u8(CFG.partnerLocked), partnerLp: r.u8(CFG.partnerLp), creatorLocked: r.u8(CFG.creatorLocked), creatorLp: r.u8(CFG.creatorLp),
    partnerVesting: r.u8(CFG.partnerVesting), creatorVesting: r.u8(CFG.creatorVesting),
    migrationFeeOption: r.u8(CFG.migrationFeeOption), migratedPoolFeeBps: r.u16(CFG.migratedPoolFeeBps),
    swapBase: r.u64(CFG.swapBase), quoteThreshold: r.u64(CFG.quoteThreshold), baseThreshold: r.u64(CFG.baseThreshold),
    vestPerPeriod: r.u64(CFG.vestPerPeriod), vestPeriods: r.u64(CFG.vestPeriods), vestCliff: r.u64(CFG.vestCliff),
  };
}

const pct = (n) => Math.round(n * 10) / 10;
const trim = (n) => String(Math.round(n * 100) / 100);

export function feeText(c) {
  const start = (Number(c.cliffFee) / 1e9) * 100;
  if (c.baseFeeMode === 0 || c.baseFeeMode === 1) {
    const n = c.firstFactor, every = Number(c.secondFactor), cut = Number(c.thirdFactor);
    if (n > 0 && cut > 0) {
      const end = c.baseFeeMode === 0 ? ((Number(c.cliffFee) - n * cut) / 1e9) * 100 : start * Math.pow(1 - cut / 10_000, n);
      const span = n * every;
      const time = c.activationType === 1 ? (span >= 120 ? `${trim(span / 60)} min` : `${span} s`) : `${span} slots`;
      return `${trim(start)}% → ${trim(Math.max(0, end))}% over ${time}, then ${trim(Math.max(0, end))}%`;
    }
    return `${trim(start)}%`;
  }
  return `${trim(start)}% base, higher on big buys at launch`;
}

// Human facts for the site, from the pool config and the mint account.
export function describe(c, m) {
  const total = Number(m.supply) || 1;
  const curve = (Number(c.swapBase) / total) * 100;
  const lp = (Number(c.baseThreshold) / total) * 100;
  const vest = (Number(c.vestPerPeriod * c.vestPeriods + c.vestCliff) / total) * 100;
  const left = 100 - curve - lp - vest;
  const quote = QUOTES[c.quoteMint] ?? { symbol: 'quote', decimals: 9 };
  const locked = c.partnerLocked + c.creatorLocked;
  const vesting = c.partnerVesting + c.creatorVesting;
  const free = Math.max(0, 100 - locked - vesting);
  const poolFee = c.migrationFeeOption === 6 ? c.migratedPoolFeeBps / 100 : MIGRATION_FEES[c.migrationFeeOption];
  const allocation = [{ key: 'curve', label: 'Bonding curve', percent: pct(curve) }, { key: 'lp', label: 'Graduation liquidity', percent: pct(lp) }];
  if (vest > 0.05) allocation.push({ key: 'vesting', label: 'Locked vesting', percent: pct(vest) });
  if (left > 0.05) allocation.push({ key: 'leftover', label: 'Leftover (released at graduation)', percent: pct(left) });
  return {
    supply: (Number(m.supply) / 10 ** m.decimals).toString(),
    decimals: m.decimals,
    quoteSymbol: quote.symbol,
    curvePercent: pct(curve),
    lpPercent: pct(lp),
    allocation,
    migrationThreshold: Number(c.quoteThreshold) / 10 ** quote.decimals,
    migratesTo: (c.migrationOption === 1 ? 'Meteora DAMM v2' : 'Meteora DAMM v1') + (poolFee !== undefined ? ` (${trim(poolFee)}% pool fee)` : ''),
    lpLock: [`${locked}% permanently locked`, vesting ? `${vesting}% vesting` : '', free ? `${free}% unlocked` : ''].filter(Boolean).join(', '),
    tradingFee: feeText(c),
    mintAuthority: m.mintAuthority ? 'Active' : 'Revoked',
    freezeAuthority: m.freezeAuthority ? 'Active' : 'Revoked',
  };
}

// What the launch part of /api/token answers. Before launch the chain is asked at most every
// CHECK_MS (shared by every visitor, one cheap getSignaturesForAddress call); a found launch is
// kept for good. Facts are read once (the mint again every 10 min), the curve at most every
// 10 s, shared by every visitor.
export function createLaunchResolver({ rpc, env, now = Date.now, log = () => {} }) {
  const pinned = (env.FANG_MINT ?? '').trim();
  const creator = (env.FANG_CREATOR ?? DEFAULT_CREATOR).trim();
  const sinceMs = Date.parse(env.FANG_SINCE ?? DEFAULT_SINCE);
  const since = Number.isFinite(sinceMs) ? Math.floor(sinceMs / 1000) : 0;
  const symbol = normSymbol(env.FANG_SYMBOL ?? DEFAULT_SYMBOL);
  let launch = null;
  let launchCheckedAt = -Infinity;
  let reason = 'not-launched';
  let config = null;
  let configKey = '';
  let facts = null;
  let factsAt = -Infinity;
  let curve = null;
  let curveAt = -Infinity;
  const inflight = new Map();

  const once = (key, fn) => {
    if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
    return inflight.get(key);
  };

  async function detect() {
    try {
      if (isAddress(pinned)) {
        launch = { mint: pinned, pool: await findPoolByMint(rpc, pinned), source: 'pinned' };
      } else {
        const hit = await findLaunch(rpc, { creator, since, symbol });
        if (hit) {
          launch = { ...hit, source: 'detected' };
          log(`$FANG detected mint=${hit.mint} pool=${hit.pool} tx=${hit.signature}`);
        }
      }
      reason = 'not-launched';
    } catch (e) {
      reason = 'unavailable';
      launchCheckedAt -= CHECK_MS / 2; // try again sooner than the normal interval
      log(`$FANG lookup failed: ${e.message}`);
    }
  }

  async function refreshPoolAndFacts() {
    if (!launch?.pool) return;
    try {
      const poolBytes = await readAccount(rpc, launch.pool);
      if (!poolBytes || poolBytes.length < POOL_SIZE) throw new Error('pool account not found');
      const p = decodePool(poolBytes);
      if (p.baseMint !== launch.mint) throw new Error('pool does not belong to the mint');
      if (!config || configKey !== p.config) {
        const cfgBytes = await readAccount(rpc, p.config);
        if (!cfgBytes || cfgBytes.length < 370) throw new Error('config account not found');
        config = decodeConfig(cfgBytes);
        configKey = p.config;
      }
      const q = QUOTES[config.quoteMint] ?? { symbol: 'quote', decimals: 9 };
      const threshold = Number(config.quoteThreshold);
      curve = {
        progress: p.migrated ? 100 : threshold > 0 ? Math.min(100, Math.round((Number(p.quoteReserve) / threshold) * 1000) / 10) : 0,
        raised: Math.round((Number(p.quoteReserve) / 10 ** q.decimals) * 100) / 100,
        threshold: Math.round((threshold / 10 ** q.decimals) * 100) / 100,
        quoteSymbol: q.symbol,
        graduated: p.migrated,
        updatedAt: now(),
      };
      curveAt = now();
      if (!facts || now() - factsAt >= 600_000) {
        const mint = await rpc('getAccountInfo', [launch.mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
        const info = mint?.value?.data?.parsed?.info;
        if (!info) throw new Error('mint account not readable');
        facts = describe(config, { supply: String(info.supply), decimals: Number(info.decimals), mintAuthority: info.mintAuthority ?? null, freezeAuthority: info.freezeAuthority ?? null });
        factsAt = now();
      }
    } catch (e) {
      curveAt = now() - 5_000; // retry sooner than the normal 10 s
      log(`$FANG pool read failed: ${e.message}`);
    }
  }

  return {
    async get() {
      if (!isAddress(pinned) && !isAddress(creator)) return { status: 'not-configured' };
      if (!launch && now() - launchCheckedAt >= CHECK_MS) {
        launchCheckedAt = now();
        once('detect', detect);
      }
      if (inflight.has('detect')) await inflight.get('detect');
      if (!launch) return { status: reason };
      if (launch.pool && now() - curveAt >= 10_000) once('pool', refreshPoolAndFacts);
      if (inflight.has('pool') && (!facts || !curve)) await inflight.get('pool');
      return {
        status: 'live',
        source: launch.source,
        mint: launch.mint,
        pool: launch.pool,
        config: configKey || null,
        signature: launch.signature ?? null,
        launchedAt: launch.blockTime ?? null,
        name: launch.name ?? null,
        symbol: launch.symbol ?? null,
        facts,
        curve,
      };
    },
  };
}
