// Base58 (Bitcoin alphabet), the encoding of Solana wallet addresses.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VALUE = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));

export function encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b) break;
    out = '1' + out;
  }
  return out;
}

// The bytes of a base58 string, or null when it has characters outside the alphabet.
export function decode(text) {
  let n = 0n;
  for (const c of text) {
    const v = VALUE.get(c);
    if (v === undefined) return null;
    n = n * 58n + v;
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  for (const c of text) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
