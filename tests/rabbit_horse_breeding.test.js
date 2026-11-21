import { describe, it, assertEqual } from './framework.js';
import { canBreedAnimalWith, BREEDING_FOODS, MobSystem } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';

describe('Java rabbit and horse breeding', () => {
  it('accepts Java rabbit breeding foods', () => {
    assertEqual(canBreedAnimalWith('rabbit', 'mc:carrot'), true);
    assertEqual(canBreedAnimalWith('rabbit', 'mc:golden_carrot'), true);
    assertEqual(canBreedAnimalWith('rabbit', 'mc:dandelion'), true);
    assertEqual(canBreedAnimalWith('rabbit', 'mc:wheat'), false);
  });

  it('accepts golden foods for horse breeding only', () => {
    assertEqual(canBreedAnimalWith('horse', 'mc:golden_carrot'), true);
    assertEqual(canBreedAnimalWith('horse', 'mc:golden_apple'), true);
    assertEqual(canBreedAnimalWith('horse', 'mc:carrot'), false);
    assertEqual(canBreedAnimalWith('cow', 'mc:golden_carrot'), false);
  });

  it('keeps the existing cow, pig, sheep and chicken food rules', () => {
    assertEqual(canBreedAnimalWith('cow', 'mc:wheat'), true);
    assertEqual(canBreedAnimalWith('pig', 'mc:potato'), true);
    assertEqual(canBreedAnimalWith('sheep', 'mc:wheat'), true);
    assertEqual(canBreedAnimalWith('chicken', 'mc:wheat_seeds'), true);
    assertEqual(canBreedAnimalWith('chicken', 'mc:wheat'), false);
  });

  it('does not expose mutable shared breeding food lists', () => {
    assertEqual(Object.isFrozen(BREEDING_FOODS), true);
    assertEqual(Object.isFrozen(BREEDING_FOODS.rabbit), true);
  });
});
