/**
 * Java 1.19 water-cauldron interactions.
 * A cauldron stores water in three discrete levels. Item conversion is kept
 * pure so the game action can apply the state and inventory change atomically.
 */
const EMPTY_BUCKET = 'mc:bucket';
const WATER_BUCKET = 'mc:water_bucket';
const GLASS_BOTTLE = 'mc:glass_bottle';
const WATER_BOTTLE = 'mc:water_bottle';

export function planCauldronInteraction(itemId, level) {
  if (!Number.isInteger(level) || level < 0 || level > 3) return null;
  if (itemId === WATER_BUCKET && level < 3) {
    return { nextLevel: 3, resultItem: EMPTY_BUCKET, message: 'Котёл наполнен водой' };
  }
  if (itemId === EMPTY_BUCKET && level === 3) {
    return { nextLevel: 0, resultItem: WATER_BUCKET, message: 'Вода набрана из котла' };
  }
  if (itemId === GLASS_BOTTLE && level > 0) {
    return { nextLevel: level - 1, resultItem: WATER_BOTTLE, message: 'Получена бутылочка воды' };
  }
  if (itemId === WATER_BOTTLE && level < 3) {
    return { nextLevel: level + 1, resultItem: GLASS_BOTTLE, message: 'Бутылочка воды вылита в котёл' };
  }
  return null;
}
