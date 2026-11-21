import { describe, it, assertEqual } from './framework.js';
import { fireworkBlastImpacts, creeperBlastImpacts, FIREWORK_BLAST } from '../src/game/firework_explosion.js';
import { MobSystem } from '../src/entity/mobs.js';
import { Player } from '../src/entity/player.js';
import { Inventory } from '../src/game/inventory.js';

describe('firework rocket blast damage', () => {
  it('applies distance-scaled damage and radial knockback to nearby living mobs', () => {
    const near = { id: 1, type: 'zombie', x: 1, y: 64, z: 0, health: 20 };
    const far = { id: 2, type: 'skeleton', x: 9, y: 64, z: 0, health: 20 };
    const impacts = fireworkBlastImpacts([near, far], { x: 0, y: 64, z: 0 });
    assertEqual(impacts.length, 1);
    assertEqual(impacts[0].mob, near);
    assertEqual(impacts[0].damage > 0 && impacts[0].damage < FIREWORK_BLAST.MAX_DAMAGE, true);
    assertEqual(impacts[0].knockbackX > 0, true);
    assertEqual(impacts[0].knockbackZ, 0);
  });

  it('uses a larger, stronger blast for charged creepers and excludes the source', () => {
    const source = { id: 1, type: 'creeper', x: 0, y: 64, z: 0, health: 20 };
    const near = { id: 2, type: 'zombie', x: 3, y: 64, z: 0, health: 20 };
    const distant = { id: 3, type: 'skeleton', x: 6, y: 64, z: 0, health: 20 };
    const normal = creeperBlastImpacts([source, near, distant], source, false);
    const charged = creeperBlastImpacts([source, near, distant], source, true);
    assertEqual(normal.some((impact) => impact.mob === source), false);
    assertEqual(normal.length, 1);
    assertEqual(charged.length, 2);
    assertEqual(charged.find((impact) => impact.mob === near).damage > normal[0].damage, true);
  });

  it('ignores dead entities, invalid positions, and targets outside the blast radius', () => {
    const impacts = fireworkBlastImpacts([
      { health: 0, x: 0, y: 64, z: 0 },
      { health: 10, x: NaN, y: 64, z: 0 },
      { health: 10, x: 20, y: 64, z: 0 },
    ], { x: 0, y: 64, z: 0 });
    assertEqual(impacts.length, 0);
  });

  it('damages and knocks back mobs when the MobSystem detonates a rocket', () => {
    const player = new Player(30, 64, 30);
    const game = {
      inventory: new Inventory(), player, tickCount: 12, worldMeta: { difficulty: 'normal' },
      ui: { toast() {} }, sounds: { play() {} },
    };
    const entities = new MobSystem(game);
    const mob = { id: 7, type: 'zombie', x: 1, y: 64, z: 0, health: 20, anim: {} };
    entities.mobs.push(mob);
    const count = entities.detonateFireworkRocket(0, 64, 0);
    assertEqual(count, 1);
    assertEqual(mob.health < 20, true);
    assertEqual(mob.knockbackX > 0, true);
    assertEqual(mob.hurtTicks, 10);
  });

  it('damages a survival player caught in the blast but not creative players', () => {
    const player = new Player(0, 64, 0);
    const game = {
      inventory: new Inventory(), player, tickCount: 1, worldMeta: { difficulty: 'normal' },
      ui: { toast() {} }, sounds: { play() {} },
    };
    const entities = new MobSystem(game);
    const before = player.health;
    entities.detonateFireworkRocket(0, 64, 0);
    assertEqual(player.health < before, true);

    const creative = new Player(0, 64, 0);
    creative.gamemode = 'creative';
    const creativeGame = { ...game, player: creative };
    const creativeEntities = new MobSystem(creativeGame);
    const creativeBefore = creative.health;
    creativeEntities.detonateFireworkRocket(0, 64, 0);
    assertEqual(creative.health, creativeBefore);
  });
});
