// Coach marks for the tutorial: a spotlight on one element at a time and a card that
// explains it. The overlay takes the clicks (only the card's buttons work), so the player
// follows the steps or skips them. The card's buttons are ordinary data-act buttons.
let el = null;
let step = null;
let raf = 0;

// step: { target (selector), title, text, buttons: [{ label, act, primary }] }; at: [i, n].
export function showCoach(next, [i, n]) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'coach';
    el.innerHTML = '<div class="coach-hole"></div><div class="coach-card" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(el);
  }
  step = next;
  document.querySelector(step.target)?.scrollIntoView({ block: 'center' });
  const buttons = step.buttons ?? [{ label: 'Next', act: 'coachnext', primary: true }];
  el.querySelector('.coach-card').innerHTML = `<small class="coach-n">Tutorial · ${i + 1} of ${n}</small>
<h3>${step.title}</h3><p>${step.text}</p>
<div class="coach-row">${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${b.act}">${b.label}</button>`).join('')}
<button class="linkbtn" data-act="coachskip">Skip tutorial</button></div>`;
  el.hidden = false;
  cancelAnimationFrame(raf);
  const follow = () => { place(); raf = requestAnimationFrame(follow); };
  follow();
}

export function hideCoach() {
  cancelAnimationFrame(raf);
  if (el) el.hidden = true;
  step = null;
}

export const coachOpen = () => !!step;

// The spotlight follows its target (screens re-render and pages scroll); the card sits
// below it, or above when there's no room, inside the window.
function place() {
  const hole = el.querySelector('.coach-hole');
  const card = el.querySelector('.coach-card');
  const t = document.querySelector(step.target);
  const r = t?.getBoundingClientRect();
  const W = innerWidth;
  const H = innerHeight;
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  if (!r || !r.width) {
    hole.hidden = true;
    card.style.left = `${(W - cw) / 2}px`;
    card.style.top = `${(H - ch) / 2}px`;
    return;
  }
  const pad = 8;
  hole.hidden = false;
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const gap = 16;
  const below = r.bottom + pad + gap;
  const top = below + ch <= H - 8 ? below : Math.max(8, r.top - pad - gap - ch);
  card.style.top = `${top}px`;
  card.style.left = `${Math.min(W - cw - 8, Math.max(8, r.left + r.width / 2 - cw / 2))}px`;
}
