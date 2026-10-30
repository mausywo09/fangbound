// HTML builders for every screen and modal. Pure: state in, markup out.
import { MONSTERS, BY_ID, ELEMENTS, ELEMENT_ORDER, ROLES, RARITIES, elementMult, ADVANTAGE, DISADVANTAGE, monName, EVO_TITLE } from './data.js';
import { logoArt, glyph } from './art.js';
import { levelMult, MAX_LEVEL, SIM_VERSION, EVO_MULT } from './sim.js';
import { tierOf, nextTier, xpToNext, lockedIds, WINS_PER_EGG, WIN_EGGS_PER_DAY, EPIC_PITY, SEASON_DAYS, NAME_MAX, EVOLVE_COST, evolveBlock } from './state.js';
import { SHOP_ITEMS, BURN_SHARE, buyBlock, boostLeft, boughtToday } from './shop.js';
import { TUTORIAL_XP, TUTORIAL_TOME } from './tutorial.js';
import {
  QUESTS, questText, DAILY_BONUS, CHECKIN, canCheckIn, nextStreak, PASS_TIERS, TIER_XP, passTier, tierReward, rewardLabel,
  claimable, TITLES, MATCH_XP, MATCH_XP_DAILY, REF_WINS, REF_XP,
} from './pass.js';
import { CANDY, EGG_COST, BOSS, EVENT_QUESTS, GIFTS, COSTUME_NAMES, canTreat, bossTriesLeft, giftReady } from './event.js';
import { THEME } from './theme.js';

const SLOTS = ['Front', 'Middle', 'Back'];
const pct = (x) => `${Math.round(x * 100)}%`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Rendered 3D portraits (tools/render-media.mjs); every monster faces right. evo: the evolved
// form. During Night of Fangs every monster shows in its costume (<id>-hw.webp).
const costumed = (id) => THEME === 'halloween' && Object.hasOwn(COSTUME_NAMES, id);
export const portrait = (id, evo = false) => `<img class="pt" src="/media/mon/${id}${evo ? '-evo' : ''}${costumed(id) ? '-hw' : ''}.webp" alt="" draggable="false" decoding="async">`;
const star = (evo) => (evo ? '<i class="star" title="Evolved">★</i>' : '');
// On narrow cards the evolved title sits on its own small line above the name.
const cardName = (id, evo) => (evo ? `<span class="evo-t">${EVO_TITLE[BY_ID[id].element]}</span>${BY_ID[id].name}` : BY_ID[id].name);
const eggImg = '<img class="pt" src="/media/mon/egg.webp" alt="" draggable="false">';
const short = (wallet) => `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
const medal = (rank) => (rank <= 3 ? `<i class="medal m${rank}">${['I', 'II', 'III'][rank - 1]}</i>` : rank);

const color = (id) => ELEMENTS[BY_ID[id].element].color;
const elTag = (el) => `<span class="eltag" style="--c:${ELEMENTS[el].color}">${glyph(el)} ${ELEMENTS[el].name}</span>`;
const elIcon = (el) => `<span class="elicon" style="--c:${ELEMENTS[el].color}" title="${ELEMENTS[el].name}">${glyph(el)}</span>`;
const roleTag = (r) => `${glyph(r)} ${ROLES[r].name}`;
// How rare a monster is to hatch (all are balanced in battle).
const rarityTag = (id) => { const r = RARITIES[BY_ID[id].rarity]; return `<i class="rar" style="--r:${r.color}">${r.name}</i>`; };
const fang = (n) => `<span class="fang">${glyph('all')}<b>${Number(n).toLocaleString('en-US')}</b></span>`;
// A worn season-pass title, e.g. "Rune Seeker" (empty for none).
export const titleTag = (id) => (id && TITLES[id] ? `<i class="ttl">${TITLES[id]}</i>` : '');
const passReady = (me) => canCheckIn(me.player, me.today.day) || claimable(me.player).length > 0;
// Something to do on the event screen: a door to knock on, raids left, an egg or a gift.
const eventReady = (me) => {
  const s = me.player;
  if (!me.event || s.event?.id !== me.event.id) return false;
  return canTreat(s, me.today.day) || bossTriesLeft(s) > 0 || s.event.candy >= EGG_COST || GIFTS.some((_, i) => giftReady(s, i, me.event.total));
};
const candyTag = (n) => `<span class="candy">${glyph('candy')}<b>${n.toLocaleString('en-US')}</b></span>`;
const big = (n) => n.toLocaleString('en-US');

export function tierBadge(rating, cls = '') {
  const t = tierOf(rating);
  return `<span class="tier ${cls}" style="--t:${t.color}"><i><span>${t.name[0]}</span></i>${t.name}</span>`;
}

export function countdown(ts, now = Date.now()) {
  let ms = Math.max(0, ts - now);
  const d = Math.floor(ms / 864e5);
  ms -= d * 864e5;
  const h = Math.floor(ms / 36e5);
  ms -= h * 36e5;
  const m = Math.floor(ms / 6e4);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}

// me: the /api/session payload, or null while it loads.
export function header(me, tab, replay) {
  const tabs = [['battle', 'Battle', 'striker'], ...(me?.event ? [['event', 'Halloween', 'pumpkin']] : []), ['pass', 'Pass', 'ribbon'], ['monsters', 'Monsters', 'claw'], ['season', 'Season', 'crown']];
  const evolveReady = (p) => Object.keys(p.owned).some((id) => !evolveBlock(p, id));
  const dot = (k) => {
    if (k === 'pass' && me?.today && passReady(me)) return '<i class="dot" title="Something to claim"></i>';
    if (k === 'monsters' && s && evolveReady(s)) return '<i class="dot" title="A monster can evolve"></i>';
    if (k === 'event' && me?.today && eventReady(me)) return '<i class="dot" title="Something waiting at the Night of Fangs"></i>';
    return '';
  };
  const s = me?.player;
  const acct = !me ? '' : me.wallet
    ? `<button class="acct on" data-act="account" title="${esc(me.wallet)}"><i></i>${short(me.wallet)}</button>`
    : '<button class="acct" data-act="connect"><span class="long">Connect wallet</span><span class="short">Connect</span></button>';
  // The logo leads back to the landing page (the Battle tab is the game's own home).
  return `<a class="brand" href="/" title="Back to the Fangbound home page"><i class="back" aria-hidden="true"></i>${logoArt()}<span>FANGBOUND</span><em>alpha</em></a>
<nav class="tabs">${tabs.map(([k, n, g]) => `<button class="tab ${k === 'event' ? 'ev' : ''} ${!replay && tab === k ? 'on' : ''}" data-act="tab" data-arg="${k}">${glyph(g)}<span>${n}</span>${dot(k)}</button>`).join('')}</nav>
<div class="hright"><button class="shopbtn ${tab === 'shop' && !replay ? 'on' : ''}" data-act="tab" data-arg="shop" title="The $FANG shop">${glyph('all')}<span>${me?.shop?.mode === 'test' ? Number(me.shop.balance).toLocaleString('en-US') : 'Shop'}</span></button>${me?.event && s?.event ? candyTag(s.event.candy) : ''}${s ? `<div class="me">${tierBadge(s.rating)}<div><b>${s.rating}</b><small>${s.wins}W · ${s.losses}L</small></div></div>` : ''}${acct}</div>`;
}

export const loadingView = () => '<section class="center"><div class="spinner"></div><p class="muted">Loading your monsters…</p></section>';

export const offlineView = (msg) => `<section class="center"><div class="card"><h2>Can't reach the game server</h2>
<p class="muted">${esc(msg)}</p><button class="btn primary" data-act="retry">Try again</button></div></section>`;

function matchHint(id, opp) {
  const el = BY_ID[id].element;
  let up = 0;
  let down = 0;
  for (const m of opp.team) {
    const e = BY_ID[m.id].element;
    if (elementMult(el, e) > 1) up++;
    if (elementMult(e, el) > 1) down++;
  }
  if (!up && !down) return '<div class="hint"><span class="even">Even matchup</span></div>';
  return `<div class="hint">${up ? `<span class="up">▲ strong vs ${up}</span>` : ''}${down ? `<span class="down">▼ weak vs ${down}</span>` : ''}</div>`;
}

// Your squad faces right on every screen (as in battle), so the cards run Back, Middle,
// Front from the left (CSS row-reverse) and ◀ moves a monster toward the back.
export function lineupEditor(s, opp) {
  return `<div class="slots">${s.lineup.map((id, i) => {
    const d = BY_ID[id];
    const { level, evo } = s.owned[id];
    return `<div class="slot ${evo ? 'evo' : ''}" style="--c:${color(id)}">
  <button class="slot-art" data-act="slot" data-arg="${i}" aria-label="Change ${SLOTS[i]} monster">${portrait(id, evo)}<span class="swap">Change</span></button>
  <div class="slot-info">
    <div class="slot-l">${SLOTS[i]}${!evo && !evolveBlock(s, id) ? '<em class="evo-ready">Evolve ready</em>' : ''}</div>
    <div class="slot-n">${cardName(id, evo)}</div>
    <div class="slot-m">${elIcon(d.element)} ${roleTag(d.role)} · Lv ${level}${star(evo)}</div>
    ${opp ? matchHint(id, opp) : ''}
  </div>
  <div class="slot-mv"><button data-act="move" data-arg="${i}:1" ${i === 2 ? 'disabled' : ''} aria-label="Move back">◀</button><button data-act="move" data-arg="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Move forward">▶</button></div>
</div>`;
  }).join('')}</div>`;
}

const elementChain = () => `<div class="wheel">${ELEMENT_ORDER.map((e) => `<span class="elx" style="--c:${ELEMENTS[e].color}">${glyph(e)}<b>${ELEMENTS[e].name}</b></span>`).join('<i>›</i>')}<i>›</i><span class="elx again" style="--c:${ELEMENTS.ember.color}">${glyph('ember')}</span></div>`;

export function elementWheel() {
  return `<h3>Element cycle</h3>
${elementChain()}
<p class="muted small">Each element hits the next one for +${pct(ADVANTAGE - 1)} and the one before it for −${pct(1 - DISADVANTAGE)}.</p>`;
}

function eggCard(s) {
  const left = lockedIds(s).length;
  if (!left && !s.eggs) return `<div class="card egg done"><div class="egg-art">${eggImg}</div><div><h3>Collection complete</h3><small class="muted">All ${MONSTERS.filter((m) => !m.event).length} monsters hatched.</small></div></div>`;
  if (s.eggs) {
    return `<div class="card egg ready"><div class="egg-art">${eggImg}</div><div class="egg-txt"><h3>${s.eggs} egg${s.eggs > 1 ? 's' : ''} ready!</h3><small class="muted">Hatch to add a new monster.</small></div><button class="btn primary" data-act="hatch">Hatch</button></div>`;
  }
  return `<div class="card egg"><div class="egg-art">${eggImg}</div><div class="egg-txt"><h3>Next egg</h3><small class="muted">${s.eggWins}/${WINS_PER_EGG} ranked wins · ${left} monsters left · up to ${WIN_EGGS_PER_DAY} eggs a day</small><div class="prog sm"><i style="width:${(100 * s.eggWins) / WINS_PER_EGG}%"></i></div></div></div>`;
}

const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

export function ago(ts, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - ts) / 6e4));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function historyCard(history) {
  if (!history.length) return '<div class="card"><h3>Recent matches</h3><p class="muted small">No matches yet. Find your first opponent.</p></div>';
  return `<div class="card"><h3>Recent matches</h3><div class="hist">${history.map((h) => `<div class="hrow ${h.won ? 'w' : 'l'}">
  <span class="res">${h.won ? 'W' : 'L'}</span><span class="who">vs ${esc(h.opp)}${h.bot ? ' <i class="bot">BOT</i>' : ''}<small>${tierOf(h.oppRating).name} · ${h.oppRating}</small></span>
  <span class="d">${signed(h.delta)}</span><button class="btn ghost sm" data-act="watch" data-arg="${h.id}">Watch</button></div>`).join('')}</div></div>`;
}

// Wallet players only: other players fight the team from their last ranked match.
function defenseCard(s, defenses) {
  const team = s.defense
    ? `<div class="defteam">${s.defense.map((m) => `<span style="--c:${color(m.id)}" title="${monName(m.id, m.evo)} · Lv ${m.level}">${portrait(m.id, m.evo)}<small>Lv ${m.level}${star(m.evo)}</small></span>`).join('')}</div>`
    : '<p class="muted small">Play a ranked match to set your defense team.</p>';
  const log = defenses.length
    ? `<div class="hist">${defenses.map((d) => `<div class="hrow ${d.won ? 'w' : 'l'}">
  <span class="res">${d.won ? 'W' : 'L'}</span><span class="who">${esc(d.attacker)} attacked<small>${d.won ? 'held' : 'broke through'} · ${ago(d.played)}</small></span>
  <span class="d">${signed(d.delta)}</span><button class="btn ghost sm" data-act="watch" data-arg="${d.id}">Watch</button></div>`).join('')}</div>`
    : '<p class="muted small">Nobody has attacked your team yet.</p>';
  return `<div class="card">
  <div class="card-h"><h2>${glyph('guard', 'h')} Your defense</h2><small class="muted">half the RP of an attack</small></div>
  ${team}
  <p class="muted small note">Your defense is the team from your last ranked match. Players near your rating fight it while you are away.</p>
  <h3 class="sub">Defense log</h3>${log}
</div>`;
}

const guestCard = () => `<div class="card guest"><div><h3>Playing as a guest</h3>
  <small class="muted">Guests fight bots. Connect a Solana wallet to fight real players, rank on the season leaderboard and keep this progress on any device. Free, no transaction.</small></div>
  <button class="btn primary" data-act="connect">Connect wallet</button></div>`;

// ---- friends: challenge links and invites ----

function friendsCard(me) {
  const s = me.player;
  const f = me.friends;
  const log = f.log.length
    ? `<div class="hist">${f.log.slice(0, 3).map((r) => `<div class="hrow ${r.held ? 'w' : 'l'}">
  <span class="res">${r.held ? 'W' : 'L'}</span><span class="who">${esc(r.name)} took it<small>${r.held ? 'your squad held' : 'they beat it'} · ${ago(r.played)}</small></span>
  <span></span><button class="btn ghost sm" data-act="watch" data-arg="${r.id}">Watch</button></div>`).join('')}</div>`
    : '<p class="muted small">Nobody has taken your challenge yet.</p>';
  const mine = s.ref && !s.ref.done
    ? `<div class="refme">${glyph('egg')}<span>Invited by <b>${esc(s.ref.name)}</b>: ${me.wallet ? `${s.ref.wins}/${REF_WINS} wallet wins` : `connect a wallet and win ${REF_WINS} ranked matches`} and you both get an egg and +${REF_XP} pass XP.</span></div>`
    : '';
  return `<div class="card friends">
  <div class="card-h"><h3>Challenge a friend</h3><small class="muted">no rating at stake</small></div>
  <p class="muted small">Send your squad as a link. Each friend gets one try, and you see how it went.</p>
  <div class="share2"><button class="btn primary sm" data-act="challenge" data-arg="x">Share on X</button><button class="btn sm" data-act="challenge" data-arg="copy">Copy link</button></div>
  <h3 class="sub">Challenge log</h3>${log}
  <div class="invites"><span><b>${s.invites.joined}</b> joined</span><span><b>${s.invites.paid}</b> rewarded</span><button class="linkbtn" data-act="invite">Copy invite link</button></div>
  <p class="muted small note">Friends who join through your links count as your invites. When one wins ${REF_WINS} ranked matches with a wallet, you both get an egg and +${REF_XP} pass XP.</p>
  ${mine}
</div>`;
}

export function duelResultModal(o, match) {
  return `<div class="result ${o.won ? 'win' : 'lose'}">
  <h1>${o.won ? 'VICTORY' : 'DEFEAT'}</h1>
  <p class="duel-sub">${o.won ? `You beat ${esc(o.from)}'s challenge!` : `${esc(o.from)}'s squad held.`}</p>
  <p class="muted small">A friendly duel: no rating, XP or quests at stake.</p>
  <div class="xp">${match.a.team.map((m) => `<div class="xpm" style="--c:${color(m.id)}">${portrait(m.id, m.evo)}<b>${cardName(m.id, m.evo)}</b><small>Lv ${m.level}${star(m.evo)}</small></div>`).join('')}</div>
  <div class="row"><button class="btn primary" data-act="challenge" data-arg="x">Challenge them back</button><button class="btn" data-act="lobby">Play ranked</button></div>
  <div class="row"><button class="btn ghost sm" data-act="copy" data-arg="${match.id}">Copy replay link</button><button class="btn ghost sm" data-act="challenge" data-arg="copy">Copy my challenge link</button></div>
</div>`;
}

// ---- daily quests and the season pass ----

const QICON = { play: 'striker', win: 'crown', advantage: 'all', crit: 'volt', skill: 'mystic', ko: 'claw', flawless: 'guard' };

function questRow(q, i, canReroll) {
  const def = QUESTS[q.type];
  const icon = glyph(q.done ? 'check' : q.type === 'element' || q.type === 'role' ? q.p : QICON[q.type]);
  const c = q.type === 'element' && !q.done ? ` style="--c:${ELEMENTS[q.p].color}"` : '';
  return `<div class="quest ${q.done ? 'done' : ''}"><i class="qi"${c}>${icon}</i>
  <div class="qt"><b>${questText(q)}</b><div class="prog sm"><i style="width:${(100 * q.n) / def.goal}%"></i></div></div>
  <span class="qn">${q.n}/${def.goal}</span><span class="qx">+${def.xp}</span>${canReroll && !q.done ? `<button class="qr" data-act="reroll" data-arg="${i}" title="Swap this quest (one swap a day)" aria-label="Swap this quest">↻</button>` : ''}</div>`;
}

function questList(s, canReroll) {
  const d = s.daily;
  return `<div class="quests">${d.quests.map((q, i) => questRow(q, i, canReroll && !d.rerolled)).join('')}</div>
<div class="qbonus ${d.bonus ? 'done' : ''}">${glyph(d.bonus ? 'check' : 'mystic')}<span>${d.bonus ? 'Daily bonus earned' : 'Finish all three for the daily bonus'}</span><b>+${DAILY_BONUS} XP</b></div>`;
}

// Where the pass XP inside the current tier stands, 0..1.
const tierProgress = (xp) => (passTier(xp) >= PASS_TIERS ? 1 : (xp - passTier(xp) * TIER_XP) / TIER_XP);

function questsCard(me) {
  const s = me.player;
  const day = me.today.day;
  const next = nextStreak(s, day);
  const ready = claimable(s).length;
  return `<div class="card qcard">
  <div class="card-h"><h3>Daily quests</h3><small class="muted">new in ${countdown(me.today.end)}</small></div>
  ${canCheckIn(s, day) ? `<button class="btn primary checkin" data-act="checkin">${glyph('ember')} Day ${next} check-in · +${CHECKIN[next - 1]} XP</button>` : ''}
  ${questList(s, false)}
  <button class="minipass" data-act="tab" data-arg="pass"><span>${glyph('ribbon')} Pass tier <b>${passTier(s.pass.xp)}</b>/${PASS_TIERS}</span>${ready ? `<em>${ready} to claim</em>` : '<small>Open pass ›</small>'}<div class="prog sm"><i style="width:${tierProgress(s.pass.xp) * 100}%"></i></div></button>
</div>`;
}

function rewardBox(s, t, track, reached) {
  const r = tierReward(t, track);
  const taken = (track === 'premium' ? s.pass.paid : s.pass.free).includes(t);
  const open = track === 'free' || s.pass.premium;
  const state = taken ? 'claimed' : !open ? 'shut' : reached ? 'ready' : 'locked';
  const art = r.type === 'egg' ? eggImg : glyph(r.type === 'title' ? 'crown' : 'tome');
  const label = r.type === 'egg' ? '<b>Egg</b><small>Monster</small>' : r.type === 'title' ? `<b>${TITLES[r.id]}</b><small>Title</small>` : `<b>+${r.xp} XP</b><small>Tome</small>`;
  const extra = state === 'ready' ? '<em>Claim</em>' : taken ? `<i class="ok">${glyph('check')}</i>` : state === 'shut' ? `<i class="lk">${glyph('lock')}</i>` : '';
  const attrs = `class="rw ${track} ${state} ${r.type}" title="Tier ${t} · ${rewardLabel(r)}"`;
  return state === 'ready'
    ? `<button ${attrs} data-act="claim" data-arg="${t}:${track}">${art}${label}${extra}</button>`
    : `<div ${attrs}>${art}${label}${extra}</div>`;
}

const tierCol = (s, t, tier) => `<div class="tcol ${t <= tier ? 'reached' : ''} ${t === tier + 1 ? 'next' : ''}"><div class="tnum">${t}</div>${rewardBox(s, t, 'free', t <= tier)}${rewardBox(s, t, 'premium', t <= tier)}</div>`;

function checkinCard(me) {
  const s = me.player;
  const day = me.today.day;
  const can = canCheckIn(s, day);
  const next = nextStreak(s, day);
  const got = can ? next - 1 : s.checkin.streak;
  return `<div class="card">
  <div class="card-h"><h3>Daily check-in</h3><small class="muted">${can ? `day ${next} is ready` : `next in ${countdown(me.today.end)}`}</small></div>
  <div class="streak7">${CHECKIN.map((xp, i) => `<div class="pip ${i < got ? 'got' : ''} ${can && i === next - 1 ? 'next' : ''} ${i === CHECKIN.length - 1 ? 'big' : ''}"><span>Day ${i + 1}</span><b>+${xp}</b></div>`).join('')}</div>
  ${can ? `<button class="btn primary big" data-act="checkin">Check in · +${CHECKIN[next - 1]} XP</button>` : '<p class="muted small">Checked in today. Miss a day and the streak starts over.</p>'}
</div>`;
}

const premiumCard = (me) => {
  const s = me.player;
  if (s.pass.premium) return `<div class="card premium on"><h3>${glyph('crown')} Premium track unlocked</h3><p class="muted small">A second reward on every tier this season. Claim them on the track above.</p></div>`;
  const open = me.shop?.mode !== 'off';
  return `<div class="card premium"><h3>${glyph('lock')} Premium track</h3>
  <p class="muted small">A second reward on every tier: bigger tomes, three more eggs and three premium titles. It speeds you up; it doesn't make your monsters stronger. Part of every premium pass is burned.</p>
  ${open ? `<button class="btn primary" data-act="buy" data-arg="premium">Unlock · ${fang(SHOP_ITEMS.premium.price)} $FANG</button>` : '<span class="pill">coming with $FANG</span>'}</div>`;
};

function titlesCard(s) {
  const source = (id) => {
    for (let t = 1; t <= PASS_TIERS; t++) {
      for (const track of ['free', 'premium']) {
        const r = tierReward(t, track);
        if (r.type === 'title' && r.id === id) return `tier ${t}${track === 'premium' ? ' · premium' : ''}`;
      }
    }
    return Object.values(EVENT_QUESTS).some((q) => q.title === id) || GIFTS.some((g) => g.reward.id === id) ? 'Night of Fangs' : '';
  };
  const chips = Object.entries(TITLES).map(([id, name]) => (s.titles.includes(id)
    ? `<button class="tchip ${s.title === id ? 'on' : ''}" data-act="title" data-arg="${s.title === id ? '' : id}" title="${s.title === id ? 'Wearing it. Click to take it off.' : 'Wear this title'}">${s.title === id ? glyph('check') : ''}${name}</button>`
    : `<span class="tchip locked">${glyph('lock')}${name}<small>${source(id)}</small></span>`));
  return `<div class="card">
  <div class="card-h"><h3>Titles</h3><small class="muted">${s.titles.length}/${Object.keys(TITLES).length} earned</small></div>
  <p class="muted small">Your title shows on the leaderboard and when you face other players. Click an earned title to wear it.</p>
  <div class="tlist">${chips.join('')}</div>
</div>`;
}

export function passView(me) {
  const s = me.player;
  const p = s.pass;
  const tier = passTier(p.xp);
  const max = tier >= PASS_TIERS;
  const ready = claimable(s).length;
  const xp = (n) => n.toLocaleString('en-US');
  return `<section class="pass-v page">
<div class="page-h"><div><h1>Season ${s.season} Pass</h1><small class="muted">Ends in ${countdown(me.season.end)} · earn pass XP from ranked matches, daily quests and check-ins</small></div>
  ${ready ? `<button class="btn primary" data-act="claimall">Claim all (${ready})</button>` : ''}</div>
<div class="card pass-head">
  <div class="ptier"><span>Tier</span><b>${tier}</b></div>
  <div class="pbar">
    <div class="pbar-top"><b>${max ? 'Pass complete' : `Next: tier ${tier + 1}`}</b><span>${max ? `${xp(p.xp)} XP` : `${xp(p.xp - tier * TIER_XP)} / ${xp(TIER_XP)} XP`}</span></div>
    <div class="prog"><i style="width:${tierProgress(p.xp) * 100}%"></i></div>
    <small class="muted">${xp(p.xp)} XP this season · a ranked win gives ${MATCH_XP.win}, a loss ${MATCH_XP.loss} (the first ${MATCH_XP_DAILY} matches a day)</small>
  </div>
</div>
<div class="card track"><div class="track-scroll" id="track">
  <div class="lanes"><span></span><span class="fr">Free</span><span class="pr">${glyph('lock')} Premium</span></div>
  ${Array.from({ length: PASS_TIERS }, (_, i) => tierCol(s, i + 1, tier)).join('')}
</div></div>
<div class="pass-grid">
  <div class="card">
    <div class="card-h"><h2>Daily quests</h2><small class="muted">new quests in ${countdown(me.today.end)}</small></div>
    ${questList(s, true)}
    <p class="muted small note">${s.daily.rerolled ? 'You used today\'s quest swap.' : 'Swap one unfinished quest a day with ↻.'} Quests count ranked matches only.</p>
  </div>
  <div class="col">${checkinCard(me)}${premiumCard(me)}</div>
  ${titlesCard(s)}
</div>
</section>`;
}

// The pass part of the result screen: XP gained, the tier bar, finished quests.
function passGain(g) {
  if (!g) return '';
  const into = tierProgress(g.total);
  const note = g.to > g.from
    ? `<span class="tierup">Tier ${g.to} reached! Claim it on the Pass tab.</span>`
    : g.to >= PASS_TIERS ? 'Pass complete' : `Tier ${g.to} · ${Math.round((1 - into) * TIER_XP)} XP to tier ${g.to + 1}`;
  const lines = g.quests.map((q) => `<div class="qdone">${glyph('check')} ${q.text} <b>+${q.xp}</b></div>`);
  if (g.bonus) lines.push(`<div class="qdone">${glyph('mystic')} Daily bonus <b>+${DAILY_BONUS}</b></div>`);
  return `<div class="passgain">
  <div class="pg-top"><span>${glyph('ribbon')} Season pass</span><b>${g.xp ? `+${g.xp} XP` : 'Match XP used up today'}</b></div>
  <div class="prog"><i style="width:${into * 100}%"></i></div><small>${note}</small>${lines.join('')}
  ${g.to > g.from ? '<button class="btn sm" data-act="tab" data-arg="pass">Open the pass</button>' : ''}
</div>`;
}

export function lobby(me) {
  const s = me.player;
  const t = tierOf(s.rating);
  const nt = nextTier(s.rating);
  const prog = nt ? Math.max(0, (s.rating - t.min) / (nt.min - t.min)) : 1;
  // Wide screens: the 3D arena fills the screen behind three columns (player, squad,
  // activity). The camera frames the squad inside #frame. Narrow screens stack them.
  return `<section class="lobby">
<aside class="side l">
  <div class="card hero">
    <label class="namefield">Trainer <input data-input="name" maxlength="${NAME_MAX}" value="${esc(s.name)}" aria-label="Trainer name"></label>
    ${s.title ? `<div class="hero-title">${titleTag(s.title)}</div>` : ''}
    <div class="rankline">${tierBadge(s.rating, 'big')}<div class="rnum"><b>${s.rating}</b> RP<small>${nt ? `${nt.min - s.rating} RP to ${nt.name}` : 'Top tier reached'}</small></div></div>
    <div class="prog"><i style="width:${prog * 100}%;--t:${t.color}"></i></div>
    <div class="stats"><span><b>${s.wins}</b>wins</span><span><b>${s.losses}</b>losses</span><span><b>${s.streak}</b>streak</span><span><b>${s.peak}</b>peak</span></div>
    <button class="linkbtn howto" data-act="tutorial">${glyph('mystic')} How to play</button>
  </div>
  ${eggCard(s)}
  ${friendsCard(me)}
  ${me.wallet ? defenseCard(s, me.defenses) : guestCard()}
</aside>
<div class="mid">
  <div class="stagebox">
    <div class="scene" id="showcase"></div>
    <div class="mid-h"><span class="season">Season ${s.season} · ends in ${countdown(me.season.end)}</span><h1>Your squad</h1><small>Enemies hit your Front first</small></div>
    <div class="frame" id="frame"></div>
  </div>
  <div class="dock">
    ${lineupEditor(s)}
    <button class="btn primary big" data-act="find">${me.pending ? 'Back to your opponent' : 'Find ranked match'}</button>
  </div>
</div>
<aside class="side r">
  ${me.event ? eventCard(me) : ''}
  ${questsCard(me)}
  ${historyCard(me.history)}
  <div class="card">${elementWheel()}</div>
</aside>
</section>`;
}

// The versus screen: both teams face off in the 3D arena where the battle will happen.
// duel: the screen for a friend's challenge link (a friendly duel, nothing at stake).
// training: the tutorial's training battle.
export function scout(s, pending, { duel = false, training = false } = {}) {
  const o = pending.opp;
  const tag = training ? '<span class="pvp">TRAINING</span>' : duel ? '<span class="pvp">CHALLENGE</span>' : o.bot ? '<span class="bot" title="Bots scale with your rating">BOT</span>' : `<span class="pvp" title="${esc(o.wallet)}">PLAYER · ${short(o.wallet)}</span>`;
  return `<section class="scout">
<div class="stagebox">
  <div class="scene" id="showcase"></div>
  <div class="vs-head">
    <div class="vs-team a"><small>Your squad${s.title ? ` · ${TITLES[s.title]}` : ''}</small><b>${esc(s.name)}</b><span>${tierBadge(s.rating)}<em>${s.rating} RP</em></span></div>
    <div class="vs-mark"><i>VS</i><small>${training ? 'Training battle' : duel ? 'Friendly duel' : 'Opponent found'}</small></div>
    <div class="vs-team b"><small>${tag}${o.title && TITLES[o.title] ? ` · ${TITLES[o.title]}` : ''}</small><b>${esc(o.name)}</b><span>${tierBadge(o.rating)}<em>${o.rating} RP</em></span></div>
  </div>
  <div class="frame" id="frame"></div>
</div>
<div class="vs-dock">
  <div class="vs-side a">
    <div class="vs-cap"><h3>Set your lineup</h3><small class="muted">Counter their elements. ▲ means you deal +30%.</small></div>
    ${lineupEditor(s, o)}
  </div>
  <div class="vs-go">
    <button class="btn primary big ${duel || training ? 'long' : ''}" data-act="${training ? 'tutfight' : duel ? 'duel' : 'fight'}">${training ? 'Start training' : duel ? 'Accept challenge' : 'Fight'}</button>
    ${elementChain()}
    <p class="muted small note">${training
    ? `A training battle: no rating at stake. The first one pays ${TUTORIAL_XP} pass XP and a training tome.`
    : duel
    ? `A friendly duel: no rating, XP or quests at stake, and one try. ${esc(o.name)} sees the result, and you both get the replay.`
    : 'The server decides the battle the moment you press Fight. This opponent waits until then, and the team you fight with becomes your defense.'}</p>
    <button class="btn ghost sm" data-act="back">◀ Lobby</button>
  </div>
  <div class="vs-side b">
    <div class="vs-cap"><h3>${training ? `${esc(o.name)}'s team` : duel ? `${esc(o.name)}'s challenge` : o.bot ? 'Their team' : 'Their defense'}</h3><small class="muted">${training ? 'A training team: each one is weak to one of your starters.' : duel ? 'The squad they challenged you with.' : o.bot ? 'Bots scale with your rating.' : `${esc(o.name)}'s team from their last ranked match.`}</small></div>
    <div class="opp-team">${o.team.map((m, i) => {
    const d = BY_ID[m.id];
    return `<div class="mini ${m.evo ? 'evo' : ''}" style="--c:${color(m.id)}"><div class="mini-art">${portrait(m.id, m.evo)}</div><div class="slot-info"><div class="slot-l">${SLOTS[i]}</div><div class="slot-n">${cardName(m.id, m.evo)}</div><div class="slot-m">${elIcon(d.element)} ${roleTag(d.role)} · Lv ${m.level}${star(m.evo)}</div></div></div>`;
  }).join('')}</div>
  </div>
</div>
</section>`;
}

export function pickerModal(s, slot) {
  return `<div class="sheet-h"><h2>Choose your ${SLOTS[slot]}</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
<div class="grid">${MONSTERS.map((d) => {
    const o = s.owned[d.id];
    if (!o) return `<div class="mcard locked">${portrait(d.id)}<b>???</b><small>${d.event ? 'Pumpkin egg · Night of Fangs' : 'Hatch from an egg'}</small></div>`;
    const at = s.lineup.indexOf(d.id);
    return `<button class="mcard ${at >= 0 ? 'inl' : ''} ${o.evo ? 'evo' : ''}" data-act="pick" data-arg="${d.id}" style="--c:${color(d.id)}">${rarityTag(d.id)}${portrait(d.id, o.evo)}<b>${cardName(d.id, o.evo)}</b><small>${elIcon(d.element)} ${roleTag(d.role)} · Lv ${o.level}${star(o.evo)}</small>${at >= 0 ? `<em>${SLOTS[at]}</em>` : ''}</button>`;
  }).join('')}</div>`;
}

// sel: the monster shown in the side panel (wide screens). filter: 'all' or an element.
export function monstersView(s, sel, filter = 'all') {
  const owned = Object.keys(s.owned).length;
  const id = BY_ID[sel] ? sel : s.lineup[0];
  const list = MONSTERS.filter((d) => filter === 'all' || d.element === filter);
  const chip = (e) => `<button class="chip ${filter === e ? 'on' : ''}" data-act="filter" data-arg="${e}" style="--c:${e === 'all' ? '#e8bf6a' : ELEMENTS[e].color}">${glyph(e)}${e === 'all' ? 'All' : ELEMENTS[e].name}</button>`;
  return `<section class="mons page">
<div class="page-h"><div><h1>Monsters</h1><small class="muted">${owned}/${MONSTERS.length} collected · an egg every ${WINS_PER_EGG} ranked wins (up to ${WIN_EGGS_PER_DAY} a day) · eggs offer Rare and Epic monsters, an Epic at least every ${EPIC_PITY + 1} eggs</small></div>
  <div class="page-tools"><span class="essence" title="XP your Lv ${MAX_LEVEL} monsters earn past the cap. Evolving costs ${EVOLVE_COST}.">${glyph('mystic')}<b>${s.essence}</b> essence</span>
  <div class="filters">${['all', ...ELEMENT_ORDER].map(chip).join('')}</div></div></div>
<div class="mons-body">
  <div class="grid big">${list.map((d) => {
    const o = s.owned[d.id];
    const on = d.id === id ? 'sel' : '';
    if (!o) return `<button class="mcard locked ${on}" data-act="mon" data-arg="${d.id}">${rarityTag(d.id)}${portrait(d.id)}<b>???</b><small>${elIcon(d.element)} ${roleTag(d.role)}</small></button>`;
    const need = xpToNext(o.level);
    const bar = o.level >= MAX_LEVEL ? 100 : (100 * o.xp) / need;
    const at = s.lineup.indexOf(d.id);
    const ready = !o.evo && !evolveBlock(s, d.id);
    return `<button class="mcard ${on} ${o.evo ? 'evo' : ''}" data-act="mon" data-arg="${d.id}" style="--c:${color(d.id)}">${rarityTag(d.id)}${portrait(d.id, o.evo)}<b>${cardName(d.id, o.evo)}</b><small>${elIcon(d.element)} ${roleTag(d.role)} · Lv ${o.level}${star(o.evo)}</small><div class="prog sm"><i style="width:${bar}%"></i></div>${at >= 0 ? `<em>${SLOTS[at]}</em>` : ''}${ready ? '<em class="evo-ready">Evolve</em>' : ''}</button>`;
  }).join('')}</div>
  <aside class="card mon-side" style="--c:${color(id)}"><div class="sheet-h"><h2>${s.owned[id] ? monName(id, s.owned[id].evo) : '???'}</h2>${s.lineup.includes(id) ? `<span class="pill">In squad · ${SLOTS[s.lineup.indexOf(id)]}</span>` : ''}</div>${monsterDetail(s, id)}</aside>
</div>
</section>`;
}

const STAT_MAX = { hp: 1650, atk: 125, armor: 50, spd: 110 };

export const detailModal = (s, id) => `<div class="sheet-h"><h2>${s.owned[id] ? monName(id, s.owned[id].evo) : '???'}</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
${monsterDetail(s, id)}`;

// The evolution panel: the evolved form, what it still needs, and the button once ready.
function evolveBox(s, id) {
  const o = s.owned[id];
  if (!o) return '';
  const up = `+${pct(EVO_MULT - 1)} HP and ATK`;
  if (o.evo) return `<div class="evobox done">${glyph('crown')}<div><b>Evolved</b><small>${up}, a crown of ${ELEMENTS[BY_ID[id].element].name.toLowerCase()} crystals</small></div></div>`;
  const why = evolveBlock(s, id);
  const req = (name, have, need) => `<div class="req ${have >= need ? 'ok' : ''}"><span>${name}</span><div class="prog sm"><i style="width:${Math.min(100, (100 * have) / need)}%"></i></div><em>${Math.min(have, need)}/${need}</em></div>`;
  const hint = o.level < MAX_LEVEL ? `Monsters grow to Lv ${MAX_LEVEL} from ranked matches and pass tomes.` : `Essence comes from the XP your Lv ${MAX_LEVEL} monsters earn.`;
  return `<div class="evobox">
  <div class="evo-prev">${portrait(id, true)}</div>
  <div class="evo-info"><b>Evolve into ${monName(id, true)}</b><small>${up}</small>
    ${req('Level', o.level, MAX_LEVEL)}${req('Essence', s.essence, EVOLVE_COST)}
    ${why ? `<p class="muted small">${hint}</p>` : `<button class="btn primary" data-act="evolve" data-arg="${id}">${glyph('crown')} Evolve · ${EVOLVE_COST} essence</button>`}
  </div>
</div>`;
}

function monsterDetail(s, id) {
  const d = BY_ID[id];
  const o = s.owned[id];
  const lv = o?.level || 1;
  const k = levelMult(lv) * (o?.evo ? EVO_MULT : 1);
  const weakTo = ELEMENT_ORDER.find((e) => ELEMENTS[e].beats === d.element);
  const stats = [['HP', Math.round(d.hp * k), STAT_MAX.hp], ['ATK', Math.round(d.atk * k), STAT_MAX.atk], ['Armor', d.armor, STAT_MAX.armor], ['Speed', d.spd, STAT_MAX.spd]];
  return `<div class="detail" style="--c:${ELEMENTS[d.element].color}">
  <div class="detail-art ${o ? '' : 'locked'} ${o?.evo ? 'evo' : ''}">${portrait(id, o?.evo)}</div>
  <div class="detail-info">
    <div class="tags">${rarityTag(id)}${elTag(d.element)}<span class="eltag role">${roleTag(d.role)}</span>${o ? `<span class="eltag lv">Lv ${lv}${o.evo ? ' ★' : ''}</span>` : ''}</div>
    ${evolveBox(s, id)}
    ${costumed(id) && d.baseName ? `<p class="costume">${glyph('pumpkin')} ${d.baseName} in its Night of Fangs costume</p>` : ''}
    ${o ? `<p class="lore">${d.lore}</p>` : `<p class="lore">${d.event ? 'An event monster: it hatches from a pumpkin egg during the Night of Fangs.' : 'Not hatched yet. Win ranked matches to earn eggs.'}</p>`}
    <div class="statbars">${stats.map(([n, v, max]) => `<div class="sb"><span>${n}</span><div class="bar"><i style="width:${Math.min(100, (100 * v) / max)}%"></i></div><b>${v}</b></div>`).join('')}
      <div class="sb"><span>Crit</span><div class="bar"><i style="width:${d.crit * 400}%"></i></div><b>${pct(d.crit)}</b></div></div>
    <div class="skill"><b>${glyph('mystic')} ${d.skill.name}</b><p>${d.skill.desc(d.skill.p)}</p></div>
    <p class="muted small">Strong vs ${elTag(ELEMENTS[d.element].beats)} · Weak vs ${elTag(weakTo)}</p>
  </div>
</div>`;
}

const lbRow = (r) => `<div class="lrow ${r.you ? 'you' : ''} ${r.rank <= 3 ? 'top' : ''}"><span class="rk">${medal(r.rank)}</span>
  <span class="nm">${esc(r.name)}${r.you ? ' <em>you</em>' : ''}${titleTag(r.title)}<small>${short(r.wallet)}</small></span>${tierBadge(r.rating)}<b>${r.rating}</b></div>`;

// Unclaimed ranks fill the board up to 10, so an early season still shows the race.
const openRow = (rank) => `<div class="lrow open"><span class="rk">${medal(rank)}</span><span class="nm">Unclaimed</span><span></span><b>—</b></div>`;

function boardCard(me, board) {
  let body;
  if (!board) body = '<p class="muted small">Loading the leaderboard…</p>';
  else {
    const open = Array.from({ length: Math.max(0, 10 - board.rows.length) }, (_, i) => openRow(board.rows.length + i + 1));
    body = `${board.rows.length ? '' : '<p class="muted small">Nobody has ranked yet this season. Win a match with a connected wallet to take the top spot.</p>'}
<div class="lb">${board.rows.map(lbRow).join('')}${open.join('')}${board.you && board.you.rank > board.rows.length ? `<div class="lgap">⋯</div>${lbRow(board.you)}` : ''}</div>`;
  }
  let note;
  if (!me.wallet) note = 'Guests play but don\'t rank. <button class="linkbtn" data-act="connect">Connect a wallet</button> to join the board.';
  else if (board?.you) note = `You are #${board.you.rank} of ${board.players} ranked players.`;
  else note = 'Play a ranked match this season to get on the board.';
  return `<div class="card">
    <div class="card-h"><h2>Leaderboard</h2>${board ? `<small class="muted">${board.players} ranked</small>` : ''}</div>
    ${body}<p class="muted small note">${note}</p>
  </div>`;
}

function lastSeasonCard(me, board) {
  if (!board?.last) return '';
  return `<div class="card"><div class="card-h"><h2>Season ${board.last.season} final</h2><small class="muted">frozen when it ended</small></div>
  <div class="lb">${board.last.rows.slice(0, 3).map((r) => lbRow({ ...r, you: r.wallet === me.wallet })).join('')}</div></div>`;
}

const accountCard = (me) => me.wallet
  ? `<div class="card"><h3>Your account</h3><p class="muted small">Signed in with <b class="mono">${short(me.wallet)}</b>. Your monsters and rating are saved on the server under this wallet.</p><button class="btn ghost sm" data-act="signout">Sign out</button></div>`
  : `<div class="card"><h3>Guest account</h3><p class="muted small">Your progress is saved on the server for this browser only. Connect a wallet to keep it and play on any device.</p><button class="btn sm" data-act="connect">Connect wallet</button></div>`;

function standingCard(me, board) {
  const s = me.player;
  let note;
  if (!me.wallet) note = 'Guests are not ranked on the board.';
  else if (board?.you) note = `#${board.you.rank} of ${board.players} ranked players this season.`;
  else note = board ? 'Not on the board yet this season.' : 'Loading your rank…';
  return `<div class="card standing"><h3>Your standing</h3>
  <div class="rankline">${tierBadge(s.rating, 'big')}<div class="rnum"><b>${s.rating}</b> RP<small>peak ${s.peak} · ${s.wins}W ${s.losses}L</small></div></div>
  <p class="muted small">${note}</p></div>`;
}

// board: the /api/leaderboard payload, or null while it loads.
export function seasonView(me, board) {
  const s = me.player;
  return `<section class="season-v page">
<div class="page-h"><div><h1>Season ${s.season}</h1><small class="muted">${countdown(me.season.end)} left of ${SEASON_DAYS} days · the top 3 share the prize pool</small></div></div>
<div class="season-grid">
<div class="col pz">
  <div class="card prize">
    <div class="card-h"><h2>Prize pool</h2><span class="season">${countdown(me.season.end)} left</span></div>
    <div class="pool"><span class="muted">Pool</span><b>— SOL</b><span class="pill">$FANG not live yet</span></div>
    <div class="podium"><div>${medal(1)}<b>50%</b></div><div>${medal(2)}<b>30%</b></div><div>${medal(3)}<b>20%</b></div></div>
    <p class="muted small">In the live game a share of $FANG's trading fees flows into this pool. When the season ends the top 3 are paid on-chain, and every payout is public.</p>
  </div>
  <div class="card">
    <h3>How $FANG fits</h3>
    <ul class="plan">
      <li><b>Free to play.</b> Starter monsters cost nothing; no NFT needed to start.</li>
      <li><b>Prizes from fees, not printing.</b> One token, no farmable reward token.</li>
      <li><b>Holding gives perks, not yield.</b> Skins, an extra lineup slot, season pass discount.</li>
      <li><b>Spending burns.</b> Evolving and cosmetics cost $FANG, part of it burned.</li>
      <li><b>The server decides every match.</b> The battle seed stays secret until you lock in your lineup.</li>
    </ul>
  </div>
</div>
<div class="col lbc">${boardCard(me, board)}</div>
<div class="col me-c">
  ${standingCard(me, board)}
  ${lastSeasonCard(me, board)}
  ${accountCard(me)}
</div>
</div>
</section>`;
}

// ---- the $FANG shop (src/shop.js) ----

export function shopView(me) {
  const s = me.player;
  const mode = me.shop?.mode ?? 'off';
  const now = Date.now();
  const left = boostLeft(s, 'xp2', now);
  const banner = mode === 'off'
    ? `<div class="card shopnote"><b>${glyph('lock')} Opens when $FANG launches</b><span>Prices are in $FANG and may change before launch. Everything here can also be earned by playing.</span></div>`
    : `<div class="card shopnote test"><b>${glyph('volt')} Test mode</b><span>This balance is test $FANG for trying the shop. It is not real and never turns into real $FANG.</span></div>`;
  const items = Object.entries(SHOP_ITEMS).filter(([, it]) => !it.event || me.event).map(([key, it]) => {
    const why = mode === 'off' ? null : buyBlock(s, key, { now, balance: me.shop.balance, event: me.event?.id });
    const used = it.season ? (s.pass.premium ? 1 : 0) : boughtToday(s, key);
    return `<div class="card sitem ${why ? 'no' : ''}">
  <div class="si-icon">${glyph(it.icon)}</div>
  <div class="si-body"><h3>${it.name}</h3><p class="muted small">${it.desc}</p>
    <small class="muted">${it.season ? `once a season${s.pass.premium ? ' · unlocked' : ''}` : `${used}/${it.limit} today`}${key === 'xp2' && left ? ` · running, ${countdown(now + left)} left` : ''}</small>${why ? `<small class="si-why">${esc(why)}</small>` : ''}</div>
  <div class="si-buy">${fang(it.price)}<button class="btn ${mode !== 'off' && !why ? 'primary' : ''}" data-act="buy" data-arg="${key}" ${mode === 'off' || why ? 'disabled' : ''} title="${esc(why ?? '')}">${mode === 'off' ? 'Soon' : why ? 'Not now' : 'Buy'}</button></div>
</div>`;
  });
  return `<section class="shop-v page">
<div class="page-h"><div><h1>Shop</h1><small class="muted">Pay to go faster, never to be stronger: levels and evolutions cap the same for everyone, and nothing here changes a battle.</small></div>
  <div class="page-tools">${mode === 'test' ? `<span class="essence">${fang(me.shop.balance)} test $FANG</span>` : ''}</div></div>
${banner}
<div class="shop-grid">${items.join('')}</div>
<p class="muted small note">${Math.round(BURN_SHARE * 100)}% of every $FANG spent in the shop is burned. Daily limits reset at 00:00 UTC.</p>
</section>`;
}

// ---- Night of Fangs (src/event.js) ----

const questDone = (q) => `<div class="qdone">${glyph('pumpkin')} ${q.text} <b>+${q.candy} candy · ${TITLES[q.title]}</b></div>`;
// The event part of a ranked result: candy and any finished event quests.
function eventGain(g) {
  if (!g) return '';
  return `<div class="passgain evgain"><div class="pg-top"><span>${glyph('candy')} Night of Fangs</span><b>${g.candy ? `+${g.candy} candy` : 'Candy used up today'}</b></div>${g.quests.map(questDone).join('')}</div>`;
}

// The lobby's event card: candy, today's door, raids left.
function eventCard(me) {
  const s = me.player;
  const e = s.event;
  if (!e) return '';
  const door = canTreat(s, me.today.day);
  return `<div class="card evcard">
  <div class="ev-top"><span class="kicker">${glyph('ghost')} Live event</span><small>ends in ${countdown(me.event.end)}</small></div>
  <h3>${esc(me.event.name)}</h3>
  <div class="ev-line">${candyTag(e.candy)}<span>${door ? '<b class="hot">A door to knock on</b>' : 'Door opens tomorrow'}</span><span>${bossTriesLeft(s)}/${BOSS.tries} raids</span></div>
  <button class="btn primary sm" data-act="tab" data-arg="event">${glyph('pumpkin')} Enter the Night of Fangs</button>
</div>`;
}

function treatCard(me) {
  const s = me.player;
  const ready = canTreat(s, me.today.day);
  return `<div class="card treat ${ready ? 'ready' : ''}">
  <div class="treat-door">${glyph(ready ? 'pumpkin' : 'ghost')}</div>
  <div class="treat-txt"><h3>Trick or treat</h3><small class="muted">${ready ? 'One door a day: candy, a pumpkin egg, or a trick.' : `Next door in ${countdown(me.today.end)}`}</small>
    <small class="muted">${s.event.q.treat}/${EVENT_QUESTS.treat.goal} days knocked</small></div>
  ${ready ? '<button class="btn primary" data-act="treat">Knock</button>' : ''}
</div>`;
}

function pumpkinEggCard(s) {
  const have = !!s.owned.hollowjack;
  const can = s.event.candy >= EGG_COST;
  return `<div class="card pegg">
  <div class="pegg-art ${have ? '' : 'locked'}">${portrait('hollowjack')}</div>
  <div><h3>Pumpkin egg</h3>
    <p class="muted small">${have ? `Hollowjack is yours. More eggs hold a big training tome: +24 XP to your squad.` : 'Hatches Hollowjack, the event monster: an Ember mystic whose lantern heals the squad and curses the strongest foe.'}</p>
    <button class="btn ${can ? 'primary' : ''}" data-act="pumpkin" ${can ? '' : 'disabled'}>${glyph('candy')} Open · ${EGG_COST} candy</button></div>
</div>`;
}

function bossCard(me) {
  const s = me.player;
  const b = s.event.boss;
  const left = bossTriesLeft(s);
  const d = BY_ID[BOSS.id];
  return `<div class="card boss">
  <div class="boss-art">${portrait(BOSS.id)}<i class="boss-glow"></i></div>
  <div class="boss-info">
    <span class="kicker">Raid boss</span>
    <h2>${d.name}</h2>
    <p class="muted small">${d.lore}</p>
    <div class="boss-stats"><span>${elTag(d.element)}</span><span>${big(d.hp)} HP</span><span>${glyph('mystic')} ${d.skill.name}</span></div>
    <p class="muted small">${d.skill.desc(d.skill.p)}</p>
    <div class="tries">${Array.from({ length: BOSS.tries }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}<small>${left ? `${left} raid${left > 1 ? 's' : ''} left today` : `Rises again in ${countdown(me.today.end)}`}</small></div>
    <div class="boss-num"><div><small>Best</small><b>${big(b.best)}</b></div><div><small>Your total</small><b>${big(b.total)}</b></div></div>
    <div class="boss-squad">${s.lineup.map((id) => `<span class="bsq">${portrait(id, s.owned[id].evo)}</span>`).join('')}<small class="muted">Your squad raids. Change it in the lobby.</small></div>
    <button class="btn primary big ${left ? '' : 'off'}" data-act="raid" ${left ? '' : 'disabled'}>${glyph('ghost')} Raid the Hollow King</button>
    <p class="muted small note">1 candy for every ${BOSS.per} damage (up to ${BOSS.max}), +${BOSS.slain} if he falls. Your damage adds to the community total.</p>
  </div>
</div>`;
}

function eventQuestsCard(s) {
  const rows = Object.entries(EVENT_QUESTS).map(([k, q]) => {
    const n = s.event.q[k];
    const done = s.event.done.includes(k);
    return `<div class="quest ${done ? 'done' : ''}"><span class="qi">${glyph(done ? 'check' : 'pumpkin')}</span>
  <div class="qbody"><div class="qtop"><span>${q.text}</span><b>${done ? 'Done' : `${big(n)}/${big(q.goal)}`}</b></div>
  <div class="prog sm"><i style="width:${Math.min(100, (100 * n) / q.goal)}%"></i></div><small class="muted">+${q.candy} candy · title ${TITLES[q.title]}</small></div></div>`;
  });
  return `<div class="card"><div class="card-h"><h2>Event quests</h2><small class="muted">for the whole event</small></div><div class="qlist">${rows.join('')}</div></div>`;
}

function giftsCard(me) {
  const s = me.player;
  const total = me.event.total;
  const next = GIFTS.find((g) => total < g.at) ?? GIFTS[GIFTS.length - 1];
  const rows = GIFTS.map((g, i) => {
    const got = s.event.gifts.includes(i);
    const ready = giftReady(s, i, total);
    return `<div class="gift ${got ? 'got' : ''} ${total >= g.at ? 'reached' : ''}"><b>${big(g.at)}</b><span>${g.label}</span>${got ? `<em>${glyph('check')} Claimed</em>` : ready ? `<button class="btn primary sm" data-act="gift" data-arg="${i}">Claim</button>` : `<em>${total >= g.at ? 'Raid once to claim' : 'Locked'}</em>`}</div>`;
  });
  return `<div class="card gifts"><div class="card-h"><h2>Community gifts</h2><small class="muted">everyone's damage to the king</small></div>
  <div class="ctotal"><b>${big(total)}</b><small>of ${big(next.at)}</small></div><div class="prog"><i style="width:${Math.min(100, (100 * total) / next.at)}%"></i></div>
  ${rows.join('')}</div>`;
}

export function eventView(me) {
  const s = me.player;
  const e = s.event;
  return `<section class="event-v page">
<div class="ev-hero">
  <div><span class="kicker">${glyph('ghost')} Limited event · ends in ${countdown(me.event.end)}</span><h1>${esc(me.event.name)}</h1>
  <p>Every monster wears its costume, the arena turns into a graveyard, and the Hollow King rises. Earn candy from ranked matches (+${CANDY.win} a win, +${CANDY.loss} a loss), knock on a door every day, open pumpkin eggs and raid the king.</p></div>
  <div class="ev-candy">${glyph('candy')}<b>${big(e.candy)}</b><small>candy</small></div>
</div>
<div class="event-grid">
  <div class="col">${treatCard(me)}${pumpkinEggCard(s)}</div>
  ${bossCard(me)}
  <div class="col">${eventQuestsCard(s)}${giftsCard(me)}</div>
</div>
</section>`;
}

// The raid's result: damage dealt, candy, and whether the king fell.
export function raidResultModal(o, match) {
  return `<div class="result raidres ${o.slain ? 'win' : ''}">
  <span class="kicker">${glyph('ghost')} Night of Fangs raid</span>
  <h1>${o.slain ? 'The Hollow King falls!' : 'Raid over'}</h1>
  <div class="dmg"><b>${big(o.damage)}</b><small>damage dealt${o.newBest ? ' · new best!' : ` · best ${big(o.best)}`}</small></div>
  <div class="evgot">${candyTag(o.candy)}<span>candy earned${o.slain ? ` (+${BOSS.slain} for felling him)` : ''}</span></div>
  ${o.quests.map(questDone).join('')}
  <p class="muted small">${o.triesLeft ? `${o.triesLeft} raid${o.triesLeft > 1 ? 's' : ''} left today.` : 'No raids left today. He rises again tomorrow.'} Your total: ${big(o.total)} damage.</p>
  <div class="row">${o.triesLeft ? '<button class="btn primary" data-act="raid">Raid again</button>' : ''}<button class="btn" data-act="tab" data-arg="event">Event</button></div>
  <div class="row"><button class="btn ghost sm" data-act="copy" data-arg="${match.id}">Copy replay link</button></div>
</div>`;
}

const hatchLine = (egg) => (egg.type === 'monster'
  ? `<div class="detail-art pop">${portrait(egg.id)}</div><h2>Hollowjack joined your roster!</h2><p class="muted">${BY_ID.hollowjack.lore}</p>`
  : `<div class="evgot">${glyph('tome')}<span>Training tome: +${egg.xp} XP to your squad${egg.essence ? ` · +${egg.essence} essence` : ''}</span></div>`);

// Today's door: a treat, a trick, or a pumpkin egg.
export function treatModal(r) {
  const title = r.kind === 'trick' ? 'TRICK!' : r.kind === 'egg' ? 'A PUMPKIN EGG!' : 'TREAT!';
  const line = r.kind === 'trick' ? 'A ghost jumps out and steals most of the bowl. It left you a little.' : r.kind === 'egg' ? 'Someone left a pumpkin egg on the step.' : 'A full bowl of candy.';
  return `<div class="result treatres kind-${r.kind}">
  <div class="door">${glyph(r.kind === 'trick' ? 'ghost' : 'pumpkin')}</div>
  <h1>${title}</h1><p class="muted">${line}</p>
  ${r.candy ? `<div class="evgot">${candyTag(r.candy)}<span>candy</span></div>` : ''}
  ${r.egg ? hatchLine(r.egg) : ''}
  ${r.quests.map(questDone).join('')}
  <div class="row"><button class="btn primary" data-act="close">Happy haunting</button></div>
</div>`;
}

export function pumpkinModal(r) {
  return `<div class="result treatres kind-egg">${hatchLine(r)}${r.quests.map(questDone).join('')}
  <div class="row"><button class="btn primary" data-act="close">${r.type === 'monster' ? 'Welcome' : 'Nice'}</button></div></div>`;
}

// The end of the training battle: the one-time reward and what to do next.
export function tutorialResultModal(o) {
  const r = o.reward;
  const ups = r ? r.tome.squad.filter((m) => m.to > m.from).length : 0;
  return `<div class="result ${o.won ? 'win' : 'lose'} tutres">
  <span class="kicker">${glyph('mystic')} Training complete</span>
  <h1>${o.won ? 'VICTORY' : 'DEFEAT'}</h1>
  ${r ? `<div class="evgot">${glyph('ribbon')}<span>+${r.pass.xp} pass XP${r.pass.to > r.pass.from ? ` · tier ${r.pass.to} reached` : ''}</span></div>
  <div class="evgot">${glyph('tome')}<span>Training tome: +${TUTORIAL_TOME} XP to your squad${ups ? ` · ${ups} level up${ups > 1 ? 's' : ''}` : ''}</span></div>` : '<p class="muted small">Training battles pay their reward once.</p>'}
  <ul class="nextsteps">
    <li>${glyph('striker')}<span><b>Ranked matches</b> raise your rating. Every ${WINS_PER_EGG} wins earn an egg with a new monster (up to ${WIN_EGGS_PER_DAY} a day).</span></li>
    <li>${glyph('ribbon')}<span><b>Daily quests and the season pass</b> pay XP, eggs and titles. Check in every day.</span></li>
    <li>${glyph('crown')}<span><b>Connect a wallet</b> to face real players and climb the season leaderboard.</span></li>
  </ul>
  <div class="row"><button class="btn primary" data-act="again">Find ranked match</button><button class="btn" data-act="lobby">Lobby</button></div>
</div>`;
}

export function resultModal(o, id) {
  return `<div class="result ${o.won ? 'win' : 'lose'}">
  <h1>${o.won ? 'VICTORY' : 'DEFEAT'}</h1>
  <div class="rp ${o.delta >= 0 ? 'up' : 'down'}">${o.delta >= 0 ? '+' : ''}${o.delta} RP<small>${o.prev} → ${o.rating}</small></div>
  ${o.tierChange ? `<div class="tierchg">${o.tierChange === 'up' ? 'Promoted to' : 'Dropped to'} ${tierBadge(o.rating)}</div>` : ''}
  ${o.won && o.streak >= 2 ? `<div class="streak">${glyph('ember')} ${o.streak} win streak</div>` : ''}
  <div class="xp">${o.xp.map((x) => `<div class="xpm" style="--c:${color(x.id)}">${portrait(x.id, x.evo)}<b>${cardName(x.id, x.evo)}</b><small>${x.to > x.from ? `<span class="lvup">Lv ${x.from} → ${x.to}</span>` : x.from >= MAX_LEVEL ? `<span class="ess">+${x.over} essence</span>` : `+${x.gain} XP`}</small></div>`).join('')}</div>
  ${o.essence ? `<div class="essmsg">${glyph('mystic')} +${o.essence} essence for evolutions</div>` : ''}
  ${o.boost ? `<div class="essmsg">${glyph('volt')} XP ×${o.boost} booster: double monster and pass XP</div>` : ''}
  ${o.egg ? `<div class="eggmsg">${glyph('egg')} You earned an egg!</div>` : o.eggCapped ? `<div class="eggp muted small">That's today's ${WIN_EGGS_PER_DAY} eggs from wins. More tomorrow.</div>` : o.collecting ? `<div class="eggp muted small">Egg progress ${o.eggWins}/${WINS_PER_EGG} wins</div>` : ''}
  ${passGain(o.progress)}
  ${eventGain(o.event)}
  <div class="row"><button class="btn primary" data-act="again">Next match</button><button class="btn" data-act="lobby">Lobby</button></div>
  <div class="row"><button class="btn ghost sm" data-act="copy" data-arg="${id}">Copy replay link</button><button class="btn ghost sm" data-act="share" data-arg="${id}">Share on X</button></div>
</div>`;
}

// match: a finished match from the server; its winner is the official result.
export function replayEndModal(match) {
  const w = match.winner === 'a' ? match.a : match.b;
  return `<div class="result replay">
  <h1>${esc(w.name)} wins</h1>
  <p class="muted">Replay of ${esc(match.a.name)} vs ${esc(match.b.name)}${match.played ? ` · ${new Date(match.played).toLocaleDateString()}` : ''}</p>
  ${match.ver !== SIM_VERSION ? '<p class="muted small">Fought on an older balance patch, so this playback can differ from what happened.</p>' : ''}
  <div class="row"><button class="btn primary" data-act="rewatch">Watch again</button><button class="btn" data-act="exitReplay">Play Fangbound</button></div>
  <div class="row"><button class="btn ghost sm" data-act="copy" data-arg="${match.id}">Copy replay link</button></div>
</div>`;
}

const walletIcon = (icon) => (/^data:image\/(svg\+xml|png|webp|jpeg);/.test(icon) ? `<img src="${esc(icon)}" alt="">` : '<span class="wicon">◎</span>');

// wallets: detected in this browser. links: wallet-app browser links for phones. busy: the wallet being signed with.
export function connectModal(wallets, links, busy = null) {
  const list = wallets.length
    ? `<div class="wallets">${wallets.map((w) => `<button class="wallet" data-act="signin" data-arg="${esc(w.name)}" ${busy ? 'disabled' : ''}>${walletIcon(w.icon)}<b>${esc(w.name)}</b><small>${busy === w.name ? 'Check your wallet…' : 'Detected'}</small></button>`).join('')}</div>`
    : `<p class="muted">No Solana wallet found in this browser.</p>
<div class="wallets">${links.map((l) => `<a class="wallet" href="${esc(l.href)}" target="_blank" rel="noopener"><span class="wicon">↗</span><b>Open in ${l.name}</b><small>on your phone</small></a>`).join('')}</div>
<p class="muted small">On a computer, install <a href="https://phantom.com" target="_blank" rel="noopener">Phantom</a> or <a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a> and reload this page.</p>`;
  return `<div class="sheet-h"><h2>Connect wallet</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
<p class="muted small">Your wallet signs a sign-in message. It is not a transaction: it costs nothing and cannot move funds.</p>
${list}
<p class="muted small">Your guest progress moves to the wallet. If the wallet already has a Fangbound account, that account loads instead.</p>`;
}

export function accountModal(me) {
  return `<div class="sheet-h"><h2>Your wallet</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
<p class="mono addr">${esc(me.wallet)}</p>
<p class="muted small">Your monsters, rating and season rank are saved under this wallet. Sign in with it on any device to carry on.</p>
<div class="row"><button class="btn" data-act="copyaddr">Copy address</button><button class="btn ghost" data-act="signout">Sign out</button></div>`;
}

export function hatchModal(options) {
  return `<div class="sheet-h"><h2>Hatch an egg</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>
<p class="muted">Pick one hatchling to join your roster.</p>
<div class="grid three">${options.map((id) => {
    const d = BY_ID[id];
    return `<button class="mcard hatchc" data-act="hatchpick" data-arg="${id}" style="--c:${color(id)}">${rarityTag(id)}${portrait(id)}<b>${d.name}</b><small>${elIcon(d.element)} ${roleTag(d.role)}</small><span class="sk">${glyph('mystic')} ${d.skill.name}</span></button>`;
  }).join('')}</div>`;
}

// The evolution moment: the monster glows, a flash, then its evolved form rises.
export function evolveScene(s, id) {
  return `<div class="result evolved" style="--c:${color(id)}">
  <div class="evo-stage"><i class="rays"></i><div class="from">${portrait(id)}</div><div class="to">${portrait(id, true)}</div><i class="flash"></i></div>
  <h1>${BY_ID[id].name} evolved!</h1>
  <p class="evo-name">It is now <b>${monName(id, true)}</b></p>
  <p class="muted">+${pct(EVO_MULT - 1)} HP and ATK in every battle. ${s.essence} essence left.</p>
  <div class="row"><button class="btn primary" data-act="close">Glorious</button></div>
</div>`;
}

export function hatchedModal(id) {
  const d = BY_ID[id];
  return `<div class="result hatched" style="--c:${color(id)}">
  <div class="detail-art pop">${portrait(id)}</div>
  <h1>${d.name} answers your call</h1>
  <p class="muted">${d.lore}</p>
  <div class="row"><button class="btn primary" data-act="close">Welcome</button></div>
</div>`;
}
