// Landing page: the hero video, the roster, the element wheel and the live season data.
import { MONSTERS, BY_ID, ELEMENTS, ELEMENT_ORDER, ROLES, RARITIES } from './data.js';
import { logoArt, glyph } from './art.js';
import { countdown, esc } from './views.js';
import { wearCostumes, COSTUME_NAMES } from './event.js';
import { THEME } from './theme.js';

const $ = (id) => document.getElementById(id);
// During Night of Fangs every monster shows in its costume, under its costume name.
const hw = THEME === 'halloween';
wearCostumes(THEME);
const portrait = (id, cls = '') => `<img class="${cls}" src="/media/mon/${id}${hw && Object.hasOwn(COSTUME_NAMES, id) ? '-hw' : ''}.webp" alt="${BY_ID[id]?.name ?? ''}" loading="lazy" decoding="async">`;

// Old replay links (/#m=…) and challenge links (/#c=…) open in the game page.
if (/^#(m=[\w-]{11}|c=[\w-]{8})$/.test(location.hash)) location.replace(`/play${location.hash}`);
// An invite (/?ref=…) rides along on every way into the game.
const ref = new URLSearchParams(location.search).get('ref');
if (ref && /^[\w-]{8}$/.test(ref)) document.querySelectorAll('a[href="/play"]').forEach((a) => { a.href = `/play?ref=${ref}`; });

$('logo').innerHTML = logoArt();
$('logo2').innerHTML = logoArt();
$('statMons').textContent = MONSTERS.length;
if (hw) {
  $('heroTitle').innerHTML = 'Summon.<br><em>Haunt.</em> Conquer.';
  document.querySelector('.hero-inner .pill.live').insertAdjacentHTML('afterend', `<a class="evstrip" href="/play">${glyph('pumpkin')}<b>Night of Fangs is live</b><span>Costumes, candy, Hollowjack and the Hollow King raid</span><i>›</i></a>`);
}

// Hero video: a tall cut on portrait screens, the wide one elsewhere; only the poster
// for people who prefer less motion.
const video = $('heroVideo');
const tall = matchMedia('(max-aspect-ratio: 4/5)').matches;
const cut = `/media/hero${hw ? '-hw' : ''}-${tall ? 'tall' : 'wide'}`;
video.poster = `${cut}.jpg`;
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  video.src = `${cut}.mp4`;
  video.play().catch(() => {});
}

const nav = $('nav');
const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---- roster ----
let filter = 'all';
function renderRoster() {
  const list = MONSTERS.filter((m) => filter === 'all' || m.element === filter);
  $('roster').innerHTML = list.map((m) => {
    const el = ELEMENTS[m.element];
    return `<article class="mon" style="--c:${el.color}">
  <div class="mon-art">${portrait(m.id)}</div>
  <div class="mon-tags"><span class="tag el">${glyph(m.element)} ${el.name}</span><span class="tag">${glyph(m.role)} ${ROLES[m.role].name}</span>${m.event ? `<span class="tag ev">${glyph('pumpkin')} Event</span>` : `<span class="tag" style="color:${RARITIES[m.rarity].color}">${RARITIES[m.rarity].name}</span>`}</div>
  <h3>${m.name}</h3>
  <p>${esc(m.lore)}</p>
  <div class="mon-skill"><b>${glyph('mystic')} ${m.skill.name}</b></div>
</article>`;
  }).join('');
}
$('chips').innerHTML = [['all', 'All'], ...ELEMENT_ORDER.map((e) => [e, ELEMENTS[e].name])]
  .map(([k, n]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-el="${k}" style="--c:${k === 'all' ? '#e8bf6a' : ELEMENTS[k].color}">${glyph(k)} ${n}</button>`).join('');
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-el]');
  if (!b) return;
  filter = b.dataset.el;
  $('chips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
  renderRoster();
});
renderRoster();

// ---- how to play art ----
$('stepSquad').innerHTML = ['cindertusk', 'joltcub', 'sproutling'].map((id, i) => `<div class="sq s${i}">${portrait(id)}<small>${['Front', 'Middle', 'Back'][i]}</small></div>`).join('');
const ring = Array.from({ length: 36 }, (_, i) => {
  const t = (i / 36) * Math.PI * 2;
  const r0 = i % 3 ? 93 : 89;
  return `<line x1="${100 + Math.cos(t) * r0}" y1="${100 + Math.sin(t) * r0}" x2="${100 + Math.cos(t) * 97}" y2="${100 + Math.sin(t) * 97}"/>`;
}).join('');
$('stepWheel').innerHTML = `<svg viewBox="0 0 200 200" aria-label="Element cycle"><defs>
<marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#e8bf6a"/></marker>
<filter id="wglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>
<g class="spin" fill="none" stroke="rgba(232,191,106,.35)" stroke-width="1"><circle cx="100" cy="100" r="97"/><circle cx="100" cy="100" r="86" stroke-dasharray="2 5"/>${ring}</g>
<circle cx="100" cy="100" r="38" fill="#0c090e" stroke="rgba(232,191,106,.4)"/>
${ELEMENT_ORDER.map((e, k) => {
  const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
  const b = a + (Math.PI * 2) / 5;
  const R = 66;
  const p = (ang, r = R) => `${100 + Math.cos(ang) * r},${100 + Math.sin(ang) * r}`;
  const x = 100 + Math.cos(a) * R, y = 100 + Math.sin(a) * R;
  const c = ELEMENTS[e].color;
  return `<path d="M${p(a + 0.36)} A${R} ${R} 0 0 1 ${p(b - 0.36)}" fill="none" stroke="#e8bf6a" stroke-opacity=".7" stroke-width="2" marker-end="url(#arr)"/>
  <circle cx="${x}" cy="${y}" r="20" fill="${c}" opacity=".45" filter="url(#wglow)"/>
  <circle cx="${x}" cy="${y}" r="18" fill="#120c12" stroke="${c}" stroke-width="2"/>
  ${glyph(e).replace('<svg ', `<svg x="${x - 10}" y="${y - 10}" width="20" height="20" style="color:${c}" `)}`;
}).join('')}
<text x="100" y="99" text-anchor="middle" fill="#fff0c4" font-family="Cinzel" font-size="19" font-weight="800">+30%</text>
<text x="100" y="116" text-anchor="middle" fill="#a39580" font-family="Barlow Semi Condensed" font-size="11" font-weight="700" letter-spacing="1">VS THE NEXT</text></svg>`;
$('stepClimb').innerHTML = `<div class="tiers">${[['Bronze', '#d39a6a'], ['Silver', '#c9d4e6'], ['Gold', '#ffcf4a'], ['Platinum', '#6fe3d6'], ['Diamond', '#86b0ff'], ['Mythic', '#ff7ae0']]
  .map(([n, c], i) => `<span style="--t:${c};--i:${i}"><i><b>${n[0]}</b></i>${n}</span>`).join('')}</div>`;
$('finalArt').innerHTML = ['flarefox', 'shellguard', 'mistling', 'joltcub', 'bouldrake'].map((id, i) => `<div class="fa f${i}">${portrait(id)}</div>`).join('');

const ICONS = {
  server: '<rect x="4" y="3" width="16" height="7" rx="1"/><rect x="4" y="14" width="16" height="7" rx="1"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/>',
  seal: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5"/>',
  swords: '<path d="M4 4l9 9M20 4l-9 9M14.5 17.5l5-5M4.5 12.5l5 5M17 20l3-3M4 17l3 3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  ribbon: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7 21l5-2.5 5 2.5-2-7.5"/>',
};
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[el.dataset.icon]}</svg>`; });

// ---- live season data ----
async function season() {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const b = await res.json();
    const left = countdown(b.season.end);
    $('seasonPill').textContent = `Season ${b.season.n} is live`;
    $('poolSeason').textContent = b.season.n;
    $('poolEnds').textContent = `${left} left`;
    // A brand-new season has nobody ranked yet; show how far in it is instead.
    const day = Math.min(14, Math.floor((Date.now() - b.season.start) / 864e5) + 1);
    $('statPlayers').textContent = b.players || `Day ${day}`;
    $('statPlayers').nextElementSibling.textContent = b.players ? 'ranked this season' : 'of 14 this season';
    $('statEnds').textContent = left;
    $('board').innerHTML = b.rows.length
      ? b.rows.slice(0, 5).map((r) => `<li class="${r.rank <= 3 ? 'top' : ''}"><span class="rk">${r.rank <= 3 ? `<i class="medal m${r.rank}">${['I', 'II', 'III'][r.rank - 1]}</i>` : r.rank}</span><span class="nm">${esc(r.name)}<small>${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}</small></span><b>${r.rating}</b></li>`).join('')
      : '<li class="empty">Nobody has ranked yet this season. The top spot is open.</li>';
  } catch {
    $('board').innerHTML = '<li class="empty">The ladder is resting. Check back soon.</li>';
  }
}
season();

// ---- $FANG: contract address, curve, on-chain facts and the prize pool ----
// The server finds the launch by itself (server/launch.js), so the page flips to live
// within seconds of it, without a deploy.
let ca = '';
let wasLive = null;
const num = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// data-ca="short": the head shrinks with an ellipsis and the last 6 characters stay;
// data-ca="full": the whole address, wrapping.
function renderCa(el) {
  el.classList.toggle('pending', !ca);
  el.title = ca;
  el.replaceChildren();
  if (!ca) return void (el.textContent = el.dataset.ca === 'full' ? 'Drops at launch' : 'Launching soon');
  if (el.dataset.ca === 'full') return void (el.textContent = ca);
  const head = document.createElement('span');
  const tail = document.createElement('span');
  head.className = 'ca-head';
  head.textContent = ca.slice(0, -6);
  tail.textContent = ca.slice(-6);
  el.append(head, tail);
}

function renderToken(t) {
  const live = t.status === 'live' && !!t.mint;
  ca = live ? t.mint : '';
  document.querySelectorAll('[data-ca]').forEach(renderCa);
  document.querySelectorAll('[data-copy-ca]').forEach((b) => { b.hidden = !ca; });
  document.querySelectorAll('[data-ca-note]').forEach((el) => { el.hidden = !!ca; });
  const links = { x: t.links?.x, buy: ca && `https://jup.ag/swap/SOL-${ca}`, chart: ca && `https://dexscreener.com/solana/${ca}` };
  document.querySelectorAll('[data-link]').forEach((a) => {
    const href = links[a.dataset.link];
    if (a.dataset.link === 'x') a.hidden = !href;
    if (href) {
      a.href = href;
      a.removeAttribute('aria-disabled');
    } else {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
    }
  });

  const c = live && t.curve;
  $('curve').hidden = !c;
  if (c) {
    const p = c.graduated ? 100 : Math.max(0, Math.min(100, Number(c.progress) || 0));
    const target = (t.facts?.migratesTo || 'a Meteora DAMM pool').replace(/ \(.*\)$/, '');
    $('curvePct').textContent = c.graduated ? 'Graduated' : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
    $('curveFill').style.width = `${p}%`;
    $('curveBar').setAttribute('aria-valuenow', String(Math.round(p)));
    $('curveSub').textContent = c.graduated
      ? `The curve is full. $FANG now trades on ${target}.`
      : `${num(c.raised)} / ${num(c.threshold)} ${c.quoteSymbol} in the curve. At 100% it graduates to ${target}.`;
  }
  const F = live && t.facts;
  if (F) {
    $('facts').innerHTML = [
      ['Supply', num(F.supply)], ['Bonding curve', `${F.curvePercent}% of supply`],
      ['Graduates at', `${num(F.migrationThreshold)} ${F.quoteSymbol}`], ['Migrates to', F.migratesTo],
      ['Trading fee', F.tradingFee], ['Graduation LP', F.lpLock],
      ['Mint authority', F.mintAuthority], ['Freeze authority', F.freezeAuthority],
    ].map(([k, v]) => `<div class="fact"><small>${k}</small><b>${esc(String(v))}</b></div>`).join('');
  }

  // The pool is a public wallet: its balance is the pool, and anyone can check it on Solscan.
  const prize = t.prize ?? {};
  // topUp: the creator also adds to the pool from their own funds.
  const plus = prize.topUp ? ', plus top-ups from the creator,' : '';
  if (prize.share) {
    $('poolShare').textContent = `${prize.share}% of $FANG's creator trading fees${plus} flow`;
    $('poolUse').textContent = `${prize.share}% of creator fees${plus} fill each 14-day season's pool. The top three wallets are paid on-chain.`;
  }
  $('poolWhen').textContent = live ? 'Live' : 'At launch';
  $('poolWhen').classList.toggle('live', live);
  $('poolAmount').textContent = prize.sol != null ? `${num(prize.sol)} SOL` : '— SOL';
  $('poolNote').textContent = prize.sol != null ? 'in the pool wallet now' : live ? `filled from creator fees${prize.topUp ? ' and top-ups' : ''}` : '$FANG not live yet';
  $('poolWallet').hidden = !prize.wallet;
  if (prize.wallet) {
    $('poolWallet').href = `https://solscan.io/account/${prize.wallet}`;
    $('poolWallet').textContent = `Pool wallet ${short(prize.wallet)} ↗`;
  }
  if (wasLive === false && live) toast('$FANG is live! The contract address is on this page.');
  wasLive = live;
}

// Polls fast while waiting for the launch, slower once live or while nothing is set up.
async function token() {
  let wait = 30_000;
  try {
    const res = await fetch('/api/token', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const t = await res.json();
    renderToken(t);
    wait = t.status === 'live' ? 30_000 : t.status === 'not-configured' ? 60_000 : 10_000;
  } catch {
    // keep what the page shows and try again
  }
  setTimeout(token, wait);
}
token();

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // blocked or unavailable: fall back to a hidden textarea
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
document.querySelectorAll('[data-copy-ca]').forEach((b) => b.addEventListener('click', async () => {
  toast((await copyText(ca)) ? 'Contract address copied' : 'Copy failed: select the address by hand');
}));

// ---- reveal on scroll ----
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
