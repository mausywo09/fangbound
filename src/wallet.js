// Solana wallets for sign-in. Wallets announce themselves through the Wallet Standard
// (Phantom, Solflare, Backpack and most others); Phantom's injected provider is the
// fallback for builds that don't. Only a message is signed, never a transaction.
import { newSignIn, signInMessage } from './signin.js';

const standard = new Map();
const canSignIn = (w) =>
  w?.chains?.some((c) => c.startsWith('solana:')) && w.features?.['standard:connect'] && w.features?.['solana:signMessage'];

const registry = Object.freeze({
  register(...wallets) {
    for (const w of wallets) if (canSignIn(w)) standard.set(w.name, w);
    return () => wallets.forEach((w) => standard.delete(w.name));
  },
});

window.addEventListener('wallet-standard:register-wallet', ({ detail }) => {
  try {
    detail(registry);
  } catch { /* a broken wallet must not break the page */ }
});
window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: registry }));

const phantom = () => (window.phantom?.solana?.isPhantom ? window.phantom.solana : null);

export function listWallets() {
  const out = [...standard.values()].map((w) => ({ name: w.name, icon: typeof w.icon === 'string' ? w.icon : '' }));
  if (phantom() && !standard.has('Phantom')) out.push({ name: 'Phantom', icon: '' });
  return out;
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const encode = (text) => new TextEncoder().encode(text);

export const cancelled = (e) => /reject|cancel|denied|declin|closed/i.test(String(e?.message ?? e));

// Connects the named wallet and signs a fresh sign-in message for this site.
export async function signWithWallet(name) {
  const w = standard.get(name);
  if (w) {
    const { accounts } = await w.features['standard:connect'].connect();
    const account = accounts?.find((a) => a.chains?.some((c) => c.startsWith('solana:'))) ?? accounts?.[0];
    if (!account) throw new Error('The wallet did not share an account.');
    const message = signInMessage(newSignIn(account.address, location.origin));
    const [out] = await w.features['solana:signMessage'].signMessage({ account, message: encode(message) });
    return { message, signature: toBase64(out.signature) };
  }
  const p = name === 'Phantom' && phantom();
  if (p) {
    const { publicKey } = await p.connect();
    const message = signInMessage(newSignIn(publicKey.toString(), location.origin));
    const { signature } = await p.signMessage(encode(message), 'utf8');
    return { message, signature: toBase64(signature) };
  }
  throw new Error('That wallet is not available anymore. Reload the page and try again.');
}

// On a phone without a wallet extension: open this page inside a wallet app's browser.
export function browseLinks(url) {
  const ref = encodeURIComponent(new URL(url).origin);
  return [
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${ref}` },
    { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${ref}` },
  ];
}
