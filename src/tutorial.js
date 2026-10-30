// The first-match tutorial: a training battle against a team the starter squad counters
// (Ember beats their Bloom front, Volt their Tide, Bloom their Stone), decided on the
// server like any match but with no rating at stake. The first one pays a small reward.
// Shared by the server (the fight and the reward) and the browser (who sees the tutorial).

export const TRAINING = {
  name: 'Coach Ravel', title: null, rating: 1000, bot: true, training: true,
  team: [{ id: 'thornhog', level: 1 }, { id: 'shellguard', level: 1 }, { id: 'bouldrake', level: 1 }],
};
export const TUTORIAL_XP = 150; // pass XP
export const TUTORIAL_TOME = 12; // XP for each monster in the squad
// The server tries seeds from here until the player's squad wins (a first win teaches best).
export const TRAINING_SEED = 20261030;
export const TRAINING_TRIES = 64;

// A brand-new player who hasn't finished or skipped the tutorial.
export const needsTutorial = (s) => !s.tutorial && s.wins + s.losses === 0;
