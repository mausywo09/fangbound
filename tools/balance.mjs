// Balance check: random lineups (sorted Guard > Striker > Mystic, the way players line up)
// fight each other at equal level. Usage: node tools/balance.mjs [battles] [level]
import { MONSTERS, BY_ID } from '../src/data.js';
import { simulate, rng32 } from '../src/sim.js';

const N = Number(process.argv[2]) || 20000;
const LEVEL = Number(process.argv[3]) || 1;
const rand = rng32(20261029);
const ROLE = { guard: 0, striker: 1, mystic: 2 };
const ids = MONSTERS.map((m) => m.id);

function lineup() {
  const pool = ids.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).sort((a, b) => ROLE[BY_ID[a].role] - ROLE[BY_ID[b].role]);
}

const mon = Object.fromEntries(ids.map((id) => [id, { g: 0, w: 0 }]));
const combos = new Map();
let aWins = 0;
let timeouts = 0;
let dur = 0;
const started = Date.now();
for (let i = 0; i < N; i++) {
  const A = lineup();
  const B = lineup();
  const r = simulate({
    seed: (rand() * 2 ** 32) >>> 0,
    a: { team: A.map((id) => ({ id, level: LEVEL })) },
    b: { team: B.map((id) => ({ id, level: LEVEL })) },
  });
  if (r.winner === 'a') aWins++;
  if (r.reason === 'time') timeouts++;
  dur += r.duration;
  for (const [team, side] of [[A, 'a'], [B, 'b']]) {
    const won = r.winner === side;
    for (const id of team) { mon[id].g++; if (won) mon[id].w++; }
    const key = team.join(' > ');
    const c = combos.get(key) || { g: 0, w: 0 };
    c.g++;
    if (won) c.w++;
    combos.set(key, c);
  }
}

const pct = (w, g) => (100 * w / g).toFixed(1).padStart(5) + '%';
console.log(`${N} battles at Lv ${LEVEL} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`side A wins ${pct(aWins, N)} | timeouts ${pct(timeouts, N)} | avg length ${(dur / N).toFixed(1)}s\n`);
for (const m of MONSTERS.slice().sort((x, y) => mon[y.id].w / mon[y.id].g - mon[x.id].w / mon[x.id].g)) {
  const r = mon[m.id].w / mon[m.id].g;
  const bar = '#'.repeat(Math.max(0, Math.round((r - 0.3) * 100))).padEnd(40);
  console.log(`${m.name.padEnd(11)} ${m.element.padEnd(6)} ${m.role.padEnd(8)} ${pct(mon[m.id].w, mon[m.id].g)} ${bar}`);
}
const ranked = [...combos].filter(([, c]) => c.g >= 25).sort((x, y) => y[1].w / y[1].g - x[1].w / x[1].g);
console.log('\nbest lineups');
for (const [k, c] of ranked.slice(0, 6)) console.log(`  ${pct(c.w, c.g)}  ${k}  (${c.g})`);
console.log('worst lineups');
for (const [k, c] of ranked.slice(-4)) console.log(`  ${pct(c.w, c.g)}  ${k}  (${c.g})`);
