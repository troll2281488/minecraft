import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';
import { Player } from '../src/entity/player.js';
import { Inventory } from '../src/game/inventory.js';
import { MobSystem } from '../src/entity/mobs.js';
import { PlayerStatusEffects, POTION_ITEMS } from '../src/entity/status_effects.js';

describe('expanded survival potion effects', () => {
  it('registers five additional drinkable potions with bounded Java tick durations', () => {
    const ids = ['mc:potion_poison','mc:potion_water_breathing','mc:potion_slow_falling','mc:potion_leaping','mc:potion_weakness'];
    for (const id of ids) assertEqual(ITEMS.get(id)?.stackSize, 1);
    assertEqual(POTION_ITEMS['mc:potion_poison'].duration, 900);
    assertEqual(POTION_ITEMS['mc:potion_water_breathing'].duration, 3600);
    assertEqual(POTION_ITEMS['mc:potion_slow_falling'].duration, 1800);
  });

  it('poison periodically damages but never reduces health below one', () => {
    const player = new Player();
    const effects = new PlayerStatusEffects();
    effects.apply('poison', 100, 0);
    for (let i = 0; i < 50; i++) effects.tick(player);
    assertEqual(player.health, 18);
    player.health = 1;
    for (let i = 0; i < 50; i++) effects.tick(player);
    assertEqual(player.health, 1);
  });

  it('water breathing pauses underwater air depletion and restores air after surfacing', () => {
    const player = new Player();
    player.underwater = true;
    player.air = 300;
    player.effects.apply('water_breathing', 200);
    player._tickAir();
    assertEqual(player.air, 300);
    player.effects.clear();
    player._tickAir();
    assertEqual(player.air, 299);
    player.underwater = false;
    player._tickAir();
    assertEqual(player.air, 300);
  });

  it('Weakness reduces player melee damage while Strength remains independently applied', () => {
    const player = new Player();
    const inventory = new Inventory();
    const game = { player, inventory, ui: { toast() {} }, sounds: { play() {} } };
    const mobs = new MobSystem(game);
    const target = { id: 42, type: 'zombie', x: 1, y: 64, z: 0, health: 20, anim: {} };
    mobs.targetedMob = () => target;
    player.effects.apply('weakness', 100);
    mobs.attackFromPlayer();
    assertEqual(target.health, 20);
    player.effects.clear();
    player.effects.apply('strength', 100);
    mobs.attackCooldown = 0;
    mobs.attackFromPlayer();
    assertEqual(target.health < 20, true);
  });

  it('slow falling reduces downward gravity and jump boost increases jump impulse', () => {
    const normal = new Player();
    const slow = new Player();
    normal.vy = slow.vy = 0;
    slow.effects.apply('slow_falling', 100);
    normal._applyGravityAndFriction(0.6);
    slow._applyGravityAndFriction(0.6);
    assertEqual(slow.vy > normal.vy, true);

    const standardJump = new Player();
    const boostedJump = new Player();
    standardJump.onGround = boostedJump.onGround = true;
    standardJump.input.jump = boostedJump.input.jump = true;
    boostedJump.effects.apply('jump_boost', 100, 1);
    standardJump._applyInput(0.6);
    boostedJump._applyInput(0.6);
    assertEqual(boostedJump.vy > standardJump.vy, true);
  });
});
