import { describe, it, assert, assertEqual } from './framework.js';
import { createThrowable, stepThrowable, eggHatchCount } from '../src/entity/arrows.js';
import { MobSystem } from '../src/entity/mobs.js';

describe('Java throwable eggs and snowballs', () => {
  it('creates only supported throwable types with forward velocity', () => {
    const egg = createThrowable(0, 1, 0, [0, 0, 1], 'egg');
    const snowball = createThrowable(0, 1, 0, [0, 0, 1], 'snowball');
    assertEqual(egg.type, 'egg');
    assertEqual(snowball.type, 'snowball');
    assert(snowball.vz > 0);
    let rejected = false;
    try { createThrowable(0, 0, 0, [0, 0, 1], 'arrow'); } catch { rejected = true; }
    assertEqual(rejected, true);
  });

  it('collides with blocks and mobs and applies gravity', () => {
    const projectile = createThrowable(0.5, 1, 0.5, [0, 0, 1], 'snowball');
    let hit = null;
    for (let i = 0; i < 20 && !hit; i++) hit = stepThrowable(projectile, (x, y, z) => z >= 2, []).hit;
    assertEqual(hit, 'block');

    const mobProjectile = createThrowable(0.5, 1, 0.5, [0, 0, 1], 'egg');
    const mob = { x: 0.5, y: 0.5, z: 1.5, health: 10 };
    let result = { hit: null };
    for (let i = 0; i < 20 && !result.hit; i++) result = stepThrowable(mobProjectile, () => false, [mob]);
    assertEqual(result.hit, 'mob');
    assertEqual(result.mob, mob);

    const falling = createThrowable(0, 10, 0, [0, 0, 1], 'egg');
    stepThrowable(falling, () => false, []);
    assert(falling.vy < 0);
  });

  it('uses Java egg hatch odds: one chick 7/64, four chicks 1/32, none 7/8', () => {
    assertEqual(eggHatchCount(() => 0), 4);
    assertEqual(eggHatchCount(() => 0.04), 1);
    assertEqual(eggHatchCount(() => 0.124), 1);
    assertEqual(eggHatchCount(() => 0.125), 0);
    assertEqual(eggHatchCount(() => 0.9), 0);
  });

  it('consumes one egg or snowball in survival and none in creative', () => {
    const removed = [];
    const game = {
      player: { gamemode: 'survival', x: 0, y: 64, z: 0, eyeY: 65.6, yaw: 0, pitch: 0 },
      inventory: { remove(id, count) { removed.push([id, count]); return count; } },
      sounds: { play() {} },
    };
    const system = new MobSystem(game);
    assertEqual(system.throwItemProjectile('mc:egg'), true);
    assertEqual(system.throwItemProjectile('mc:snowball'), true);
    assertEqual(system.projectiles.length, 2);
    assertEqual(removed.length, 2);

    game.player.gamemode = 'creative';
    assertEqual(system.throwItemProjectile('mc:egg'), true);
    assertEqual(removed.length, 2);
  });
});
