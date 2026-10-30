# Fangbound

A browser monster auto-battler: pick 3 monsters, counter the opponent's elements, watch
the auto battle, and climb a ranked season. One small Node server decides every ranked
match and keeps all progress; the browser only shows it and plays battles back.
The game's token will be $FANG (not live yet), and the site will be fangbound.com.

```bash
npm run dev       # http://localhost:4380, restarts when server files change
npm start         # same, without the restart
npm test          # sim, progression, API, sign-in and anti-cheat tests
npm run balance   # win rate per monster over 20k random battles
npm run media     # re-render portraits and the hero videos (headless Chrome + ffmpeg)
node tools/render-media.mjs all --theme halloween   # the Night of Fangs media (costumes, haunted hero)
npm run vendor    # copy three.js from node_modules into vendor/
```

`/` is the landing page (hero video, roster, live leaderboard); `/play` is the game.

Needs Node 22.13 or newer (it uses the built-in `node:sqlite`). Running the game needs no npm
packages: three.js is vendored in `vendor/three` and the media in `media/` is pre-rendered.
`npm install` only adds the dev tools (three.js source and puppeteer-core) for `npm run media`.

## What is in it

- Real-time 3D in a dark fantasy look: every monster is a model built in code
  (`src/three/monsters.js`) with dark PBR hides and shells, glowing eyes, horns and element
  light (lava cracks, runes, charged stripes, bioluminescence). They fight in a ruined stone
  ring floating over a sea of fire, under storm clouds and a blood moon, with braziers, rune
  pillars, lightning, soft shadows, bloom and color grading (`src/three/stage.js`). Hits draw
  slashes and sparks, skills a rune circle and a column of light, and defeated monsters burn
  away. The lobby shows your squad on a stone altar. Without WebGL the game falls back to 2D art.
- The UI (`src/style.css`, `src/landing.css`) is near-black stone with gold trim, set in
  Cinzel and Barlow Semi Condensed; element and role icons are SVG glyphs (`glyph()` in `src/art.js`).
- The game fills the window. On wide screens the lobby is the live 3D arena with your squad
  in it (`src/showcase.js`) and smoked-glass panels at the edges, the scout screen shows both
  teams facing off where the battle will happen, and the battle runs edge to edge with its
  HUD on top. Monsters shows the collection beside the chosen monster, Season puts the prize
  pool, leaderboard and your standing side by side. Phones and tablets stack and scroll;
  monitors from 2200 px wide scale the panels up.
- Portraits (`media/mon/*.webp`) and the landing-page loop (`media/hero-*.mp4`) are rendered
  from the same 3D code by `tools/render-media.mjs`, so they always match the game.

- 15 monsters across 5 elements (Ember > Bloom > Stone > Volt > Tide > Ember) and 3 roles
  (Guard, Striker, Mystic), each with a mana skill.
- Deterministic battle sim (`src/sim.js`): the same seed and lineups give the same battle
  on the server and in every browser.
- Ranked PvP: wallet players fight other wallet players' defense teams within ±150 RP.
  Your defense is the team from your last ranked match; each defense moves your rating
  by half of what an attack would, and the game sums up attacks when you come back.
  Bots fill in when nobody is close, and guests fight bots only.
- Bronze to Mythic, 14-day seasons with a soft reset, and a real leaderboard of wallet players.
- Balanced roster: every monster wins about 48–52% of random-lineup battles at Lv 1 and
  Lv 10 (`node tools/balance.mjs 30000 10`); the 2026-10-30 pass tuned HP and ATK and bumped
  SIM_VERSION to 2.
- Monster levels (max 10). Rarity sets how hard a monster is to get, never how strong it
  is: the six starters are Common, eggs offer Rare and Epic monsters (weights 3 : 1, and an
  Epic at least every 4 egg offers), and the event monster is Event. An egg comes every
  3 ranked wins, at most 3 a day; the pass, invites and the shop add more.
- The $FANG shop (`src/shop.js`): pay to go faster, never to be stronger. Eggs, training
  tomes, essence, XP ×2 for 24 h, an extra quest swap, raid tickets and the premium pass,
  each with a daily limit; everything can also be earned by playing, and nothing sold
  changes a battle. Until $FANG is live the shop is shown but closed (`SHOP=off`);
  `SHOP=test` gives every player a separate test balance for local testing.
- Evolution: a Lv 10 monster evolves for 60 essence into its evolved form (an element
  title, e.g. Infernal Cindertusk, +15% HP and ATK). Essence is the XP a Lv 10 monster
  earns past the cap, from matches and pass tomes. Evolved monsters wear a floating crown
  of element crystals, an element rim light and an aura in 3D (`ascend()` in
  `src/three/monsters.js`) and have their own portraits (`media/mon/<id>-evo.webp`).
- Challenge a friend: your squad as a link (`/play#c=<id>`, a week long). Each friend fights
  it once as a friendly duel, decided on the server like ranked but with no rating, XP or
  quests at stake; you see the results in your challenge log, and both get the replay.
- Invites: anyone new who joins through your challenge link or invite link (`/?ref=<code>`)
  counts as your invite. When they win 3 ranked matches with a wallet, you both get an egg
  and +300 pass XP (at most 20 paid invites per player).
- Daily quests and a season pass (`src/pass.js`, shared by server and browser). Three
  quests a day (one swap a day), a bonus for finishing all three, and a 7-day check-in
  streak, all paying pass XP; ranked matches pay it too (the first 20 a day). The pass has
  30 tiers per season with training tomes (XP for the squad), eggs and titles on the free
  track. The premium track is shown but locked until $FANG launches. Titles show on
  the leaderboard, in the versus screen and in battle. The server counts quest progress
  from its own simulation of each ranked match.
- Seasonal events (`src/event.js`), switched by one setting (`EVENT`): the server stamps the
  running event on every page (`<html data-event>`), and that flips the whole look and turns
  the event content on. The first one is **Night of Fangs** (Halloween, 24 Oct to 8 Nov):
  - every monster wears a costume with its own name and portrait (Gourdtusk with a carved
    pumpkin on its back, Hexowl in a witch hat, Grimlash in a reaper hood, Batcub with bat
    wings…; `haunt()` in `src/three/halloween.js`), and defeated monsters give up a ghost;
  - the arena becomes a graveyard under a huge orange moon: a sea of witch fire, pumpkin
    lanterns, tombstones, dead trees, drifting ghosts and bats across the moon;
  - candy from ranked matches (+12 a win, +5 a loss, the same counted matches as pass XP) and
    a daily trick-or-treat (candy, a pumpkin egg, or a trick);
  - pumpkin eggs (150 candy) hatch **Hollowjack**, the event monster (Ember mystic), then
    training tomes; normal eggs and bots never use event monsters;
  - the **Hollow King** raid boss: three raids a day with your squad, decided on the server
    (a 1-against-3 battle), candy for damage dealt, replay links like any match;
  - event quests with titles (Pumpkin Knight, Hollowbane, Candy Fiend, Lantern Bearer) and
    community gifts unlocked by everyone's damage to the king (Night Warden at 3,000,000);
  - an orange and purple UI with cobwebs, a Halloween tab, a lobby card and a landing banner.
- A first-match tutorial (`src/tutorial.js`, `src/coach.js`): a brand-new player gets coach
  marks (spotlight and card) on the squad, the front line and the element cycle, then a
  training battle against Coach Ravel, whose team each starter counters. The server
  decides it like any match (on the first seed the squad wins), with no rating at stake,
  and the battle pauses on its first attack, super-effective hit, skill and knockout to
  explain them. The first training battle pays 150 pass XP and a training tome. It can be
  skipped (the reward waits) and replayed from "How to play" in the lobby.
- Accounts: every visitor starts as a guest. Connecting a Solana wallet (Phantom,
  Solflare, Backpack or any Wallet Standard wallet) signs one message, no transaction,
  and ties the progress to the wallet so it works on any device.

## Why the browser can't cheat

| Attempt | What stops it |
| --- | --- |
| Pick the winner in the browser | The server runs the sim and saves the result before playback starts. |
| Try lineups against the seed offline | The seed stays on the server until the lineup is locked in with Fight. |
| Skip bad matchups | A found opponent stays until it is fought, even after leaving or reloading. |
| Reroll an egg | The three egg choices are stored and stay until one is hatched. |
| Use monsters you don't own | Every lineup is checked against the roster on the server. |
| Feed wins from alt accounts | The server picks opponents. Guests never meet real players. A defense is the team from the owner's last ranked match, so a weak one costs them rating first, and a defender just fought is skipped for the next 5 matches. |
| Spam fights with a script | At most one fight every 2 seconds per player; new guests and sign-ins are rate limited per IP. |
| Reuse or forge a sign-in | Messages name the site, expire after 10 minutes and carry a nonce that works once. |
| Fake a replay | Replay links are match ids; the server returns the recorded inputs and result. |

## API

| Route | Does |
| --- | --- |
| `POST /api/session` | Resume the session, or start a guest one (`{ ref }` or `{ challenge }` ties a new guest to whoever shared the link); `away` sums up defenses, challenge fights and paid invites since the last visit |
| `GET /api/me` | Player state, waiting opponent, recent matches, defense log, season |
| `POST /api/auth/sign-in` / `sign-out` | Wallet sign-in with a signed message; sign out |
| `POST /api/lineup`, `POST /api/profile` | Save the lineup, the trainer name |
| `POST /api/match/find` | The waiting opponent, or a new one: a player's defense or a bot (no seed) |
| `POST /api/match/fight` | Lock the lineup; the server simulates and scores the match |
| `GET /api/match/:id` | A finished match, for replay links |
| `POST /api/egg/open`, `POST /api/egg/hatch` | Egg choices; hatch one |
| `POST /api/monster/evolve` | Evolve a Lv 10 monster (`{ id }`) for essence |
| `POST /api/challenge` | Your squad as a challenge link (the same squad reuses its open link) |
| `GET /api/challenge/:id` | Whose challenge, and whether you can still fight it |
| `POST /api/challenge/fight` | Fight a friend's challenge once (`{ id, lineup }`), no rating |
| `POST /api/daily/checkin` | Today's check-in (pass XP, streak) |
| `POST /api/quest/reroll` | Swap one unfinished quest (`{ slot }`), once a day |
| `POST /api/pass/claim` | Claim a tier (`{ tier, track }`) or everything reached (`{ all: true }`) |
| `POST /api/title` | Wear an earned title (`{ id }`), or none (`{ id: null }`) |
| `POST /api/event/treat` | Today's trick-or-treat (during an event) |
| `POST /api/event/egg` | Open a pumpkin egg for candy |
| `POST /api/event/raid` | Raid the Hollow King with a lineup (`{ lineup }`), three a day |
| `POST /api/event/gift` | Claim a reached community gift (`{ i }`) |
| `POST /api/tutorial/fight` | The tutorial's training battle (`{ lineup }`); no rating, reward once |
| `POST /api/tutorial/skip` | Skip the tutorial (the reward stays for a later training battle) |
| `POST /api/shop/buy` | Buy a shop item (`{ item }`) with $FANG (closed until launch; test balance with `SHOP=test`) |
| `GET /api/leaderboard` | This season's top 10, your rank, last season's final standings |
| `GET /api/token` | $FANG: `status` (`not-configured`, `not-launched`, `unavailable`, `live`); once live the contract address, pool, on-chain facts and curve; the prize pool (`share`, `wallet`, `sol`) and the X link |

## $FANG launch

The landing page finds the launch by itself (`server/launch.js`): the server reads the launch
wallet's history every 8 s and takes the first Meteora DBC pool it created, signed by that
wallet, after `FANG_SINCE`, with the symbol `FANG`. The page then shows the contract address,
Copy, Buy (Jupiter), Chart (DexScreener), the bonding curve and eight on-chain facts within
about 10 s, without a deploy. **Never test-launch from the launch wallet:** the first FANG
launch it makes becomes the official contract address. `FANG_MINT` pins one by hand if needed.

The season prize pool is a public wallet (`FANG_POOL_WALLET`): its SOL balance is the pool
shown on the page, with a Solscan link, so anyone can check it. Pay the frozen top 3 from it
at the end of each season and post the transactions.

`node tools/dev-live.mjs` (port 4382) previews the live page with the real $CTAP launch.
`node brand/render.mjs` writes the token logo, X avatar and X banners to `brand/out/`.

## Settings (environment)

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `4380` | |
| `DATA_DIR` | `./data` | Where `fangbound.db` lives. Use persistent storage when deployed. |
| `SEASON_START` | `2026-10-26T00:00:00Z` | Start of season 1; each season is 14 days. |
| `PUBLIC_HOST` | request Host | The domain sign-in messages must name, e.g. `fangbound.com`. |
| `TRUST_PROXY` | off | `1` behind a proxy (Coolify): read client IP and https from `X-Forwarded-*`. |
| `COOKIE_SECURE` | auto | `1`/`0` to force the Secure cookie flag. |
| `SHOP` | `off` | The $FANG shop: `off` until the token is live, `test` for local test balances (never real). |
| `EVENT` | `auto` | Seasonal event: `auto` runs each one between its dates, `off` turns events off, `halloween` forces Night of Fangs. |
| `FANG_CREATOR` | in `server/launch.js` | The launch wallet $FANG is launched from (public address). Empty: the page says "launching soon". |
| `FANG_SINCE` | `2026-10-30T00:00:00Z` | Only launches after this count. |
| `FANG_SYMBOL` | `FANG` | The launch must carry this symbol; empty turns the check off. |
| `FANG_MINT` | none | Pins the contract address by hand (wins over detection). |
| `FANG_POOL_WALLET` | in `server/token.js` | The public prize pool wallet; its balance is the pool shown. |
| `FANG_POOL_SHARE` | in `server/token.js` | Percent of creator fees that fills each season's pool, e.g. `30`. |
| `FANG_POOL_TOPUP` | `1` | `1`: the page says the creator also tops the pool up; `0` turns that line off. |
| `FANG_X` | in `server/token.js` | The X account (`@name` or a link); shows the X links on the landing page. |
| `SOLANA_RPC` | Helius, then publicnode | Comma-separated mainnet RPC URLs, tried in order. |

The `Dockerfile` runs the server with `TRUST_PROXY=1`; mount persistent storage at `/app/data`.
Every 6 hours the server makes sure there is a copy of the database for today in
`DATA_DIR/backups` (the newest 7 days are kept). Those copies sit on the same volume, so copy
one off the server now and then.

## Layout

| File | Role |
| --- | --- |
| `server/index.js` | entry: settings, database, HTTP server |
| `server/app.js` | API routes, sessions, static files |
| `server/game.js` | matchmaking, matches, defenses, eggs, leaderboard, season close |
| `server/auth.js`, `server/base58.js` | wallet signature checks, session cookies |
| `server/db.js` | SQLite schema |
| `server/launch.js`, `server/token.js` | $FANG launch detection and on-chain facts; the prize pool and links |
| `server/backup.js` | daily database copies |
| `src/data.js`, `src/sim.js` | monsters and the battle engine (shared with the server) |
| `src/state.js`, `src/match.js` | progression rules and bots (shared with the server) |
| `src/pass.js` | daily quests, check-in streak, season pass and titles (shared) |
| `src/signin.js` | the sign-in message format (shared) |
| `src/tutorial.js`, `src/coach.js` | the first-match tutorial: the training team and reward (shared); coach marks |
| `src/shop.js` | the $FANG shop: items, prices, daily limits, boosters (shared) |
| `src/event.js` | seasonal events: Night of Fangs candy, treats, eggs, raid, quests, gifts (shared) |
| `src/theme.js` | the page's running event look, read from `<html data-event>` |
| `src/three/halloween.js` | costumes, Hollowjack and the Hollow King, the haunted arena |
| `src/main.js`, `src/views.js` | the game's screens and controller |
| `src/battle.js`, `src/battle3d.js` | battle playback; the 3D view (the 2D view is the fallback) |
| `src/three/` | 3D kit, monster models, arena stage, team formations |
| `src/showcase.js` | the lobby's 3D squad |
| `src/art.js` | 2D SVG art for the no-WebGL fallback and the logo |
| `index.html`, `src/landing.*` | landing page |
| `tools/studio.html` | dev page for the 3D scenes; also the render source |
| `tools/render-media.mjs`, `tools/shot.mjs` | media renders; quick screenshots |
| `src/api.js`, `src/wallet.js` | server calls, wallet connect |
| `tools/balance.mjs` | balance report |
| `tools/dev-live.mjs` | local preview with $FANG live (real $CTAP data) |
| `brand/render.mjs` | token logo, X avatar and banners (`brand/out/`) |

## Next steps

1. Deploy at fangbound.com (Coolify), playtest with real people, tune with `npm run balance`.
2. Launch $FANG, then route a share of trading fees into the season prize pool and
   pay the frozen top 3 on-chain.
3. Optional: token sinks (evolve, cosmetics) and monsters as tradable on-chain assets.
