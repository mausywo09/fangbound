// Local preview of fangbound.com as if $FANG were live: the token settings point at the real
// $CTAP launch on mainnet (detection, curve and facts are real chain data) and the server runs
// on :4382 with its own data folder. Not shipped. `node tools/dev-live.mjs`
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
Object.assign(process.env, {
  PORT: process.env.PORT || '4382',
  DATA_DIR: path.join(root, 'data', 'live-preview'),
  FANG_CREATOR: 'DA5pURRr7wo2kqBDgk8XukgsQsGr7HMKXhghny72L5mU',
  FANG_SINCE: '2026-10-20T19:29:00Z',
  FANG_SYMBOL: 'CTAP',
  FANG_POOL_WALLET: 'DA5pURRr7wo2kqBDgk8XukgsQsGr7HMKXhghny72L5mU',
  FANG_POOL_SHARE: '30',
  FANG_X: '@fangbound',
});
await import('../server/index.js');
