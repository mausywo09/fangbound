// The $FANG shop: paying saves time, it never buys power. Every item here can also be
// earned by playing, levels and evolutions cap the same for everyone, and nothing sold
// changes a battle's numbers. Shared by the server (which charges and applies) and the
// browser (which shows prices, limits and what is running).
//
// Until $FANG is live the shop is shown but closed (SHOP=off). SHOP=test gives every
// player a separate test balance for local testing; it never mixes with real $FANG.
import { lockedIds } from './state.js';
import { DAY_MS, grant } from './pass.js';

// Prices are placeholders in $FANG until the token's price is known.
export const SHOP_ITEMS = {
  egg: { name: 'Monster egg', price: 300, limit: 2, icon: 'egg', desc: 'One egg: pick 1 of 3 monsters you are still missing (same odds as earned eggs).' },
  tome: { name: 'Training tome', price: 120, limit: 5, icon: 'tome', desc: '+12 XP to each monster in your squad.' },
  essence: { name: 'Essence vial', price: 200, limit: 2, icon: 'mystic', desc: '+30 essence toward evolutions.' },
  xp2: { name: 'XP ×2 · 24 h', price: 250, limit: 1, icon: 'volt', booster: true, desc: 'Double the monster XP and pass XP from ranked matches for 24 hours.' },
  reroll: { name: 'Quest swap', price: 50, limit: 3, icon: 'ribbon', desc: 'Swap one more daily quest today.' },
  raid: { name: 'Raid ticket', price: 100, limit: 2, icon: 'ghost', event: true, desc: 'One more Hollow King raid today (during Night of Fangs).' },
  premium: { name: 'Premium pass', price: 1000, limit: 1, icon: 'crown', season: true, desc: "Unlock this season's premium track: a second reward on every tier, claimable at once for tiers you reached." },
};
export const ESSENCE_VIAL = 30;
export const TOME_XP = 12;
// Half of every $FANG spent in the shop is burned (the token plan; shown on the shop page).
export const BURN_SHARE = 0.5;
export const TEST_BALANCE = 5000;

// A new UTC day resets the daily limits; boosters run on their own clocks.
export function syncShop(s, day) {
  s.fang ??= 0;
  s.boosts ??= {};
  if (s.shop?.day !== day) s.shop = { day, bought: {}, spent: s.shop?.spent ?? 0 };
}

export const boostLeft = (s, key, now) => Math.max(0, (s.boosts?.[key] ?? 0) - now);
export const xpMult = (s, now) => (boostLeft(s, 'xp2', now) > 0 ? 2 : 1);
export const boughtToday = (s, item) => s.shop?.bought?.[item] ?? 0;

// Why an item can't be bought now (null when it can). balance: the wallet being charged.
export function buyBlock(s, item, { now, balance, event }) {
  const it = Object.hasOwn(SHOP_ITEMS, item) ? SHOP_ITEMS[item] : null;
  if (!it) return 'That item is not in the shop.';
  if (item === 'xp2' && boostLeft(s, 'xp2', now) > 0) return 'XP ×2 is already running.';
  if (boughtToday(s, item) >= it.limit && !it.season) return `Daily limit reached (${it.limit} a day).`;
  if (item === 'egg' && lockedIds(s).length <= s.eggs) return 'You already have an egg for every monster left to hatch.';
  if (item === 'premium' && s.pass.premium) return 'Premium is already unlocked this season.';
  if (item === 'raid' && !(event && s.event?.id === event)) return 'Raid tickets work during an event.';
  if (item === 'reroll' && !s.daily.rerolled) return "You still have today's free quest swap.";
  if (balance < it.price) return `Not enough $FANG (${it.price} needed).`;
  return null;
}

// Applies a purchase that buyBlock allowed. The caller takes the price off the balance.
export function applyItem(s, item, now) {
  s.shop.bought[item] = boughtToday(s, item) + 1;
  s.shop.spent += SHOP_ITEMS[item].price;
  if (item === 'egg') { s.eggs++; return { type: 'egg' }; }
  if (item === 'tome') return grant(s, { type: 'tome', xp: TOME_XP });
  if (item === 'essence') { s.essence += ESSENCE_VIAL; return { type: 'essence', n: ESSENCE_VIAL }; }
  if (item === 'xp2') { s.boosts.xp2 = now + DAY_MS; return { type: 'boost', until: s.boosts.xp2 }; }
  if (item === 'reroll') { s.daily.rerolled = false; return { type: 'reroll' }; }
  if (item === 'raid') { s.event.boss.extra = (s.event.boss.extra ?? 0) + 1; return { type: 'raid' }; }
  s.pass.premium = true;
  return { type: 'premium' };
}
