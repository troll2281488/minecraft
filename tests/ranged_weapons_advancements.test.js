import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { Player } from '../src/entity/player.js';
import { withEnchantment, canApplyEnchantment, ENCHANTMENTS } from '../src/game/enchantments.js';
import { Inventory } from '../src/game/inventory.js';
import { MobSystem } from '../src/entity/mobs.js';
import { createArrow, stepArrow } from '../src/entity/arrows.js';
import { beginCrossbowLoad, crossbowLoadProgress, finishCrossbowLoad, crossbowShotPlan, consumeCrossbowCharge, canPierceAdditionalTarget } from '../src/game/crossbow.js';
import { createTridentProjectile, stepTrident, tridentReturnVelocity, riptideImpulse, impalingBonusDamage, canChannelLightning, channelingLightningEffect } from '../src/game/trident.js';
import { weatherAt } from '../src/game/weather.js';
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
    assertEqual(finishCrossbowLoad(state, 115, 'mc:arrow', 2).charged, true);
    assertEqual(finishCrossbowLoad(state, 115, 'mc:arrow', 1), null);
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
    assertEqual(impalingBonusDamage(3, { type: 'zombie' }, true), 0);
    assertEqual(impalingBonusDamage(3, { type: 'axolotl' }, false), 7.5);
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


describe('playable crossbow item and saved advancement progress', () => {
  it('registers a durable crossbow and its vanilla-shaped recipe', () => {
    assertEqual(ITEMS.get('mc:crossbow').maxDamage, 465);
    assertEqual(ITEMS.get('mc:crossbow').stackSize, 1);
    assertEqual(RECIPES.producing('mc:crossbow').length, 1);
    assertEqual(RECIPES.producing('mc:trident').length, 0);
    assertEqual(ITEMS.get('mc:trident').maxDamage, 250);
    assertEqual(canApplyEnchantment(ITEMS.get('mc:crossbow'), 'quick_charge'), true);
    assertEqual(canApplyEnchantment(ITEMS.get('mc:crossbow'), 'multishot'), true);
    assertEqual(canApplyEnchantment(ITEMS.get('mc:trident'), 'loyalty'), true);
    assertEqual(ENCHANTMENTS.piercing.max, 4);
  });
  it('persists earned advancement criteria with player state', () => {
    const player = new Player(3, 70, -4);
    const result = player.recordAdvancementEvent('acquired_diamond', 900);
    assertEqual(result.completed, true);
    const saved = player.toJSON();
    const restored = new Player();
    restored.loadFrom(saved);
    assertEqual(restored.advancements.story_obtain_diamond.done, true);
    assertEqual(restored.advancements.story_obtain_diamond.completedAt, 900);
    assertEqual(restored.recordAdvancementEvent('acquired_diamond', 1000).awarded, false);
  });
  it('ignores unknown or malformed advancement data during player restore', () => {
    const player = new Player();
    player.loadFrom({ advancements: { injected: { criteria: ['fake'] }, story_obtain_diamond: { criteria: ['fake'] } } });
    assertEqual(player.advancements.injected, undefined);
    assertEqual(player.advancements.story_obtain_diamond.done, false);
  });
});


describe('crossbow right-click gameplay integration', () => {
  it('charges, consumes one arrow and fires three projectiles with Multishot', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:crossbow', 1);
    inventory.addItem('mc:arrow', 8);
    inventory.held.data = { enchantments: { multishot: 1, quick_charge: 1 } };
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    assertEqual(entities.beginCrossbowLoad(), true);
    game.tickCount = 20;
    assertEqual(entities.releaseCrossbowLoad(), true);
    assertEqual(entities.arrows.length, 3);
    assertEqual(inventory.countOf('mc:arrow'), 7);
    assertEqual(inventory.held.damage, 1);
    assertEqual(inventory.held.data.charged, false);
  });
  it('does not fire before the charge duration or without ammunition', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:crossbow', 1);
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    entities.beginCrossbowLoad();
    game.tickCount = 24;
    entities.releaseCrossbowLoad();
    assertEqual(entities.arrows.length, 0);
    game.tickCount = 30;
    entities.beginCrossbowLoad();
    game.tickCount = 60;
    entities.releaseCrossbowLoad();
    assertEqual(entities.arrows.length, 0);
  });
});


describe('Piercing arrow collision handling', () => {
  it('passes through the configured number of distinct mobs without repeat hits', () => {
    const arrow = createArrow(0, 1, 0, [0, 0, 1], 1);
    arrow.piercingLevel = 1;
    const first = { id: 1, x: 0, y: 1, z: 1, health: 20 };
    const second = { id: 2, x: 0, y: 1, z: 2.5, health: 20 };
    const hit1 = stepArrow(arrow, () => false, [first, second]);
    assertEqual(hit1.mob.id, 1);
    assertEqual(arrow.done, false);
    const hit2 = stepArrow(arrow, () => false, [first, second]);
    assertEqual(hit2.mob.id, 2);
    assertEqual(arrow.done, true);
  });
});


describe('bow enchantment gameplay integration', () => {
  it('applies Power, Punch and Flame to fired arrows', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:bow', 1);
    inventory.addItem('mc:arrow', 4);
    inventory.held.data = { enchantments: { power: 3, punch: 2, flame: 1 } };
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    assertEqual(entities.beginBowDraw(), true);
    game.tickCount = 30;
    assertEqual(entities.releaseBow(), true);
    assertEqual(entities.arrows.length, 1);
    assertEqual(entities.arrows[0].damage > 9, true);
    assertEqual(entities.arrows[0].punchLevel, 2);
    assertEqual(entities.arrows[0].flame, true);
    assertEqual(inventory.countOf('mc:arrow'), 3);
  });

  it('Infinity preserves the required arrow and does not consume it', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:bow', 1);
    inventory.addItem('mc:arrow', 1);
    inventory.held.data = { enchantments: { infinity: 1 } };
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    entities.beginBowDraw();
    game.tickCount = 30;
    entities.releaseBow();
    assertEqual(entities.arrows.length, 1);
    assertEqual(inventory.countOf('mc:arrow'), 1);
  });

  it('Infinity still requires at least one arrow in Survival', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:bow', 1);
    inventory.held.data = { enchantments: { infinity: 1 } };
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    entities.beginBowDraw();
    game.tickCount = 30;
    entities.releaseBow();
    assertEqual(entities.arrows.length, 0);
  });
});


describe('Channeling lightning gameplay effects', () => {
  it('strikes only during exposed thunderstorms and carries vanilla target effects', () => {
    assertEqual(channelingLightningEffect({ channeling: true, thunder: false, skyVisible: true, targetExposed: true, targetType: 'creeper' }), null);
    assertEqual(channelingLightningEffect({ channeling: true, thunder: true, skyVisible: false, targetExposed: false, targetType: 'creeper' }), null);
    const creeper = channelingLightningEffect({ channeling: true, thunder: true, skyVisible: true, targetExposed: true, targetType: 'creeper' });
    assertEqual(creeper.damage, 5);
    assertEqual(creeper.fireTicks, 160);
    assertEqual(creeper.chargedCreeper, true);
    const villager = channelingLightningEffect({ channeling: true, thunder: true, skyVisible: true, targetExposed: true, targetType: 'villager' });
    assertEqual(villager.transformTo, 'witch');
  });
});

describe('crossbow firework rocket ammunition', () => {
  it('registers craftable rockets and chooses them when no arrows are available', () => {
    assertEqual(ITEMS.get('mc:firework_rocket').stackSize, 64);
    assertEqual(RECIPES.producing('mc:firework_rocket').length, 1);
    const inventory = new Inventory();
    inventory.addItem('mc:crossbow', 1);
    inventory.addItem('mc:firework_rocket', 1);
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    assertEqual(entities.beginCrossbowLoad(), true);
    game.tickCount = 25;
    assertEqual(entities.releaseCrossbowLoad(), true);
    assertEqual(entities.arrows.length, 1);
    assertEqual(entities.arrows[0].isFireworkRocket, true);
    assertEqual(inventory.countOf('mc:firework_rocket'), 0);
    assertEqual(inventory.held.data.charged, false);
  });
  it('prefers regular arrows when both ammunition types are available', () => {
    const inventory = new Inventory();
    inventory.addItem('mc:crossbow', 1);
    inventory.addItem('mc:firework_rocket', 1);
    inventory.addItem('mc:arrow', 1);
    const player = new Player(0, 64, 0);
    const game = { inventory, player, tickCount: 0, ui: { toast() {} }, sounds: { play() {} } };
    const entities = new MobSystem(game);
    entities.beginCrossbowLoad();
    game.tickCount = 25;
    entities.releaseCrossbowLoad();
    assertEqual(entities.arrows[0].isFireworkRocket, false);
    assertEqual(inventory.countOf('mc:arrow'), 0);
    assertEqual(inventory.countOf('mc:firework_rocket'), 1);
  });
});


describe('Channeling mob integration', () => {
  it('damages and charges an exposed creeper only during a thunderstorm', () => {
    let seed = 0;
    while (weatherAt(seed, 0) !== 'thunder') seed++;
    const player = new Player(0, 64, 0);
    const game = {
      inventory: new Inventory(), player, tickCount: 1,
      world: { seed, time: 0, getHeight: () => -64, getBlock: () => ({ block: { solid: false } }) },
      ui: { toast() {} }, sounds: { play() {} },
    };
    const entities = new MobSystem(game);
    const creeper = { id: 7, type: 'creeper', x: 0, y: player.eyeY - 0.5, z: 2.5, health: 20, anim: {} };
    entities.mobs.push(creeper);
    const trident = createArrow(0, player.eyeY, 0.55, [0, 0, 1], 0.9);
    Object.assign(trident, { isTrident: true, channeling: true, damage: 8, vx: 0, vy: 0, vz: 2.5 });
    entities.arrows.push(trident);
    entities._tickArrows();
    assertEqual(creeper.health, 7);
    assertEqual(creeper.charged, true);
    assertEqual(creeper.fireTicks, 160);
    assertEqual(player.advancements.adventure_channeling.done, true);
  });
});

describe('new ranged weapon advancements', () => {
  it('awards throw-trident and crossbow achievements once', () => {
    const player = new Player();
    assertEqual(player.recordAdvancementEvent('threw_trident', 10).completed, true);
    assertEqual(player.recordAdvancementEvent('shot_crossbow', 20).completed, true);
    assertEqual(player.advancements.adventure_throw_trident.done, true);
    assertEqual(player.advancements.adventure_shoot_crossbow.done, true);
    assertEqual(player.recordAdvancementEvent('shot_crossbow', 30).awarded, false);
  });
});


it('detonates a crossbow firework rocket without arrow damage on entity impact', () => {
  const game = {
    inventory: new Inventory(), player: new Player(0, 64, 0), tickCount: 1,
    world: { seed: 1, time: 0, getHeight: () => -64, getBlock: () => ({ block: { solid: false } }) },
    ui: { toast() {} }, sounds: { play() {} },
  };
  const entities = new MobSystem(game);
  const target = { id: 3, type: 'zombie', x: 0, y: game.player.eyeY - 0.5, z: 2.5, health: 20, anim: {} };
  entities.mobs.push(target);
  const rocket = createArrow(0, game.player.eyeY, 0.55, [0, 0, 1], 1);
  rocket.isFireworkRocket = true;
  entities.arrows.push(rocket);
  entities._tickArrows();
  assertEqual(target.health, 20);
  assertEqual(entities.arrows.length, 0);
  assertEqual(entities.blockParticles.length > 0, true);
});
