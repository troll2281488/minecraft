/** Java campfire food preparation: one occupied cooking spot per block. */
export const CAMPFIRE_COOK_TICKS = 30;

export const CAMPFIRE_FOOD = Object.freeze({
  'mc:raw_beef': 'mc:cooked_beef',
  'mc:raw_porkchop': 'mc:cooked_porkchop',
  'mc:raw_chicken': 'mc:cooked_chicken',
  'mc:raw_mutton': 'mc:cooked_mutton',
  'mc:raw_rabbit': 'mc:cooked_rabbit',
  'mc:raw_cod': 'mc:cooked_cod',
  'mc:raw_salmon': 'mc:cooked_salmon',
});

export function planCampfireFoodInteraction(state, heldItemId = null) {
  if (state?.block?.id !== 'mc:campfire') return null;
  const food = state.get('food') || 'none';
  const cookTime = state.get('cook_time') || 0;
  if (food === 'none' && CAMPFIRE_FOOD[heldItemId]) {
    return {
      type: 'insert',
      state: state.with('food', heldItemId.slice(3)).with('cook_time', 0),
    };
  }
  if (!heldItemId && food.startsWith('cooked_') && cookTime >= CAMPFIRE_COOK_TICKS) {
    return {
      type: 'collect',
      itemId: 'mc:' + food,
      state: state.with('food', 'none').with('cook_time', 0),
    };
  }
  return null;
}

/** Advance campfires close to the active player without loading/generating chunks. */
export function tickCampfireCooking(world, player) {
  if (!world || !player || typeof world.getBlock !== 'function' || typeof world.setBlock !== 'function') return [];
  const changes = [];
  const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
  for (let x = px - 6; x <= px + 6; x++) {
    for (let z = pz - 6; z <= pz + 6; z++) {
      if (world.hasChunk && !world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      for (let y = py - 4; y <= py + 5; y++) {
        const state = world.getBlock(x, y, z);
        if (state?.block?.id !== 'mc:campfire' || state.get('lit') === false) continue;
        const food = state.get('food') || 'none';
        if (!Object.hasOwn(CAMPFIRE_FOOD, 'mc:' + food)) continue;
        const nextTime = Math.min(CAMPFIRE_COOK_TICKS, (state.get('cook_time') || 0) + 1);
        const nextFood = nextTime >= CAMPFIRE_COOK_TICKS ? CAMPFIRE_FOOD['mc:' + food].slice(3) : food;
        const next = state.with('food', nextFood).with('cook_time', nextTime);
        if (world.setBlock(x, y, z, next)) changes.push({ x, y, z, state: next });
      }
    }
  }
  return changes;
}
