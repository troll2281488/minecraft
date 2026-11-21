/**
 * Bucket rules, Java 1.12.2. Pure functions over ItemStacks.
 *
 * Empty bucket on a water source -> water bucket. Water bucket used on the air or a
 * replaceable block -> water source and an empty bucket. Lava is the same with lava.
 * Only the picking and emptying of a single bucket is modelled here; placement into
 * the world is the caller's job.
 */
import { ItemStack } from '../world/item.js';

export const FLUID_BUCKET = Object.freeze({
  'mc:water': 'mc:water_bucket',
  'mc:lava': 'mc:lava_bucket',
});

/** Result of scooping a fluid with an empty bucket, or null if it cannot be scooped. */
export function scoopFluid(bucket, fluidBlockId) {
  if (!bucket || bucket.isEmpty || bucket.item.id !== 'mc:bucket') return null;
  const filled = FLUID_BUCKET[fluidBlockId];
  if (!filled) return null;
  return ItemStack.of(filled, 1);
}

/** Result of emptying a filled bucket: the empty bucket, and the fluid id to place. */
export function emptyBucket(bucket) {
  if (!bucket || bucket.isEmpty) return null;
  const fluid = Object.entries(FLUID_BUCKET).find(([, id]) => id === bucket.item.id);
  if (!fluid) return null;
  return { fluid: fluid[0], bucket: ItemStack.of('mc:bucket', 1) };
}

/** Describe a right-click bucket action without mutating world or inventory. */
export function planBucketInteraction(heldItemId, hitBlockId, hitLevel, targetBlock) {
  if (heldItemId === 'mc:bucket') {
    const filled = FLUID_BUCKET[hitBlockId];
    return filled && (hitLevel === 0 || hitLevel === undefined)
      ? { type: 'scoop', resultItem: filled, removeHit: true }
      : null;
  }
  const fluid = Object.entries(FLUID_BUCKET).find(([, itemId]) => itemId === heldItemId)?.[0];
  if (!fluid || !targetBlock || (targetBlock.id !== 'mc:air' && !targetBlock.replaceable)) return null;
  return { type: 'place', fluid, resultItem: 'mc:bucket' };
}
