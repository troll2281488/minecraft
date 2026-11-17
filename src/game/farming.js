/**
 * Small, persistent crop-growth rules for the survival farming loop.
 * Growth is advanced from blockstate age, so saving/reloading needs no side data.
 */
export const WHEAT_CROP_ID = 'mc:wheat';

export function nextWheatAge(state) {
  if (state?.block?.id !== WHEAT_CROP_ID) return null;
  const age = state.get('age');
  return age >= 7 ? null : age + 1;
}

/** Grow crops in the loaded area around the player every 30 seconds. */
export function growNearbyWheat(world, player, tickCount) {
  if (!world || !player || tickCount % 600 !== 0) return [];
  const changed = [];
  const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
  for (let x = px - 6; x <= px + 6; x++) {
    for (let z = pz - 6; z <= pz + 6; z++) {
      for (let y = py - 3; y <= py + 4; y++) {
        const state = world.getBlock(x, y, z);
        const age = nextWheatAge(state);
        if (age === null) continue;
        if (world.getBlock(x, y - 1, z).block.id !== 'mc:farmland') continue;
        const next = state.with('age', age);
        if (world.setBlock(x, y, z, next)) changed.push({ x, y, z, state: next });
      }
    }
  }
  return changed;
}
