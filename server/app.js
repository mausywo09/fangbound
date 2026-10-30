// HTTP layer: the JSON API under /api and the static game files. Every write needs a
// session cookie; the browser gets one as a guest and can tie it to a wallet later.
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { createGame, GameError } from './game.js';
import { checkSignIn, COOKIE, readCookie, sessionCookie } from './auth.js';

const MAX_BODY = 8 * 1024;
const MATCH_ID = /^[A-Za-z0-9_-]{11}$/;
const CHALLENGE_ID = /^[A-Za-z0-9_-]{8}$/;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};
// The landing page and the game; anything else must match PUBLIC (never server/, data/ or test/).
const PAGES = { '/': '/index.html', '/play': '/play.html' };
const PUBLIC = [
  /^\/(index|play)\.html$/,
  /^\/src\/(three\/)?[\w-]+\.(js|css)$/,
  /^\/vendor\/three\/[\w/.-]+\.js$/,
  /^\/media\/[\w/-]+\.(mp4|webm|jpg|png|webp)$/,
];
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };

/**
 * root: folder with index.html and src/. publicHost: the host sign-in messages must name
 * (default: the request's Host). trustProxy: read the client IP and https from
 * X-Forwarded-* (behind Coolify's proxy). secureCookies: null = Secure when the proxy says https.
 * eventSetting: the seasonal event ('auto' by date, 'off', or an event id such as 'halloween').
 * shopMode: the $FANG shop, 'off' (closed until the token is live) or 'test' (test balances).
 */
export function createApp({ db, root, now = Date.now, seasonStart, publicHost = '', trustProxy = false, secureCookies = null, eventSetting = 'auto', shopMode = 'off' }) {
  const game = createGame(db, { now, seasonStart, eventSetting, shopMode });
  const limits = rateLimiter(now);

  const host = (req) => publicHost || req.headers.host || '';
  const secure = (req) => secureCookies ?? (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const ip = (req) => (trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '';
  const need = (ctx) => {
    if (!ctx.player) throw new GameError(401, 'Your session ended. Reload the page.');
    return ctx.player;
  };
  const keepSession = (ctx) => ctx.cookies.push(sessionCookie(ctx.token, secure(ctx.req)));

  const routes = {
    // Starts (or resumes) a session; a visitor without one becomes a guest player.
    // `away` sums up attacks on the player's defense since they last looked.
    // A new guest who came through a challenge or invite link ({ challenge } or { ref })
    // is tied to whoever shared it; `invited` names them.
    'POST /api/session'(ctx) {
      let invited = null;
      if (!ctx.player) {
        if (!limits.hit(`guest:${ip(ctx.req)}`, 30, 36e5)) throw new GameError(429, 'Too many new players from this network. Try again later.');
        const id = game.createPlayer();
        ctx.player = game.load(id);
        ctx.token = game.startSession(id);
        invited = game.refer(ctx.player, ctx.body ?? {});
      } else game.moveSession(ctx.token, ctx.player.id);
      keepSession(ctx);
      const away = game.away(ctx.player);
      return { ...game.me(ctx.player), away, invited };
    },
    'GET /api/me': (ctx) => game.me(need(ctx)),
    'POST /api/auth/sign-in'(ctx) {
      if (!limits.hit(`signin:${ip(ctx.req)}`, 20, 6e5)) throw new GameError(429, 'Too many sign-in attempts. Wait a few minutes.');
      const check = checkSignIn(ctx.body, host(ctx.req), now(), game.useNonce);
      if (check.error) throw new GameError(check.status, check.error);
      const { id, result } = game.signIn(ctx.player, check.wallet);
      if (ctx.token) game.moveSession(ctx.token, id);
      else ctx.token = game.startSession(id);
      keepSession(ctx);
      const p = game.load(id);
      const away = game.away(p);
      return { ...game.me(p), result, away };
    },
    'POST /api/auth/sign-out'(ctx) {
      if (ctx.token) game.endSession(ctx.token);
      ctx.cookies.push(sessionCookie('', secure(ctx.req), 0));
      return { ok: true };
    },
    'POST /api/lineup'(ctx) {
      game.setLineup(need(ctx), ctx.body?.lineup);
      return { ok: true };
    },
    'POST /api/profile'(ctx) {
      const p = need(ctx);
      game.setName(p, ctx.body?.name);
      return { name: p.s.name };
    },
    'POST /api/match/find': (ctx) => ({ pending: game.find(need(ctx)) }),
    'POST /api/match/fight'(ctx) {
      const p = need(ctx);
      return { ...game.fight(p, ctx.body?.id, ctx.body?.lineup), me: game.me(p) };
    },
    'GET /api/match/:id'(ctx, id) {
      const match = MATCH_ID.test(id) && game.replay(id);
      if (!match) throw new GameError(404, 'That replay was not found.');
      return match;
    },
    'POST /api/egg/open': (ctx) => ({ options: game.openEgg(need(ctx)) }),
    'POST /api/egg/hatch'(ctx) {
      const p = need(ctx);
      game.hatchEgg(p, ctx.body?.id);
      return game.me(p);
    },
    'POST /api/challenge'(ctx) {
      const p = need(ctx);
      if (!limits.hit(`challenge:${p.id}`, 30, 864e5)) throw new GameError(429, 'That is a lot of challenge links for one day. Share the one you have.');
      return { challenge: game.createChallenge(p) };
    },
    'GET /api/challenge/:id'(ctx, id) {
      const c = CHALLENGE_ID.test(id) && game.challenge(ctx.player, id);
      if (!c) throw new GameError(404, 'That challenge was not found.');
      return c;
    },
    'POST /api/challenge/fight'(ctx) {
      const p = need(ctx);
      return { ...game.duel(p, ctx.body?.id, ctx.body?.lineup), me: game.me(p) };
    },
    'POST /api/monster/evolve'(ctx) {
      const p = need(ctx);
      game.evolveMonster(p, ctx.body?.id);
      return game.me(p);
    },
    'POST /api/daily/checkin'(ctx) {
      const p = need(ctx);
      return { reward: game.dailyCheckIn(p), me: game.me(p) };
    },
    'POST /api/quest/reroll'(ctx) {
      const p = need(ctx);
      game.reroll(p, ctx.body?.slot);
      return game.me(p);
    },
    'POST /api/pass/claim'(ctx) {
      const p = need(ctx);
      return { rewards: game.claim(p, ctx.body ?? {}), me: game.me(p) };
    },
    'POST /api/title'(ctx) {
      const p = need(ctx);
      game.setTitle(p, ctx.body?.id ?? null);
      return game.me(p);
    },
    // Night of Fangs (seasonal event): trick-or-treat, pumpkin eggs, the raid boss, gifts.
    'POST /api/event/treat'(ctx) {
      const p = need(ctx);
      return { result: game.treat(p), me: game.me(p) };
    },
    'POST /api/event/egg'(ctx) {
      const p = need(ctx);
      return { result: game.pumpkin(p), me: game.me(p) };
    },
    'POST /api/event/raid'(ctx) {
      const p = need(ctx);
      return { ...game.raid(p, ctx.body?.lineup), me: game.me(p) };
    },
    'POST /api/event/gift'(ctx) {
      const p = need(ctx);
      return { result: game.gift(p, ctx.body?.i), me: game.me(p) };
    },
    // The first-match tutorial: a training battle (no rating) and skipping it.
    'POST /api/tutorial/fight'(ctx) {
      const p = need(ctx);
      return { ...game.tutorial(p, ctx.body?.lineup), me: game.me(p) };
    },
    'POST /api/tutorial/skip'(ctx) {
      const p = need(ctx);
      game.skipTutorial(p);
      return game.me(p);
    },
    'POST /api/shop/buy'(ctx) {
      const p = need(ctx);
      return { ...game.buy(p, ctx.body?.item), me: game.me(p) };
    },
    'GET /api/leaderboard': (ctx) => game.leaderboard(ctx.player),
    'GET /api/health': () => ({ ok: true }),
  };

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === host(req);
    } catch {
      return false;
    }
  }

  async function api(req, res, url) {
    game.closeSeasons();
    if (req.method === 'POST' && !sameOrigin(req)) throw new GameError(403, 'Requests from other sites are not allowed.');
    // GET /api/match/:id and /api/challenge/:id take an id; every other route is exact.
    const m = req.method === 'GET' ? /^\/api\/(match|challenge)\/([^/]+)$/.exec(url.pathname) : null;
    const param = m?.[2];
    const route = routes[m ? `GET /api/${m[1]}/:id` : `${req.method} ${url.pathname}`];
    if (!route) throw new GameError(404, 'Unknown API route.');
    const token = readCookie(req.headers.cookie, COOKIE);
    const id = token ? game.sessionPlayer(token) : null;
    const player = id ? game.load(id) : null;
    const ctx = { req, token: player ? token : null, player, cookies: [] };
    ctx.body = req.method === 'POST' ? await readJson(req) : null;
    json(res, 200, route(ctx, param), ctx.cookies);
  }

  async function serveStatic(req, res, pathname) {
    const rel = PAGES[pathname] ?? pathname;
    if (!PUBLIC.some((re) => re.test(rel))) return text(res, 404, 'Not found');
    const file = path.join(root, rel);
    let info;
    try {
      info = await stat(file);
    } catch {
      return text(res, 404, 'Not found');
    }
    if (!info.isFile()) return text(res, 404, 'Not found');
    const media = rel.startsWith('/media/');
    // Pages carry the running event (<html data-event>), which switches the whole look.
    const page = path.extname(file) === '.html';
    const ev = page ? game.event()?.id ?? '' : '';
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}${ev && `-${ev}`}"`;
    const headers = {
      'Content-Type': TYPES[path.extname(file)],
      'Cache-Control': media || rel.startsWith('/vendor/') ? 'public, max-age=3600' : 'no-cache',
      ETag: etag,
      ...(media && { 'Accept-Ranges': 'bytes' }),
      ...SECURITY,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    if (page) {
      let html = await readFile(file, 'utf8');
      if (ev) html = html.replace('<html lang="en">', `<html lang="en" data-event="${ev}">`);
      const body = Buffer.from(html);
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    // Safari only plays video that it can fetch in byte ranges.
    const range = media && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    let start = 0;
    let end = info.size - 1;
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': info.size });
    }
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(file, { start, end }), res);
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
      return await serveStatic(req, res, url.pathname);
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      if (!res.headersSent) json(res, e.status ?? 500, { error: e instanceof GameError ? e.message : 'Something went wrong on the server.' });
    }
  }

  return { handle, game };
}

function json(res, status, body, cookies = []) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
    ...SECURITY,
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  });
  res.end(data);
}

function text(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(new GameError(413, 'That request is too large.'));
      if (!size) return resolve({});
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return reject(new GameError(415, 'Send JSON.'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new GameError(400, 'That is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Fixed-window counters per key, e.g. new guests per IP per hour.
function rateLimiter(now) {
  const windows = new Map();
  return {
    hit(key, max, ms) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= ms) {
        w = { start: t, n: 0 };
        windows.set(key, w);
      }
      if (windows.size > 10_000) for (const [k, v] of windows) if (t - v.start >= 36e5) windows.delete(k);
      return ++w.n <= max;
    },
  };
}
