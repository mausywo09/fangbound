// Daily copies of the database in DATA_DIR/backups, so a bad deploy or a broken file never
// costs more than a day of play. Keeps the newest `keep` copies. They sit on the same volume
// as the database, so copy one off the server now and then (see README).
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const NAME = /^fangbound-\d{4}-\d{2}-\d{2}\.db$/;

// Writes today's copy unless it exists; returns its path, or null when there was nothing to do.
export function backupDaily(db, dir, { now = Date.now, keep = 7 } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `fangbound-${new Date(now()).toISOString().slice(0, 10)}.db`);
  let made = null;
  if (!existsSync(file)) {
    // VACUUM INTO writes a clean, consistent copy while the game keeps running; the rename
    // means a crash halfway never leaves a broken file under today's name.
    const tmp = `${file}.tmp`;
    rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    renameSync(tmp, file);
    made = file;
  }
  for (const old of readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().slice(keep)) rmSync(path.join(dir, old));
  return made;
}
