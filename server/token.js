// GET /api/token: everything the landing page shows about $FANG. The launch (contract address,
// curve, on-chain facts) comes from launch.js; the season prize pool is a public wallet whose
// SOL balance is the pool, so anyone can check it; the X link sits beside them.
import { createLaunchResolver, isAddress, jsonRpc } from './launch.js';

// FANG_X, FANG_POOL_WALLET, FANG_POOL_SHARE and FANG_POOL_TOPUP override these. The pool
// wallet is not set up yet (2026-10-30).
export const DEFAULT_X = '@fangboundgame';
export const DEFAULT_POOL_WALLET = '';
// Percent of $FANG creator fees that funds each season's pool (empty = not announced yet).
export const DEFAULT_POOL_SHARE = '10';
// '1': the creator also tops the pool up from their own funds, and the page says so.
export const DEFAULT_POOL_TOPUP = '1';
const RPC_URLS = 'https://gene-v4mswe-fast-mainnet.helius-rpc.com,https://solana-rpc.publicnode.com';
const BALANCE_MS = 30_000;

// "https://x.com/name", "x.com/name", "@name" or "name" → https://x.com/name (else null).
export function xLink(s) {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\/?$|^@?([A-Za-z0-9_]{1,15})$/.exec(String(s ?? '').trim());
  return m ? `https://x.com/${m[1] ?? m[2]}` : null;
}

export function poolShare(s) {
  const n = Number(String(s ?? '').trim().replace(/%$/, ''));
  return String(s ?? '').trim() && n > 0 && n <= 100 ? n : null;
}

export function createToken({ env, fetch: doFetch = fetch, now = Date.now, log = console.log }) {
  // SOLANA_RPC: comma-separated https endpoints, tried in order.
  const urls = (env.SOLANA_RPC || RPC_URLS).split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u));
  const rpc = jsonRpc(urls, doFetch);
  const launch = createLaunchResolver({ rpc, env, now, log });
  const x = xLink(env.FANG_X ?? DEFAULT_X);
  const wallet = (env.FANG_POOL_WALLET ?? DEFAULT_POOL_WALLET).trim();
  const share = poolShare(env.FANG_POOL_SHARE ?? DEFAULT_POOL_SHARE);
  const topUp = (env.FANG_POOL_TOPUP ?? DEFAULT_POOL_TOPUP).trim() === '1';
  let sol = null;
  let solAt = -Infinity;
  let reading = null;

  // The pool wallet's balance, read at most every BALANCE_MS; a failed read keeps the last one.
  async function poolSol() {
    if (!isAddress(wallet)) return null;
    if (now() - solAt >= BALANCE_MS && !reading) {
      solAt = now();
      reading = rpc('getBalance', [wallet, { commitment: 'confirmed' }])
        .then((r) => { sol = Math.floor(Number(r?.value ?? r) / 1e6) / 1e3; })
        .catch((e) => log(`$FANG pool balance failed: ${e.message}`))
        .finally(() => { reading = null; });
    }
    if (sol === null && reading) await reading;
    return sol;
  }

  return {
    async get() {
      const [state, balance] = await Promise.all([launch.get(), poolSol()]);
      return { ...state, prize: { share, topUp, wallet: isAddress(wallet) ? wallet : null, sol: balance }, links: { x } };
    },
  };
}
