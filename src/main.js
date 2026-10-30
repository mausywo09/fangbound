// App controller: screens, actions and the replay route (#m=<match id>). The server owns
// all progress and decides every ranked match; the browser asks it, then plays back.
import { simulate } from './sim.js';
import { api } from './api.js';
import { listWallets, signWithWallet, browseLinks, cancelled } from './wallet.js';
import { mountBattle } from './battle.js';
import { createShowcase } from './showcase.js';
import * as V from './views.js';
import { TITLES, REF_WINS, REF_XP } from './pass.js';
import { wearCostumes } from './event.js';
import { TRAINING, TUTORIAL_XP, needsTutorial } from './tutorial.js';
import { showCoach, hideCoach } from './coach.js';
import { BY_ID } from './data.js';
import { THEME } from './theme.js';

// During Night of Fangs every monster is shown under its costume name.
wearCostumes(THEME);

const app = { me: null, error: null, board: null, tab: 'battle', screen: 'lobby', slot: 0, battle: null, replay: null, duel: null, busy: false, signing: null, showcase: undefined, sel: null, filter: 'all' };

const $head = document.getElementById('head');
const $view = document.getElementById('view');
const $modal = document.getElementById('modal');

function stopBattle() {
  app.battle?.stop();
  app.battle = null;
}

// The body's data-screen tells the CSS which screens fill the window (battle always;
// lobby and scout on wide screens) and which scroll.
const setScreen = (name) => { document.body.dataset.screen = name; };

function render() {
  stopBattle();
  $head.innerHTML = V.header(app.me, app.tab, !!app.replay);
  if (app.replay) return playReplay();
  const duelling = app.screen === 'duel' && app.duel && app.me;
  const training = app.screen === 'training' && app.me;
  const scout = (app.screen === 'scout' && app.me?.pending) || duelling || training;
  let screen = 'lobby';
  if (app.error || !app.me) screen = 'center';
  else if (scout) screen = 'scout';
  else if (app.tab === 'monsters' || app.tab === 'season' || app.tab === 'pass') screen = app.tab;
  else if (app.tab === 'event' && app.me.event) screen = 'event';
  else if (app.tab === 'shop') screen = 'shop';
  setScreen(screen);
  if (app.error) $view.innerHTML = V.offlineView(app.error);
  else if (!app.me) $view.innerHTML = V.loadingView();
  else if (duelling) $view.innerHTML = V.scout(app.me.player, { id: app.duel.id, opp: app.duel.from }, { duel: true });
  else if (training) $view.innerHTML = V.scout(app.me.player, { id: null, opp: TRAINING }, { training: true });
  else if (scout) $view.innerHTML = V.scout(app.me.player, app.me.pending);
  else if (app.tab === 'monsters') $view.innerHTML = V.monstersView(app.me.player, app.sel, app.filter);
  else if (app.tab === 'season') $view.innerHTML = V.seasonView(app.me, app.board);
  else if (screen === 'event') $view.innerHTML = V.eventView(app.me);
  else if (screen === 'shop') $view.innerHTML = V.shopView(app.me);
  else if (app.tab === 'pass') {
    $view.innerHTML = V.passView(app.me);
    showTrack();
  } else $view.innerHTML = V.lobby(app.me);
  // The 3D arena behind the lobby and the scout screen (made on first use; null without WebGL).
  const spot = document.getElementById('showcase');
  if (spot) {
    if (app.showcase === undefined) app.showcase = createShowcase();
    if (app.showcase) {
      const s = app.me.player;
      app.showcase.show(spot, {
        team: s.lineup.map((id) => ({ id, evo: !!s.owned[id].evo })),
        opp: scout ? (training ? TRAINING : duelling ? app.duel.from : app.me.pending.opp).team.map((m) => ({ id: m.id, evo: !!m.evo })) : null,
        frame: document.getElementById('frame'),
      });
    } else {
      spot.closest('section').classList.add('no3d');
      spot.remove();
    }
  } else app.showcase?.pause();
}

// The pass track scrolls sideways: it opens on the first reward to claim (else the tier
// being worked on), and a mouse wheel scrolls it too.
function showTrack() {
  const track = document.getElementById('track');
  if (!track) return;
  const at = track.querySelector('.rw.ready')?.closest('.tcol') ?? track.querySelector('.tcol.next') ?? track.lastElementChild;
  track.scrollLeft = at.offsetLeft - track.clientWidth / 2 + at.offsetWidth / 2;
  track.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const end = track.scrollWidth - track.clientWidth;
    if ((e.deltaY < 0 && track.scrollLeft <= 0) || (e.deltaY > 0 && track.scrollLeft >= end - 1)) return;
    track.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}

function openModal(html, sticky = false) {
  $modal.innerHTML = `<div class="overlay" ${sticky ? 'data-sticky' : ''}><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
}
const closeModal = () => { $modal.innerHTML = ''; };

// Toasts stack in one column at the bottom, newest last.
function toast(msg, ms = 1800) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

const replayUrl = (id) => `${location.origin}${location.pathname}#m=${id}`;

// Shows a failed call's reason. A lost session starts over with a fresh one.
function failed(e) {
  toast(e.message, 3500);
  if (e.status === 401) boot();
}

// A challenge link (#c=…) or invite (?ref=…) this visit came through; a new player is
// tied to whoever shared it.
function linkSource() {
  const ref = new URLSearchParams(location.search).get('ref');
  const challenge = /^#c=([\w-]{8})$/.exec(location.hash)?.[1];
  return { ...(ref && /^[\w-]{8}$/.test(ref) && { ref }), ...(challenge && { challenge }) };
}

async function boot() {
  app.me = null;
  app.error = null;
  render();
  try {
    app.me = await api('POST', '/api/session', linkSource());
  } catch (e) {
    app.error = e.message;
  }
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  route();
  // A brand-new player (no games, tutorial not finished or skipped) gets the tutorial,
  // unless they arrived on a replay or a challenge link.
  if (app.me && needsTutorial(app.me.player) && !location.hash) setTimeout(startTutorial, 600);
  if (app.me?.invited) {
    setTimeout(() => toast(`${app.me.invited.name} invited you! Win ${REF_WINS} ranked matches with a wallet and you both get an egg and +${REF_XP} pass XP.`, 9000), 400);
  }
  awayToast(app.me?.away);
}

// What happened since the player last played: attacks on their defense, friends who
// took their challenge, and invited friends who earned the invite reward.
function awayToast(away) {
  if (!away) return;
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const lines = [];
  if (away.n) lines.push(`${plural(away.n, 'attack')} on your defense, ${away.delta > 0 ? '+' : ''}${away.delta} RP`);
  if (away.duels?.n) {
    const { n, held } = away.duels;
    const how = n === 1 ? (held ? 'and your squad held' : 'and beat your squad') : `and your squad held ${held} of ${n}`;
    lines.push(`${plural(n, 'friend')} took your challenge ${how}`);
  }
  if (away.refs) lines.push(`${plural(away.refs, 'invited friend')} earned the invite reward: you got ${plural(away.refs, 'egg')} and +${away.refs * REF_XP} pass XP`);
  lines.forEach((l, i) => setTimeout(() => toast(`While you were away: ${l}`, 5000), 600 + i * 900));
}

const challengeUrl = (id) => `${location.origin}/play#c=${id}`;
const inviteUrl = (code) => `${location.origin}/?ref=${code}`;

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, 2600);
  } catch {
    window.prompt('Copy this link', text);
  }
}

// A friendly duel: the server decides it like a ranked match, but nothing is at stake.
async function duel(_, btn) {
  if (app.busy || !app.duel) return;
  app.busy = true;
  btn.disabled = true;
  btn.textContent = 'Fighting…';
  let out;
  try {
    out = await api('POST', '/api/challenge/fight', { id: app.duel.id, lineup: app.me.player.lineup });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Accept challenge';
    return failed(e);
  } finally {
    app.busy = false;
  }
  const { match, outcome } = out;
  app.me = out.me;
  leaveDuel();
  app.screen = 'battle';
  stopBattle();
  setScreen('battle');
  window.scrollTo(0, 0);
  app.battle = mountBattle($view, match, {
    label: 'DUEL',
    onEnd: () => openModal(V.duelResultModal(outcome, match), true),
  });
}

// A raid on the Hollow King with the current squad: decided on the server, then played back.
async function raid(_, btn) {
  if (app.busy || !app.me?.event) return;
  closeModal();
  app.busy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Summoning…';
  }
  let out;
  try {
    out = await api('POST', '/api/event/raid', { lineup: app.me.player.lineup });
  } catch (e) {
    if (btn) btn.disabled = false;
    render();
    return failed(e);
  } finally {
    app.busy = false;
  }
  const { match, outcome } = out;
  app.me = out.me;
  app.tab = 'event';
  app.screen = 'battle';
  stopBattle();
  setScreen('battle');
  window.scrollTo(0, 0);
  app.battle = mountBattle($view, match, {
    label: 'RAID',
    onEnd: () => {
      $head.innerHTML = V.header(app.me, app.tab, false);
      openModal(V.raidResultModal(outcome, match), true);
    },
  });
}

// Event calls that return { result, me } and show the result in a sheet.
async function eventCall(url, btn, modal, body) {
  if (btn) btn.disabled = true;
  let out;
  try {
    out = await api('POST', url, body);
  } catch (e) {
    if (btn) btn.disabled = false;
    return failed(e);
  }
  app.me = out.me;
  render();
  if (modal) openModal(modal(out.result));
  return out.result;
}

// ---- the first-match tutorial: coach steps in the lobby and the training scout screen,
// callouts during the training battle, then a result with the next steps.

const TUTORIAL = {
  lobby: [
    { target: '.dock .slots', title: 'Your squad', text: 'Three monsters fight on their own. You choose who fights, and where they stand.' },
    { target: '.dock .slots .slot:first-child', title: 'The front line', text: 'Enemies hit your Front monster first, so Guards (the most HP and armor) belong there. ◀ ▶ move a monster; tap its picture to swap it.' },
    { target: '.wheel', title: 'Elements', text: 'Each element hits the next one for +30% damage and takes −20% from the one before: Ember › Bloom › Stone › Volt › Tide › Ember.' },
    { target: '.dock .btn.big', title: 'Your first fight', text: `A training battle against Coach Ravel, with no rating at stake. Win it for ${TUTORIAL_XP} pass XP and a training tome.`, buttons: [{ label: 'Start training', act: 'tutscout', primary: true }] },
  ],
  scout: [
    { target: '.vs-side.a .slots', title: 'Counter them', text: '▲ means that monster hits one of theirs for +30%; ▼ means one of theirs hits it harder. Your Ember, Volt and Bloom each counter one of Coach Ravel\'s monsters.' },
    { target: '[data-act="tutfight"]', title: 'Lock in', text: 'The server decides the battle the moment you press Start training, then it plays back here.', buttons: [{ label: 'Got it', act: 'coachdone', primary: true }] },
  ],
};

function coachStep() {
  const steps = TUTORIAL[app.tutorial.phase];
  showCoach(steps[app.tutorial.step], [app.tutorial.step, steps.length]);
}

function startTutorial() {
  closeModal();
  app.tab = 'battle';
  app.screen = 'lobby';
  app.tutorial = { phase: 'lobby', step: 0 };
  render();
  window.scrollTo(0, 0);
  setTimeout(coachStep, 150);
}

function endTutorial() {
  hideCoach();
  app.tutorial = null;
}

// Battle callouts, each shown once: the first attack, a super-effective hit, a skill, a KO.
function battleCoach() {
  const seen = new Set();
  const once = (key, text) => (seen.has(key) ? null : (seen.add(key), text));
  const ours = (uid) => uid?.[0] === 'a';
  return (ev, res) => {
    if (ev.type === 'attack' && ours(ev.src)) return once('attack', 'Your monsters attack on their own. Green is HP; the blue mana bar fills as they fight.');
    if (ev.type === 'damage' && ev.adv > 0 && ours(ev.src)) return once('adv', '▲ Super effective! Hitting the element yours beats deals +30%.');
    if (ev.type === 'cast' && ours(ev.src)) {
      const u = res.start.find((x) => x.uid === ev.src);
      return once('cast', `Full mana: ${BY_ID[u.id].name} casts ${ev.name}.`);
    }
    if (ev.type === 'death' && !ours(ev.tgt)) return once('ko', 'Knocked out! Defeat all three to win.');
    return null;
  };
}

// The training battle: decided on the server, played back with callouts.
async function tutorialFight(_, btn) {
  if (app.busy) return;
  hideCoach();
  app.busy = true;
  btn.disabled = true;
  btn.textContent = 'Fighting…';
  let out;
  try {
    out = await api('POST', '/api/tutorial/fight', { lineup: app.me.player.lineup });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Start training';
    return failed(e);
  } finally {
    app.busy = false;
  }
  const { match, outcome } = out;
  app.me = out.me;
  app.tutorial = null;
  app.screen = 'battle';
  stopBattle();
  setScreen('battle');
  window.scrollTo(0, 0);
  app.battle = mountBattle($view, match, {
    label: 'TRAINING',
    coach: battleCoach(),
    onEnd: () => {
      $head.innerHTML = V.header(app.me, app.tab, false);
      openModal(V.tutorialResultModal(outcome), true);
    },
  });
}

function leaveDuel() {
  app.duel = null;
  if (location.hash.startsWith('#c=')) history.replaceState(null, '', location.pathname + location.search);
}

async function refresh() {
  try {
    app.me = await api('GET', '/api/me');
  } catch (e) {
    return failed(e);
  }
  render();
}

async function loadBoard() {
  try {
    app.board = await api('GET', '/api/leaderboard');
  } catch (e) {
    return failed(e);
  }
  if (app.tab === 'season' && !app.replay) render();
}

async function startMatch() {
  if (app.busy) return;
  app.busy = true;
  try {
    app.me.pending = (await api('POST', '/api/match/find')).pending;
  } catch (e) {
    return failed(e);
  } finally {
    app.busy = false;
  }
  app.screen = 'scout';
  app.tab = 'battle';
  render();
  window.scrollTo(0, 0);
}

// The server decides and saves the result before playback starts, so leaving
// mid-battle can't dodge a loss and the browser can't pick the outcome.
async function fight(_, btn) {
  const me = app.me;
  if (app.busy || !me.pending) return;
  app.busy = true;
  btn.disabled = true;
  btn.textContent = 'Fighting…';
  let out;
  try {
    out = await api('POST', '/api/match/fight', { id: me.pending.id, lineup: me.player.lineup });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Fight!';
    failed(e);
    if (e.status === 404 || e.status === 409) {
      app.screen = 'lobby';
      refresh();
    }
    return;
  } finally {
    app.busy = false;
  }
  const { match, outcome } = out;
  if (simulate(match).winner !== match.winner) console.warn(`Playback of ${match.id} differs from the server result`);
  app.me = out.me;
  app.board = null;
  app.screen = 'battle';
  stopBattle();
  setScreen('battle');
  window.scrollTo(0, 0);
  app.battle = mountBattle($view, match, {
    onEnd: () => {
      $head.innerHTML = V.header(app.me, app.tab, false);
      openModal(V.resultModal(outcome, match.id), true);
    },
  });
}

function playReplay() {
  const { match } = app.replay;
  setScreen('battle');
  window.scrollTo(0, 0);
  app.battle = mountBattle($view, match, {
    label: 'REPLAY',
    onEnd: () => openModal(V.replayEndModal(match), true),
  });
}

function leaveReplay() {
  app.replay = null;
  history.replaceState(null, '', location.pathname + location.search);
}

async function route() {
  // A challenge link opens the duel screen, unless it can't be fought by this player.
  const cid = /^#c=([\w-]{8})$/.exec(location.hash)?.[1];
  if (cid && app.me) {
    closeModal();
    let c = null;
    try {
      c = await api('GET', `/api/challenge/${cid}`);
    } catch (e) {
      toast(e.status === 404 ? 'That challenge was not found' : e.message, 3000);
    }
    if (c && !c.mine && !c.fought && !c.expired) {
      app.duel = c;
      app.tab = 'battle';
      app.screen = 'duel';
      render();
      return;
    }
    leaveDuel();
    if (c?.mine) toast('This is your own challenge link. Send it to a friend!', 3200);
    else if (c?.fought) {
      toast(`You already took ${c.from.name}'s challenge. Here is the replay.`, 3200);
      location.replace(`#m=${c.fought}`);
      return;
    } else if (c?.expired) toast('That challenge has expired. Ask your friend for a new link.', 3200);
  }
  const id = /^#m=([\w-]{11})$/.exec(location.hash)?.[1];
  if (id) {
    closeModal();
    try {
      app.replay = { match: await api('GET', `/api/match/${id}`) };
      render();
      return;
    } catch (e) {
      leaveReplay();
      toast(e.status === 404 ? 'That replay was not found' : e.message);
    }
  }
  if (app.replay) leaveReplay();
  render();
}

// Lineup edits apply at once on screen; saves go out one at a time so the last one wins.
let saving = Promise.resolve();
function saveLineup() {
  const lineup = [...app.me.player.lineup];
  saving = saving.then(() => api('POST', '/api/lineup', { lineup })).catch((e) => {
    failed(e);
    refresh();
  });
}

function signedInToast(result) {
  if (result === 'switched') return 'Welcome back! Loaded the progress saved on this wallet.';
  if (result === 'linked') return 'Wallet connected. Your progress is saved to it.';
  return 'Signed in';
}

// Claims pass rewards and says what they were (levels gained from tomes included).
async function claimPass(body, btn) {
  btn.disabled = true;
  let out;
  try {
    out = await api('POST', '/api/pass/claim', body);
  } catch (e) {
    btn.disabled = false;
    return failed(e);
  }
  app.me = out.me;
  render();
  const eggs = out.rewards.filter((r) => r.type === 'egg').length;
  const titles = out.rewards.filter((r) => r.type === 'title').map((r) => TITLES[r.id]);
  const xp = out.rewards.filter((r) => r.type === 'tome').reduce((a, r) => a + r.xp, 0);
  const ups = new Set(out.rewards.flatMap((r) => r.squad ?? []).filter((m) => m.to > m.from).map((m) => m.id));
  const parts = [eggs && `${eggs} egg${eggs > 1 ? 's' : ''}`, xp && `+${xp} squad XP`, ...titles.map((t) => `title ${t}`)].filter(Boolean);
  toast(`Claimed ${parts.join(', ')}${ups.size ? ` · ${ups.size} monster${ups.size > 1 ? 's' : ''} levelled up` : ''}`, 3200);
  if (eggs) setTimeout(() => toast('Hatch your egg in the lobby', 2600), 600);
}

const actions = {
  tab(t) {
    if (app.replay) leaveReplay();
    leaveDuel();
    endTutorial();
    app.tab = t;
    app.screen = 'lobby';
    closeModal();
    render();
    if (t === 'season') loadBoard();
  },
  find: startMatch,
  again() { closeModal(); startMatch(); },
  back() { leaveDuel(); endTutorial(); app.screen = 'lobby'; render(); },
  // The tutorial.
  tutorial: startTutorial,
  coachnext() { app.tutorial.step++; coachStep(); },
  coachdone() { hideCoach(); },
  async coachskip() {
    endTutorial();
    if (app.screen === 'training') { app.screen = 'lobby'; render(); }
    try {
      app.me = await api('POST', '/api/tutorial/skip');
    } catch (e) {
      return failed(e);
    }
    toast('Tutorial skipped. "How to play" in the lobby brings it back.', 3200);
  },
  tutscout() {
    app.screen = 'training';
    app.tutorial = { phase: 'scout', step: 0 };
    render();
    window.scrollTo(0, 0);
    setTimeout(coachStep, 450);
  },
  tutfight: tutorialFight,
  duel,
  // Your squad as a challenge link: copied, or posted on X. The X window opens at once
  // (inside the click), so popup blockers let it through, and gets its address after.
  async challenge(mode, btn) {
    const win = mode === 'x' ? window.open('about:blank', '_blank') : null;
    btn.disabled = true;
    let c;
    try {
      ({ challenge: c } = await api('POST', '/api/challenge'));
    } catch (e) {
      win?.close();
      return failed(e);
    } finally {
      btn.disabled = false;
    }
    app.me.friends.challenge = c;
    const url = challengeUrl(c.id);
    if (!win) return copyText(url, 'Challenge link copied. Send it to a friend!');
    const text = 'Think you can beat my Fangbound squad? Take my challenge ⚔️';
    win.opener = null;
    win.location.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  },
  invite() { copyText(inviteUrl(app.me.friends.code), 'Invite link copied'); },
  // The $FANG shop: each purchase returns the new state.
  async buy(item, btn) {
    btn.disabled = true;
    let out;
    try {
      out = await api('POST', '/api/shop/buy', { item });
    } catch (e) {
      btn.disabled = false;
      return failed(e);
    }
    app.me = out.me;
    render();
    const r = out.result;
    const msg = {
      egg: 'Egg bought. Hatch it in the lobby.',
      tome: `Training tome: +${r.xp} XP to your squad${r.essence ? ` and +${r.essence} essence` : ''}`,
      essence: `+${r.n} essence`,
      boost: 'XP ×2 is running for 24 hours',
      reroll: 'One more quest swap today',
      raid: 'One more raid today',
      premium: 'Premium track unlocked. Claim your rewards on the Pass tab.',
    }[r.type];
    toast(msg ?? 'Bought', 3000);
  },
  // Night of Fangs
  raid,
  treat: (_, btn) => eventCall('/api/event/treat', btn, V.treatModal),
  pumpkin: (_, btn) => eventCall('/api/event/egg', btn, V.pumpkinModal),
  async gift(i, btn) {
    const r = await eventCall('/api/event/gift', btn, null, { i: Number(i) });
    if (!r) return;
    if (r.type === 'pumpkin') openModal(V.pumpkinModal(r.egg));
    else toast(r.type === 'candy' ? `Community gift: +${r.n} candy` : `Community gift: title ${TITLES[r.id]}`, 3000);
  },
  lobby() { closeModal(); app.tab = 'battle'; app.screen = 'lobby'; render(); },
  retry: boot,
  slot(i) { app.slot = Number(i); openModal(V.pickerModal(app.me.player, app.slot)); },
  pick(id) {
    const L = app.me.player.lineup;
    const j = L.indexOf(id);
    if (j >= 0) [L[app.slot], L[j]] = [L[j], L[app.slot]];
    else L[app.slot] = id;
    saveLineup();
    closeModal();
    render();
  },
  move(arg) {
    const [i, d] = arg.split(':').map(Number);
    const L = app.me.player.lineup;
    if (i + d < 0 || i + d > 2) return;
    [L[i], L[i + d]] = [L[i + d], L[i]];
    saveLineup();
    render();
  },
  fight,
  async hatch() {
    try {
      openModal(V.hatchModal((await api('POST', '/api/egg/open')).options));
    } catch (e) {
      failed(e);
    }
  },
  async hatchpick(id) {
    try {
      app.me = await api('POST', '/api/egg/hatch', { id });
    } catch (e) {
      return failed(e);
    }
    render();
    openModal(V.hatchedModal(id));
  },
  // Wide screens show the monster in the side panel; narrow ones (panel hidden) in a sheet.
  mon(id) {
    if (document.querySelector('.mon-side')?.offsetParent) {
      app.sel = id;
      render();
    } else openModal(V.detailModal(app.me.player, id));
  },
  filter(el) { app.filter = el; render(); },
  async evolve(id, btn) {
    btn.disabled = true;
    try {
      app.me = await api('POST', '/api/monster/evolve', { id });
    } catch (e) {
      btn.disabled = false;
      return failed(e);
    }
    render();
    openModal(V.evolveScene(app.me.player, id));
  },
  // Daily quests, check-in and the season pass: each call returns the new state.
  async checkin(_, btn) {
    btn.disabled = true;
    try {
      const { reward, me } = await api('POST', '/api/daily/checkin');
      app.me = me;
      render();
      toast(`Day ${reward.streak} check-in · +${reward.xp} pass XP${reward.to > reward.from ? ` · tier ${reward.to} reached!` : ''}`, 2600);
    } catch (e) {
      btn.disabled = false;
      failed(e);
    }
  },
  async reroll(i, btn) {
    btn.disabled = true;
    try {
      app.me = await api('POST', '/api/quest/reroll', { slot: Number(i) });
      render();
      toast('New quest swapped in');
    } catch (e) {
      btn.disabled = false;
      failed(e);
    }
  },
  claim(arg, btn) {
    const [tier, track] = arg.split(':');
    return claimPass({ tier: Number(tier), track }, btn);
  },
  claimall(_, btn) { return claimPass({ all: true }, btn); },
  async title(id) {
    try {
      app.me = await api('POST', '/api/title', { id: id || null });
    } catch (e) {
      return failed(e);
    }
    render();
    toast(id ? `Now wearing ${TITLES[id]}` : 'Title taken off');
  },
  close: closeModal,
  watch(id) { location.hash = `m=${id}`; },
  rewatch() { closeModal(); render(); },
  exitReplay() { closeModal(); leaveReplay(); app.tab = 'battle'; app.screen = 'lobby'; render(); },
  async copy(id) {
    const url = replayUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      toast('Replay link copied');
    } catch {
      window.prompt('Copy this replay link', url);
    }
  },
  share(id) {
    const h = app.me?.history.find((x) => x.id === id);
    const text = h?.won
      ? `My Fangbound squad just beat ${h.opp} in ranked ⚔️ Watch the replay:`
      : 'Close fight in Fangbound ranked. Watch the replay:';
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(replayUrl(id))}`, '_blank', 'noopener');
  },
  connect() { openModal(V.connectModal(listWallets(), browseLinks(location.href))); },
  async signin(name) {
    if (app.signing) return;
    app.signing = name;
    openModal(V.connectModal(listWallets(), [], name));
    try {
      const me = await api('POST', '/api/auth/sign-in', await signWithWallet(name));
      app.me = me;
      app.board = null;
      app.screen = 'lobby';
      closeModal();
      render();
      if (app.tab === 'season') loadBoard();
      toast(signedInToast(me.result), 3000);
      awayToast(me.away);
    } catch (e) {
      openModal(V.connectModal(listWallets(), browseLinks(location.href)));
      toast(cancelled(e) ? 'Sign-in cancelled in the wallet' : e.message, 3500);
    } finally {
      app.signing = null;
    }
  },
  account() { openModal(V.accountModal(app.me)); },
  async copyaddr() {
    try {
      await navigator.clipboard.writeText(app.me.wallet);
      toast('Address copied');
    } catch {
      window.prompt('Your wallet address', app.me.wallet);
    }
  },
  async signout() {
    await api('POST', '/api/auth/sign-out').catch(() => {});
    closeModal();
    app.board = null;
    app.tab = 'battle';
    app.screen = 'lobby';
    toast('Signed out');
    boot();
  },
};

document.addEventListener('click', (e) => {
  const overlay = e.target.closest('.overlay');
  if (overlay && e.target === overlay && !overlay.hasAttribute('data-sticky')) return closeModal();
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) actions[el.dataset.act]?.(el.dataset.arg, el);
});

document.addEventListener('change', async (e) => {
  if (!e.target.matches('[data-input="name"]')) return;
  const input = e.target;
  try {
    const { name } = await api('POST', '/api/profile', { name: input.value });
    app.me.player.name = name;
    input.value = name;
  } catch (err) {
    failed(err);
  }
});

document.addEventListener('keydown', (e) => {
  const overlay = $modal.querySelector('.overlay');
  if (e.key === 'Escape' && overlay && !overlay.hasAttribute('data-sticky')) closeModal();
});

window.addEventListener('hashchange', route);
boot();
