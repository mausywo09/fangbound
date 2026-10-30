// Fangbound server: serves the game and its API. `npm start` (or `npm run dev` to
// restart on file changes). Settings come from the environment, see README.md.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createToken } from './token.js';
import { backupDaily } from './backup.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const dataDir = env.DATA_DIR || path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(dataDir, 'fangbound.db'));

// Season 1 starts here and a new season follows every 14 days.
const seasonStart = Date.parse(env.SEASON_START || '2026-10-26T00:00:00Z');
if (Number.isNaN(seasonStart)) throw new Error('SEASON_START must be an ISO date, e.g. 2026-11-02T00:00:00Z');

const app = createApp({
  db,
  root,
  seasonStart,
  publicHost: env.PUBLIC_HOST?.trim() || '',
  trustProxy: env.TRUST_PROXY === '1',
  secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : null,
  // Seasonal event: auto (by its dates), off, or force one, e.g. EVENT=halloween.
  eventSetting: env.EVENT?.trim() || 'auto',
  // The $FANG shop: off until the token is live; SHOP=test gives test balances locally.
  shopMode: env.SHOP?.trim() === 'test' ? 'test' : 'off',
  // $FANG: launch wallet, prize pool wallet and share, X link (FANG_* settings, see README).
  fang: createToken({ env }),
});
// Housekeeping every 6 hours: drop stale guests, keep a daily copy of the database.
const backupDir = path.join(dataDir, 'backups');
function housekeeping() {
  app.game.prune();
  try {
    const file = backupDaily(db, backupDir);
    if (file) console.log(`Backup written: ${file}`);
  } catch (e) {
    console.error(`Backup failed: ${e.message}`);
  }
}
housekeeping();
setInterval(housekeeping, 6 * 36e5).unref();

const port = Number(env.PORT) || 4380;
const server = createServer(app.handle).listen(port, () => console.log(`Fangbound on http://localhost:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
