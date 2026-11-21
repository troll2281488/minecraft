/** Small, save-friendly Java-style advancement criterion engine. */
export const ADVANCEMENTS = Object.freeze({
  story_mine_stone: { criteria: ['stone'], title: 'Stone Age' },
  story_upgrade_tools: { criteria: ['stone_pickaxe'], title: 'Getting an Upgrade' },
  story_smelt_iron: { criteria: ['iron_ingot'], title: 'Acquire Hardware' },
  story_obtain_diamond: { criteria: ['diamond'], title: 'Diamonds!' },
  story_enter_nether: { criteria: ['nether'], title: 'We Need to Go Deeper' },
  adventure_kill_mob: { criteria: ['hostile'], title: 'Monster Hunter' },
  adventure_trade: { criteria: ['trade'], title: 'What a Deal!' },
  husbandry_breed_animal: { criteria: ['breed'], title: 'The Parrots and the Bats' },
  husbandry_tame_animal: { criteria: ['tame'], title: 'Best Friends Forever' },
  husbandry_fish: { criteria: ['fish'], title: 'A Fishy Business' },
  nether_obtain_blaze_rod: { criteria: ['blaze_rod'], title: 'Into Fire' },
  end_enter: { criteria: ['end'], title: 'The End?' },
  adventure_throw_trident: { criteria: ['trident'], title: 'A Throwaway Joke' },
  adventure_shoot_crossbow: { criteria: ['crossbow'], title: "Ol' Betsy" },
  adventure_channeling: { criteria: ['lightning'], title: 'Channeling' },
  adventure_very_very_frightening: { criteria: ['lightning_villager'], title: 'Very Very Frightening' },
});

export function createAdvancementState(saved = {}) {
  const result = {};
  for (const [id, definition] of Object.entries(ADVANCEMENTS)) {
    const prior = saved?.[id];
    const earned = Array.isArray(prior?.criteria) ? prior.criteria.filter((key) => definition.criteria.includes(key)) : [];
    result[id] = { criteria: [...new Set(earned)], done: definition.criteria.every((key) => earned.includes(key)), completedAt: Number.isFinite(prior?.completedAt) ? prior.completedAt : null };
  }
  return result;
}

export function awardAdvancementCriterion(state, advancementId, criterion, timestamp = 0) {
  const definition = ADVANCEMENTS[advancementId];
  const current = state?.[advancementId];
  if (!definition || !current || current.done || !definition.criteria.includes(criterion)) return { awarded: false, completed: false };
  if (current.criteria.includes(criterion)) return { awarded: false, completed: current.done };
  current.criteria.push(criterion);
  current.done = definition.criteria.every((key) => current.criteria.includes(key));
  if (current.done) current.completedAt = Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0;
  return { awarded: true, completed: current.done, advancementId, criterion };
}

export function processAdvancementEvent(state, event, timestamp = 0) {
  const routes = {
    mined_stone: ['story_mine_stone', 'stone'], crafted_stone_pickaxe: ['story_upgrade_tools', 'stone_pickaxe'],
    acquired_iron_ingot: ['story_smelt_iron', 'iron_ingot'], acquired_diamond: ['story_obtain_diamond', 'diamond'],
    entered_nether: ['story_enter_nether', 'nether'], killed_hostile: ['adventure_kill_mob', 'hostile'],
    traded_with_villager: ['adventure_trade', 'trade'], bred_animal: ['husbandry_breed_animal', 'breed'],
    tamed_animal: ['husbandry_tame_animal', 'tame'], caught_fish: ['husbandry_fish', 'fish'],
    acquired_blaze_rod: ['nether_obtain_blaze_rod', 'blaze_rod'], entered_end: ['end_enter', 'end'],
    threw_trident: ['adventure_throw_trident', 'trident'], shot_crossbow: ['adventure_shoot_crossbow', 'crossbow'],
    channelled_lightning: ['adventure_channeling', 'lightning'],
    struck_villager_with_lightning: ['adventure_very_very_frightening', 'lightning_villager'],
  };
  const route = routes[event];
  return route ? awardAdvancementCriterion(state, route[0], route[1], timestamp) : { awarded: false, completed: false };
}

export function serializeAdvancementState(state) {
  const result = {};
  for (const [id, value] of Object.entries(state || {})) {
    if (!ADVANCEMENTS[id] || !value || !Array.isArray(value.criteria)) continue;
    const criteria = value.criteria.filter((key) => ADVANCEMENTS[id].criteria.includes(key));
    if (criteria.length) result[id] = { criteria: [...new Set(criteria)], ...(Number.isFinite(value.completedAt) ? { completedAt: value.completedAt } : {}) };
  }
  return result;
}
