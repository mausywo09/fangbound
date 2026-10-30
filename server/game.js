// Game rules on the server. Every ranked match is created, simulated and scored here, so
// the browser only plays back a battle that is already decided. The seed stays secret
// until the lineup is locked in, and a found opponent stays until it is fought, so
// neither the battle nor the matchup can be rerolled. Wallet players fight other wallet
// players' defense teams near their rating; bots fill in when nobody is close.
import { randomBytes, randomInt } from 'node:crypto';
import { tx } from './db.js';
import { hashToken, newToken, SESSION_TTL_MS } from './auth.js';
import { simulate, SIM_VERSION } from '../src/sim.js';
import { makeOpponent } from '../src/match.js';
import { freshState, applyResult, applyDefense, rollHatch, hatch, syncSeason, seasonAt, cleanName, validLineup, evolve, evolveBlock } from '../src/state.js';
import { syncPass, syncDaily, dayOf, DAY_MS, matchSummary, applyMatch, checkIn, rerollQuest, claimTier, claimable, TITLES, grant, addPassXp, REF_WINS, REF_XP, REF_CAP, MATCH_XP_DAILY } from '../src/pass.js';
import { TRAINING, TUTORIAL_XP, TUTORIAL_TOME, TRAINING_SEED, TRAINING_TRIES } from '../src/tutorial.js';
import { syncShop, buyBlock, applyItem, xpMult, SHOP_ITEMS, TEST_BALANCE } from '../src/shop.js';
import { activeEvent, syncEvent, applyEventMatch, trickOrTreat, buyPumpkin, bossTriesLeft, raidSummary, applyRaid, claimGift, BOSS_TEAM, EGG_COST } from '../src/event.js';

export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const FIGHT_GAP_MS = 2000;
const HISTORY = 8;
const DEFENSES = 6;
const BOARD = 10;
// How far apart in rating a real opponent may be, and how many recent ones to skip.
export const PVP_WINDOW = 150;
const RECENT = 5;
// Challenge links last a week; each friend fights one once, for no rating.
export const CHALLENGE_TTL = 7 * 864e5;
const DUEL_LOG = 6;
const rand32 = () => randomInt(0, 2 ** 32);
const random = () => randomInt(0, 2 ** 32) / 2 ** 32;

// eventSetting: which seasonal event runs ('auto' by date, 'off', or an event id).
// shopMode: 'off' (the $FANG shop is shown but closed until the token is live) or 'test'
// (every player gets a separate test balance, for local testing).
export function createGame(db, { now = Date.now, seasonStart, eventSetting = 'auto', shopMode = 'off' }) {
  const season = () => seasonAt(now(), seasonStart);
  const today = () => dayOf(now());
  const event = () => activeEvent(now(), eventSetting);
  const st = Object.fromEntries(Object.entries({
    insertPlayer: 'INSERT INTO players (wallet, state, season, rating, created, seen) VALUES (?, ?, ?, ?, ?, ?)',
    getPlayer: 'SELECT * FROM players WHERE id = ?',
    byWallet: 'SELECT id FROM players WHERE wallet = ?',
    savePlayer: 'UPDATE players SET state = ?, season = ?, rating = ?, games = ?, ranked_at = ?, seen = ? WHERE id = ?',
    setWallet: 'UPDATE players SET wallet = ? WHERE id = ?',
    pending: 'SELECT * FROM matches WHERE player = ? AND winner IS NULL',
    getMatch: 'SELECT * FROM matches WHERE id = ?',
    insertMatch: 'INSERT INTO matches (id, player, season, created, seed, ver, b, opp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    finishMatch: 'UPDATE matches SET played = ?, ver = ?, a = ?, winner = ?, delta = ?, opp_delta = ? WHERE id = ? AND winner IS NULL',
    deleteMatch: 'DELETE FROM matches WHERE id = ?',
    history: 'SELECT id, b, winner, delta FROM matches WHERE player = ? AND winner IS NOT NULL AND kind IS NULL ORDER BY played DESC LIMIT ?',
    defenses: 'SELECT id, a, winner, opp_delta, played FROM matches WHERE opp = ? AND winner IS NOT NULL AND kind IS NULL ORDER BY played DESC LIMIT ?',
    awaySince: 'SELECT COUNT(*) AS n, COALESCE(SUM(opp_delta), 0) AS delta FROM matches WHERE opp = ? AND winner IS NOT NULL AND kind IS NULL AND played > ?',
    recentOpps: 'SELECT opp FROM matches WHERE player = ? AND opp IS NOT NULL AND kind IS NULL ORDER BY created DESC LIMIT ?',
    // challenges (duels) and invites
    insertChallenge: 'INSERT INTO challenges (id, player, created, expires, team) VALUES (?, ?, ?, ?, ?)',
    getChallenge: 'SELECT * FROM challenges WHERE id = ?',
    lastChallenge: 'SELECT * FROM challenges WHERE player = ? ORDER BY created DESC LIMIT 1',
    insertDuel: `INSERT INTO matches (id, player, season, created, played, seed, ver, a, b, winner, opp, kind, challenge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'duel', ?)`,
    duelOf: 'SELECT id FROM matches WHERE challenge = ? AND player = ?',
    duelLog: "SELECT id, a, winner, played FROM matches WHERE opp = ? AND kind = 'duel' ORDER BY played DESC LIMIT ?",
    duelsSince: "SELECT COUNT(*) AS n, COALESCE(SUM(winner = 'b'), 0) AS held FROM matches WHERE opp = ? AND kind = 'duel' AND played > ?",
    byCode: 'SELECT id FROM players WHERE code = ?',
    setCode: 'UPDATE players SET code = ? WHERE id = ? AND code IS NULL',
    pruneChallenges: 'DELETE FROM challenges WHERE expires < ?',
    // event raids (the Hollow King), stored as matches so replay links work
    insertRaid: `INSERT INTO matches (id, player, season, created, played, seed, ver, a, b, winner, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'boss')`,
    // Wallet players ranked this season, with a defense team, near a rating (closest first).
    candidates: `SELECT id, wallet, json_extract(state, '$.name') AS name, json_extract(state, '$.title') AS title, rating, json_extract(state, '$.defense') AS defense
      FROM players WHERE wallet IS NOT NULL AND season = ? AND games > 0 AND id != ? AND rating BETWEEN ? AND ?
      AND json_extract(state, '$.defense') IS NOT NULL ORDER BY abs(rating - ?) LIMIT 40`,
    board: `SELECT id, wallet, json_extract(state, '$.name') AS name, json_extract(state, '$.title') AS title, rating FROM players
      WHERE wallet IS NOT NULL AND season = ? AND games > 0 ORDER BY rating DESC, ranked_at ASC LIMIT ?`,
    boardCount: 'SELECT COUNT(*) AS c FROM players WHERE wallet IS NOT NULL AND season = ? AND games > 0',
    rankOf: `SELECT COUNT(*) AS c FROM players WHERE wallet IS NOT NULL AND season = ? AND games > 0
      AND (rating > ? OR (rating = ? AND ranked_at < ?))`,
    standings: 'SELECT rank, wallet, name, rating FROM standings WHERE season = ? ORDER BY rank',
    insertStanding: 'INSERT OR IGNORE INTO standings (season, rank, wallet, name, rating) VALUES (?, ?, ?, ?, ?)',
    getMeta: 'SELECT value FROM meta WHERE key = ?',
    setMeta: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    insertSession: 'INSERT INTO sessions (token, player, expires) VALUES (?, ?, ?)',
    getSession: 'SELECT player FROM sessions WHERE token = ? AND expires > ?',
    moveSession: 'UPDATE sessions SET player = ?, expires = ? WHERE token = ?',
    deleteSession: 'DELETE FROM sessions WHERE token = ?',
    insertNonce: 'INSERT OR IGNORE INTO nonces (nonce, expires) VALUES (?, ?)',
    pruneSessions: 'DELETE FROM sessions WHERE expires <= ? OR player NOT IN (SELECT id FROM players)',
    pruneNonces: 'DELETE FROM nonces WHERE expires <= ?',
    // Guests who never fought go after a day; other guests after 30 days away.
    pruneGuests: `DELETE FROM players WHERE wallet IS NULL AND (seen < ? OR
      (seen < ? AND json_extract(state, '$.wins') + json_extract(state, '$.losses') = 0))`,
    prunePending: 'DELETE FROM matches WHERE winner IS NULL AND player NOT IN (SELECT id FROM players)',
  }).map(([k, sql]) => [k, db.prepare(sql)]));

  const lastFight = new Map();
  let closed = null;

  // ---- players ----

  function createPlayer(wallet = null) {
    const t = now();
    const s = freshState(season().n);
    return Number(st.insertPlayer.run(wallet, JSON.stringify(s), s.season, s.rating, t, t).lastInsertRowid);
  }

  // A player with their state caught up to the current season and day (pass, quests), or
  // null. `visit` marks them as seen; a defender loaded for someone else's fight is not visiting.
  function load(id, visit = true) {
    const row = st.getPlayer.get(id);
    if (!row) return null;
    const p = { id: row.id, wallet: row.wallet, code: row.code, s: { ...freshState(), ...JSON.parse(row.state) }, rankedAt: row.ranked_at, seen: row.seen };
    syncSeason(p.s, season().n);
    syncPass(p.s);
    syncDaily(p.s, today(), random);
    syncEvent(p.s, event(), today());
    syncShop(p.s, today());
    if (shopMode === 'test') p.s.testFang ??= TEST_BALANCE;
    if (!p.code) giveCode(p);
    save(p, visit);
    return p;
  }

  // A random invite code, retried in the (unlikely) case it is taken.
  function giveCode(p) {
    for (let i = 0; i < 5 && !p.code; i++) {
      const code = randomBytes(6).toString('base64url');
      try {
        if (st.setCode.run(code, p.id).changes) p.code = code;
      } catch {
        // taken: try another
      }
    }
  }

  function save(p, visit = true) {
    if (visit) p.seen = now();
    st.savePlayer.run(JSON.stringify(p.s), p.s.season, p.s.rating, p.s.seasonGames, p.rankedAt, p.seen, p.id);
  }

  // Links the wallet to this guest, or switches to the account the wallet already has.
  function signIn(p, wallet) {
    const existing = st.byWallet.get(wallet);
    if (existing) return { id: existing.id, result: existing.id === p?.id ? 'same' : 'switched' };
    if (!p || p.wallet) return { id: createPlayer(wallet), result: 'new' };
    st.setWallet.run(wallet, p.id);
    return { id: p.id, result: 'linked' };
  }

  function setLineup(p, lineup) {
    if (!validLineup(p.s, lineup)) throw new GameError(400, 'Pick three different monsters you own.');
    p.s.lineup = [...lineup];
    save(p);
  }

  function setName(p, name) {
    if (typeof name !== 'string') throw new GameError(400, 'Send a name.');
    p.s.name = cleanName(name);
    save(p);
  }

  function me(p) {
    const day = today();
    return {
      player: p.s, wallet: p.wallet, pending: publicPending(pendingRow(p)), history: history(p), defenses: defenses(p), season: season(),
      today: { day, end: (day + 1) * DAY_MS }, friends: friends(p), event: eventInfo(),
      shop: { mode: shopMode, balance: shopMode === 'test' ? p.s.testFang : p.s.fang },
    };
  }

  // A squad as it fights: ids with levels, and evo only when evolved.
  const teamOf = (s, ids) => ids.map((m) => ({ id: m, level: s.owned[m].level, ...(s.owned[m].evo && { evo: true }) }));

  // ---- ranked matches ----

  function pendingRow(p) {
    const row = st.pending.get(p.id);
    if (row && row.season !== p.s.season) {
      st.deleteMatch.run(row.id);
      return null;
    }
    return row ?? null;
  }

  const publicPending = (row) => row && { id: row.id, opp: JSON.parse(row.b) };

  // A real player's defense near your rating when there is one, else a bot. Guests only
  // meet bots, so throwaway accounts can't move anyone's rating.
  function pickOpponent(p) {
    const s = p.s;
    if (p.wallet) {
      const recent = new Set(st.recentOpps.all(p.id, RECENT).map((r) => r.opp));
      const pool = st.candidates.all(s.season, p.id, s.rating - PVP_WINDOW, s.rating + PVP_WINDOW, s.rating).filter((r) => !recent.has(r.id));
      if (pool.length) {
        const r = pool[randomInt(0, pool.length)];
        return { opp: { name: r.name, title: r.title ?? null, rating: r.rating, wallet: r.wallet, team: JSON.parse(r.defense) }, oppId: r.id };
      }
    }
    return { opp: makeOpponent(s.rating, s.lineup, rand32()), oppId: null };
  }

  function find(p) {
    const existing = pendingRow(p);
    if (existing) return publicPending(existing);
    const id = randomBytes(8).toString('base64url');
    const { opp, oppId } = pickOpponent(p);
    st.insertMatch.run(id, p.id, p.s.season, now(), rand32(), SIM_VERSION, JSON.stringify(opp), oppId);
    return { id, opp };
  }

  function fight(p, id, lineup) {
    const row = typeof id === 'string' ? st.getMatch.get(id) : null;
    if (!row || row.player !== p.id) throw new GameError(404, 'That match was not found. Find a new one.');
    if (row.winner) throw new GameError(409, 'That match was already played.');
    if (row.season !== p.s.season) {
      st.deleteMatch.run(row.id);
      throw new GameError(409, 'The season ended before this match was played. Find a new one.');
    }
    if (!validLineup(p.s, lineup)) throw new GameError(400, 'Pick three different monsters you own.');
    const t = now();
    if (t - (lastFight.get(p.id) ?? -Infinity) < FIGHT_GAP_MS) throw new GameError(429, 'Easy there! Wait a moment before the next fight.');

    const s = p.s;
    s.lineup = [...lineup];
    const a = { name: s.name, title: s.title, rating: s.rating, team: teamOf(s, lineup) };
    const b = JSON.parse(row.b);
    const res = simulate({ seed: row.seed, a, b });
    const { winner } = res;
    // An XP booster speeds up levels and the pass; it never changes the battle itself.
    const mult = xpMult(s, t);
    const outcome = applyResult(s, { won: winner === 'a', oppRating: b.rating, team: lineup, xpMult: mult });
    if (mult > 1) outcome.boost = mult;
    // Quests and the pass move after the match is decided, from the same simulation.
    outcome.progress = applyMatch(s, matchSummary(res, lineup, winner === 'a'), { xpMult: mult });
    // During an event: candy for the same counted matches, and event quest progress.
    if (event() && s.event) outcome.event = applyEventMatch(s, winner === 'a', s.daily.matches <= MATCH_XP_DAILY);
    // An invited player's wallet wins count toward the invite reward for both players.
    let inviter = null;
    if (p.wallet && s.ref && !s.ref.done && winner === 'a' && ++s.ref.wins >= REF_WINS) {
      s.ref.done = true;
      outcome.referral = { name: s.ref.name, rewards: payInvite(s) };
      inviter = s.ref.by;
    }
    s.defense = a.team;
    p.rankedAt = t;
    tx(db, () => {
      let defense = null;
      const d = row.opp && load(row.opp, false);
      if (d) {
        defense = applyDefense(d.s, { won: winner === 'b', attackerRating: a.rating });
        save(d, false);
      }
      const r = inviter && load(inviter, false);
      if (r && r.s.invites.paid < REF_CAP) {
        payInvite(r.s);
        r.s.invites.paid++;
        save(r, false);
      }
      st.finishMatch.run(t, SIM_VERSION, JSON.stringify(a), winner, outcome.delta, defense?.delta ?? null, row.id);
      save(p);
    });
    lastFight.set(p.id, t);
    return { match: { id: row.id, seed: row.seed, ver: SIM_VERSION, a, b, winner }, outcome };
  }

  function history(p) {
    return st.history.all(p.id, HISTORY).map((r) => {
      const b = JSON.parse(r.b);
      return { id: r.id, won: r.winner === 'a', opp: b.name, oppRating: b.rating, bot: !!b.bot, delta: r.delta };
    });
  }

  // Fights other players had against this player's defense team.
  function defenses(p) {
    return st.defenses.all(p.id, DEFENSES).map((r) => {
      const a = JSON.parse(r.a);
      return { id: r.id, won: r.winner === 'b', attacker: a.name, rating: a.rating, delta: r.opp_delta, played: r.played };
    });
  }

  // What happened while the player was away (null if nothing): attacks on their defense,
  // friends who took their challenge, and invited friends who earned the invite reward.
  function away(p) {
    const { n, delta } = st.awaySince.get(p.id, p.s.defSeen);
    const duels = st.duelsSince.get(p.id, p.s.defSeen);
    const inv = p.s.invites;
    const refs = inv.paid - inv.seen;
    inv.seen = inv.paid;
    p.s.defSeen = now();
    save(p);
    return n || duels.n || refs ? { n, delta, duels, refs } : null;
  }

  // A finished match, public so replay links work for anyone.
  function replay(id) {
    const row = st.getMatch.get(id);
    if (!row?.winner) return null;
    return { id: row.id, seed: row.seed, ver: row.ver, a: JSON.parse(row.a), b: JSON.parse(row.b), winner: row.winner, played: row.played };
  }

  // ---- challenges (friendly duels) and invites ----

  // Your squad, frozen into a link. The same squad reuses its open link.
  function createChallenge(p) {
    const s = p.s;
    const snap = { name: s.name, title: s.title, rating: s.rating, team: teamOf(s, s.lineup) };
    const same = (row) => {
      const old = JSON.parse(row.team);
      return old.name === snap.name && JSON.stringify(old.team) === JSON.stringify(snap.team);
    };
    const t = now();
    const last = st.lastChallenge.get(p.id);
    if (last && last.expires > t && same(last)) return { id: last.id, expires: last.expires };
    const id = randomBytes(6).toString('base64url');
    st.insertChallenge.run(id, p.id, t, t + CHALLENGE_TTL, JSON.stringify(snap));
    return { id, expires: t + CHALLENGE_TTL };
  }

  // A challenge as the visitor sees it: whose squad, and whether they fought it already.
  function challenge(p, id) {
    const row = st.getChallenge.get(id);
    if (!row) return null;
    return { id, from: JSON.parse(row.team), expired: row.expires <= now(), mine: row.player === p?.id, fought: (p && st.duelOf.get(id, p.id)?.id) || null };
  }

  // A friendly duel against a challenge: decided here like a ranked match, but no rating,
  // XP or quests move. Each player fights a challenge once.
  function duel(p, id, lineup) {
    const row = typeof id === 'string' ? st.getChallenge.get(id) : null;
    if (!row) throw new GameError(404, 'That challenge was not found.');
    if (row.player === p.id) throw new GameError(409, 'That is your own challenge. Send it to a friend.');
    if (row.expires <= now()) throw new GameError(410, 'That challenge has expired. Ask for a new link.');
    if (st.duelOf.get(id, p.id)) throw new GameError(409, 'You already took this challenge.');
    if (!validLineup(p.s, lineup)) throw new GameError(400, 'Pick three different monsters you own.');
    const t = now();
    if (t - (lastFight.get(p.id) ?? -Infinity) < FIGHT_GAP_MS) throw new GameError(429, 'Easy there! Wait a moment before the next fight.');
    const s = p.s;
    s.lineup = [...lineup];
    const a = { name: s.name, title: s.title, rating: s.rating, team: teamOf(s, lineup) };
    const b = JSON.parse(row.team);
    const seed = rand32();
    const { winner } = simulate({ seed, a, b });
    const mid = randomBytes(8).toString('base64url');
    tx(db, () => {
      st.insertDuel.run(mid, p.id, s.season, t, t, seed, SIM_VERSION, JSON.stringify(a), JSON.stringify(b), winner, row.player, id);
      save(p);
    });
    lastFight.set(p.id, t);
    return { match: { id: mid, seed, ver: SIM_VERSION, a, b, winner }, outcome: { duel: true, won: winner === 'a', from: b.name } };
  }

  // A brand-new player who came in through someone's challenge or invite link.
  function refer(p, { ref, challenge: cid } = {}) {
    let by = typeof cid === 'string' ? st.getChallenge.get(cid)?.player ?? null : null;
    if (!by && typeof ref === 'string') by = st.byCode.get(ref)?.id ?? null;
    if (!by || by === p.id || p.s.ref) return null;
    const r = load(by, false);
    if (!r) return null;
    p.s.ref = { by, name: r.s.name, wins: 0, done: false };
    r.s.invites.joined++;
    tx(db, () => {
      save(p);
      save(r, false);
    });
    return { name: r.s.name };
  }

  // The invite reward, the same for both players.
  const payInvite = (s) => [grant(s, { type: 'egg' }), { type: 'pass', ...addPassXp(s, REF_XP) }];

  function friends(p) {
    const last = st.lastChallenge.get(p.id);
    const log = st.duelLog.all(p.id, DUEL_LOG).map((r) => ({ id: r.id, name: JSON.parse(r.a).name, held: r.winner === 'b', played: r.played }));
    return { code: p.code, challenge: last && last.expires > now() ? { id: last.id, expires: last.expires } : null, log };
  }

  // ---- seasonal event (src/event.js) ----

  const communityKey = (ev) => `event:${ev.id}:damage`;
  const communityTotal = (ev) => Number(st.getMeta.get(communityKey(ev))?.value ?? 0);

  // The running event for the page (the player's own progress is in player.event).
  function eventInfo() {
    const ev = event();
    return ev && { id: ev.id, name: ev.name, start: ev.start, end: ev.end, total: communityTotal(ev) };
  }

  function needEvent(p) {
    const ev = event();
    if (!ev || p.s.event?.id !== ev.id) throw new GameError(409, 'No event is running right now.');
    return ev;
  }

  function treat(p) {
    needEvent(p);
    const r = trickOrTreat(p.s, today(), random);
    if (!r) throw new GameError(409, 'You already went trick-or-treating today. Come back tomorrow.');
    save(p);
    return r;
  }

  function pumpkin(p) {
    needEvent(p);
    const r = buyPumpkin(p.s);
    if (!r) throw new GameError(409, `A pumpkin egg costs ${EGG_COST} candy.`);
    save(p);
    return r;
  }

  // A raid on the Hollow King: the server simulates it like a ranked match. It pays candy
  // for damage dealt, and the damage adds to the community total. Three tries a day.
  function raid(p, lineup) {
    const ev = needEvent(p);
    if (!bossTriesLeft(p.s)) throw new GameError(409, 'No raids left today. The Hollow King rises again tomorrow.');
    if (!validLineup(p.s, lineup)) throw new GameError(400, 'Pick three different monsters you own.');
    const t = now();
    if (t - (lastFight.get(p.id) ?? -Infinity) < FIGHT_GAP_MS) throw new GameError(429, 'Easy there! Wait a moment before the next fight.');
    const s = p.s;
    s.lineup = [...lineup];
    const a = { name: s.name, title: s.title, rating: s.rating, team: teamOf(s, lineup) };
    const seed = rand32();
    const res = simulate({ seed, a, b: BOSS_TEAM });
    const outcome = { raid: true, ...applyRaid(s, raidSummary(res)) };
    const mid = randomBytes(8).toString('base64url');
    tx(db, () => {
      st.insertRaid.run(mid, p.id, s.season, t, t, seed, SIM_VERSION, JSON.stringify(a), JSON.stringify(BOSS_TEAM), res.winner);
      st.setMeta.run(communityKey(ev), String(communityTotal(ev) + outcome.damage));
      save(p);
    });
    lastFight.set(p.id, t);
    return { match: { id: mid, seed, ver: SIM_VERSION, a, b: BOSS_TEAM, winner: res.winner }, outcome };
  }

  function gift(p, i) {
    const ev = needEvent(p);
    const r = claimGift(p.s, i, communityTotal(ev));
    if (!r) throw new GameError(409, 'That gift is not ready. Fight the Hollow King once, and wait for the community to reach it.');
    save(p);
    return r;
  }

  // ---- the first-match tutorial (src/tutorial.js) ----

  // A training battle: decided here like a ranked match (the first seed the squad wins
  // with), but nothing is at stake and it isn't stored. The first one pays the reward.
  function tutorial(p, lineup) {
    if (!validLineup(p.s, lineup)) throw new GameError(400, 'Pick three different monsters you own.');
    const t = now();
    if (t - (lastFight.get(p.id) ?? -Infinity) < FIGHT_GAP_MS) throw new GameError(429, 'Easy there! Wait a moment before the next fight.');
    const s = p.s;
    s.lineup = [...lineup];
    const a = { name: s.name, title: s.title, rating: s.rating, team: teamOf(s, lineup) };
    let seed = TRAINING_SEED;
    let res = null;
    for (let k = 0; k < TRAINING_TRIES; k++) {
      seed = TRAINING_SEED + k;
      res = simulate({ seed, a, b: TRAINING });
      if (res.winner === 'a') break;
    }
    const outcome = { tutorial: true, won: res.winner === 'a', reward: null };
    if (!s.tutorial?.rewarded) {
      outcome.reward = { pass: addPassXp(s, TUTORIAL_XP), tome: grant(s, { type: 'tome', xp: TUTORIAL_TOME }) };
    }
    s.tutorial = { done: s.tutorial?.done ?? t, rewarded: true };
    save(p);
    lastFight.set(p.id, t);
    return { match: { id: null, seed, ver: SIM_VERSION, a, b: TRAINING, winner: res.winner }, outcome };
  }

  // Skipping keeps the reward for whenever the player does play the training battle.
  function skipTutorial(p) {
    p.s.tutorial ??= { done: now(), rewarded: false };
    save(p);
  }

  // ---- the $FANG shop (src/shop.js) ----

  function buy(p, item) {
    if (shopMode === 'off') throw new GameError(409, 'The shop opens when $FANG launches.');
    const s = p.s;
    const wallet = shopMode === 'test' ? 'testFang' : 'fang';
    const t = now();
    const why = buyBlock(s, item, { now: t, balance: s[wallet], event: event()?.id });
    if (why) throw new GameError(409, why);
    s[wallet] -= SHOP_ITEMS[item].price;
    const result = applyItem(s, item, t);
    save(p);
    return { item, result };
  }

  // ---- eggs ----

  function openEgg(p) {
    const options = rollHatch(p.s, random);
    if (!options) throw new GameError(409, 'No egg to hatch yet.');
    save(p);
    return options;
  }

  function hatchEgg(p, id) {
    if (!hatch(p.s, id)) throw new GameError(400, 'Pick one of the monsters from your egg.');
    save(p);
  }

  // ---- evolution ----

  function evolveMonster(p, id) {
    if (typeof id !== 'string' || !Object.hasOwn(p.s.owned, id)) throw new GameError(400, 'Pick a monster you own.');
    const why = evolveBlock(p.s, id);
    if (why) throw new GameError(409, why);
    evolve(p.s, id);
    save(p);
  }

  // ---- daily quests, check-in and the season pass ----

  function dailyCheckIn(p) {
    const reward = checkIn(p.s, today());
    if (!reward) throw new GameError(409, 'You already checked in today. Come back tomorrow.');
    save(p);
    return reward;
  }

  function reroll(p, slot) {
    if (!rerollQuest(p.s, slot, random)) throw new GameError(409, 'That quest cannot be rerolled. One reroll a day, for an unfinished quest.');
    save(p);
  }

  // One tier ({ tier, track }) or every reached one ({ all: true }).
  function claim(p, { tier, track, all } = {}) {
    const picks = all ? claimable(p.s) : [{ tier, track }];
    const rewards = picks.map((c) => claimTier(p.s, c.tier, c.track)).filter(Boolean);
    if (!rewards.length) throw new GameError(409, all ? 'Nothing to claim yet. Play to earn pass XP.' : 'That tier is not ready to claim.');
    save(p);
    return rewards;
  }

  // Wears an earned title, or none (null).
  function setTitle(p, id) {
    if (id !== null && !(typeof id === 'string' && Object.hasOwn(TITLES, id) && p.s.titles.includes(id))) throw new GameError(400, 'Earn that title on the season pass first.');
    p.s.title = id;
    save(p);
  }

  // ---- season ----

  // Wallet players who fought this season; guests play but don't rank.
  function leaderboard(p) {
    const sz = season();
    const rows = st.board.all(sz.n, BOARD).map((r, i) => ({ rank: i + 1, name: r.name, title: r.title ?? null, wallet: r.wallet, rating: r.rating, you: r.id === p?.id }));
    let you = null;
    if (p?.wallet && p.s.seasonGames > 0) {
      const { c } = st.rankOf.get(sz.n, p.s.rating, p.s.rating, p.rankedAt);
      you = { rank: c + 1, name: p.s.name, title: p.s.title, wallet: p.wallet, rating: p.s.rating, you: true };
    }
    const last = st.standings.all(sz.n - 1);
    return { season: sz, rows, you, players: st.boardCount.get(sz.n).c, last: last.length ? { season: sz.n - 1, rows: last } : null };
  }

  // Freezes the final top of every season that has ended. Runs before any player is
  // loaded in a request, because loading catches the player up (and soft-resets them).
  function closeSeasons() {
    const current = season().n;
    if (closed === null) {
      const row = st.getMeta.get('closed');
      closed = row ? Number(row.value) : current - 1;
      if (!row) st.setMeta.run('closed', String(closed));
    }
    if (closed >= current - 1) return;
    tx(db, () => {
      for (let n = closed + 1; n < current; n++) {
        st.board.all(n, BOARD).forEach((r, i) => st.insertStanding.run(n, i + 1, r.wallet, r.name, r.rating));
      }
      st.setMeta.run('closed', String(current - 1));
    });
    closed = current - 1;
  }

  // ---- sessions ----

  function startSession(playerId) {
    const token = newToken();
    st.insertSession.run(hashToken(token), playerId, now() + SESSION_TTL_MS);
    return token;
  }
  const sessionPlayer = (token) => st.getSession.get(hashToken(token), now())?.player ?? null;
  // Points the session at another player (after sign-in) and extends it.
  const moveSession = (token, playerId) => st.moveSession.run(playerId, now() + SESSION_TTL_MS, hashToken(token));
  const endSession = (token) => st.deleteSession.run(hashToken(token));
  // False when the nonce was used before.
  const useNonce = (nonce, expires) => st.insertNonce.run(nonce, expires).changes === 1;

  function prune() {
    const t = now();
    tx(db, () => {
      st.pruneGuests.run(t - 30 * 864e5, t - 864e5);
      st.prunePending.run();
      st.pruneSessions.run(t);
      st.pruneNonces.run(t);
      st.pruneChallenges.run(t - 30 * 864e5);
    });
    for (const [id, at] of lastFight) if (t - at >= FIGHT_GAP_MS) lastFight.delete(id);
  }

  return {
    season, createPlayer, load, signIn, setLineup, setName, me, away, find, fight, replay, openEgg, hatchEgg, evolveMonster,
    createChallenge, challenge, duel, refer, event, treat, pumpkin, raid, gift, buy, tutorial, skipTutorial,
    dailyCheckIn, reroll, claim, setTitle, leaderboard, closeSeasons, startSession, sessionPlayer, moveSession, endSession, useNonce, prune,
  };
}
