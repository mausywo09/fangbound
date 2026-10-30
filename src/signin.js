// The message a wallet signs to sign in (shared by the browser and the server). It follows
// the Sign-In With Solana layout: the site, the wallet, a statement, then the URI, a
// single-use nonce and the time. Signing it is not a transaction.
export const SIGN_IN_TTL_MS = 10 * 60_000;

const STATEMENT = 'Sign in to Fangbound to keep your monsters and ranked progress on this wallet. This is not a transaction and costs nothing.';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function signInMessage(s) {
  return [`${s.domain} wants you to sign in with your Solana account:`, s.wallet, '', STATEMENT, '', `URI: ${s.uri}`, `Nonce: ${s.nonce}`, `Issued At: ${s.issuedAt}`].join('\n');
}

// The fields of a message we wrote, or null for anything else (extra lines, other wording).
export function parseSignInMessage(text) {
  const m = /^(\S+) wants you to sign in with your Solana account:\n(\S+)\n\n[^\n]+\n\nURI: (\S+)\nNonce: ([A-Za-z0-9]{8,64})\nIssued At: (\S+)$/.exec(text);
  if (!m || !BASE58.test(m[2]) || Number.isNaN(Date.parse(m[5]))) return null;
  const fields = { domain: m[1], wallet: m[2], uri: m[3], nonce: m[4], issuedAt: m[5] };
  return signInMessage(fields) === text ? fields : null;
}

// A fresh sign-in for `wallet` on the site at `origin` (e.g. location.origin).
export function newSignIn(wallet, origin, now = new Date()) {
  const url = new URL(origin);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => ALNUM[b % 62]).join('');
  return { domain: url.host, wallet, uri: url.origin, nonce, issuedAt: now.toISOString() };
}
