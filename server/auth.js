// Wallet sign-in and sessions. A wallet signs our sign-in message once (src/signin.js, no
// transaction); the session lives in an HttpOnly cookie whose token is stored hashed.
// Guests get the same kind of session, so a guest who signs in keeps their progress.
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { decode } from './base58.js';
import { parseSignInMessage, SIGN_IN_TTL_MS } from '../src/signin.js';

export const COOKIE = 'cl_session';
export const SESSION_TTL_MS = 90 * 864e5;
const CLOCK_SKEW_MS = 60_000;
// DER header of an ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow.
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

function publicKey(wallet) {
  const raw = typeof wallet === 'string' && wallet.length <= 44 ? decode(wallet) : null;
  return raw?.length === 32 ? raw : null;
}

export const isWallet = (v) => publicKey(v) !== null;

export function verifySignature(wallet, message, signature) {
  const pub = publicKey(wallet);
  if (!pub || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, pub]), format: 'der', type: 'spki' });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}

/**
 * Checks a signed sign-in message for this host. `useNonce(nonce, expires)` returns false
 * when the nonce was seen before, so a captured signature cannot be replayed.
 */
export function checkSignIn(body, host, now, useNonce) {
  const { message, signature } = body ?? {};
  if (typeof message !== 'string' || message.length > 1000 || typeof signature !== 'string' || !signature || signature.length > 100) {
    return { status: 400, error: 'Send the signed sign-in message and its signature.' };
  }
  const fields = parseSignInMessage(message);
  if (!fields) return { status: 400, error: 'That is not a Fangbound sign-in message.' };
  if (fields.domain !== host) return { status: 401, error: 'This sign-in message is for another site.' };
  const issued = Date.parse(fields.issuedAt);
  if (now - issued > SIGN_IN_TTL_MS || issued - now > CLOCK_SKEW_MS) return { status: 401, error: 'The sign-in message has expired. Sign in again.' };
  const sig = Buffer.from(signature, 'base64');
  if (!verifySignature(fields.wallet, Buffer.from(message, 'utf8'), sig)) return { status: 401, error: "The wallet signature doesn't match. Sign in again." };
  if (!useNonce(fields.nonce, issued + SIGN_IN_TTL_MS + CLOCK_SKEW_MS)) return { status: 401, error: 'That sign-in was already used. Sign in again.' };
  return { wallet: fields.wallet };
}

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function sessionCookie(token, secure, maxAgeSec = SESSION_TTL_MS / 1000) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
