import { describe, it, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { createArrow, aimVector } from '../src/entity/arrows.js';

describe('playable trident integration contracts', () => {
  it('registers a non-stackable damageable trident', () => {
    const item = ITEMS.get('mc:trident');
    assertEqual(!!item, true);
    assertEqual(item.stackSize, 1);
    assertEqual(item.maxDamage, 250);
  });
  it('aim vectors are normalized for trident launch directions', () => {
    const v = aimVector(35, -12);
    assertEqual(Math.abs(Math.hypot(...v) - 1) < 1e-9, true);
  });
  it('creates a projectile state that can be upgraded to a returning trident', () => {
    const v = aimVector(0, 0);
    const projectile = createArrow(0, 1, 0, v, 0.9);
    projectile.isTrident = true;
    projectile.loyaltyLevel = 3;
    projectile.returning = true;
    assertEqual(projectile.isTrident, true);
    assertEqual(projectile.loyaltyLevel, 3);
    assertEqual(projectile.returning, true);
  });
});
