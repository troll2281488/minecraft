import { describe, it, assertEqual } from './framework.js';
import { beginCrossbowLoad, crossbowLoadProgress, finishCrossbowLoad, crossbowShotPlan, consumeCrossbowCharge, canPierceAdditionalTarget } from '../src/game/crossbow.js';
import { createTridentProjectile, stepTrident, tridentReturnVelocity, riptideImpulse, impalingBonusDamage, canChannelLightning } from '../src/game/trident.js';
import { ADVANCEMENTS, createAdvancementState, awardAdvancementCriterion, processAdvancementEvent, serializeAdvancementState } from '../src/game/advancements.js';

describe('crossbow loading and firing', () => {
  it('requires a crossbow and starts an unloaded charge', () => {
    assertEqual(beginCrossbowLoad({ item: { id: 'mc:bow' } }, 10), null);
    assertEqual(beginCrossbowLoad({ item: { id: 'mc:crossbow' } }, 10).loadingSince, 10);
  });
  it('tracks charge progress and rejects early release', () => {
    const state = beginCrossbowLoad({ item: { id: 'mc:crossbow' } }, 100);
    assertEqual(crossbowLoadProgress(state, 112.5), 0.5);
    assertEqual(finishCrossbowLoad(state, 124), null);
    assertEqual(finishCrossbowLoad(state, 125).charged, true);
  });
  it('supports three-bolt Multishot and one-projectile fireworks', () => {
    const loaded = finishCrossbowLoad({ loadingSince: 0 }, 25);
    assertEqual(crossbowShotPlan(loaded, 1, 0).length, 3);
    const firework = finishCrossbowLoad({ loadingSince: 0 }, 25, 'mc:firework_rocket');
    assertEqual(crossbowShotPlan(firework, 1, 0).length, 1);
  });
  it('consumes charge only after a valid shot and bounds Piercing', () => {
    const loaded = finishCrossbowLoad({ loadingSince: 0 }, 25);
    assertEqual(consumeCrossbowCharge(loaded).charged, false);
    const shot = crossbowShotPlan(loaded, 0, 9)[0];
    assertEqual(shot.piercingLevel, 4);
    assertEqual(canPierceAdditionalTarget(shot, 4), true);
    assertEqual(canPierceAdditionalTarget(shot, 5), false);
  });
});

describe('trident flight and enchantments', () => {
  it('normalizes launch direction and collides with mobs and blocks', () => {
    const trident = createTridentProjectile(0, 1, 0, [0, 0, 5]);
    assertEqual(Math.round(trident.vz * 100) / 100, 2.5);
    const hit = stepTrident(trident, () => false, [{ x: 0, y: 1, z: 2, health: 10 }]);
    assertEqual(hit.hit, 'mob');
    assertEqual(trident.stuck, true);
  });
  it('returns Loyalty tridents toward their owner', () => {
    const trident = createTridentProjectile(4, 2, 0, [1, 0, 0], { loyalty: 2 });
    const velocity = tridentReturnVelocity(trident, { x: 0, y: 1, z: 0 });
    assertEqual(velocity.caught, false);
    assertEqual(velocity.vx < 0, true);
    assertEqual(tridentReturnVelocity(trident, { x: 4, y: 1, z: 0 }).caught, true);
  });
  it('applies Riptide only in water or rain and scales Impaling targets', () => {
    assertEqual(riptideImpulse(0, 0, 2, false), null);
    assertEqual(riptideImpulse(0, 0, 2, true).z, 3);
    assertEqual(impalingBonusDamage(3, { type: 'guardian' }, false), 7.5);
    assertEqual(impalingBonusDamage(3, { type: 'zombie' }, false), 0);
    assertEqual(impalingBonusDamage(3, { type: 'zombie' }, true), 7.5);
  });
  it('requires thunder and exposed sky for Channeling', () => {
    assertEqual(canChannelLightning({ thunder: true, skyVisible: true, targetExposed: true }), true);
    assertEqual(canChannelLightning({ thunder: false, skyVisible: true, targetExposed: true }), false);
  });
});

describe('advancement criteria and save data', () => {
  it('defines Java-era advancement goals and initializes a clean state', () => {
    assertEqual(Boolean(ADVANCEMENTS.story_obtain_diamond), true);
    assertEqual(createAdvancementState().story_obtain_diamond.done, false);
  });
  it('awards valid event criteria once and timestamps completed goals', () => {
    const state = createAdvancementState();
    assertEqual(processAdvancementEvent(state, 'acquired_diamond', 1234).completed, true);
    assertEqual(state.story_obtain_diamond.completedAt, 1234);
    assertEqual(awardAdvancementCriterion(state, 'story_obtain_diamond', 'diamond', 1300).awarded, false);
    assertEqual(awardAdvancementCriterion(state, 'missing', 'x').awarded, false);
  });
  it('restores and serializes only known criteria', () => {
    const restored = createAdvancementState({ story_obtain_diamond: { criteria: ['diamond', 'unknown'], completedAt: 50 }, hacked: { criteria: ['x'] } });
    const saved = serializeAdvancementState(restored);
    assertEqual(saved.story_obtain_diamond.criteria.length, 1);
    assertEqual(saved.story_obtain_diamond.completedAt, 50);
    assertEqual(saved.hacked, undefined);
  });
});
