import { describe, it, assert, assertEqual } from './framework.js';
import { MobSystem } from '../src/entity/mobs.js';

function fishingGame() {
  const player = { x: 0.5, y: 64, eyeHeight: 1.62, yaw: 0, pitch: 0, attackTime: 0, gamemode: 'survival' };
  const game = {
    player,
    world: {
      getBlock(x, y, z) {
        if (z === 2 && y === 65) return { block: { id: 'mc:water', solid: false } };
        return { block: { id: 'mc:air', solid: false } };
      },
    },
    inventory: { held: { item: { id: 'mc:fishing_rod' } } },
    sounds: { played: [], play(kind) { this.played.push(kind); } },
    ui: { messages: [], toast(message) { this.messages.push(message); } },
  };
  return game;
}

describe('visual fishing', () => {
  it('finds a real water block and returns a world-space float position', () => {
    const game = fishingGame();
    const entities = new MobSystem(game);
    const target = entities._findFishingWater();
    assert(target, 'water in front of the player should be detected');
    assertEqual(target.x, 0.5);
    assertEqual(target.y, 65.88);
    assertEqual(target.z, 2.5);
  });

  it('creates a bobber and a fish approach path when casting', () => {
    const game = fishingGame();
    const entities = new MobSystem(game);
    assertEqual(entities.useFishingRod(), true);
    assert(entities.fishing, 'cast should create fishing state');
    assert(Number.isFinite(entities.fishing.x) && Number.isFinite(entities.fishing.z));
    assert(Number.isFinite(entities.fishing.fishX) && Number.isFinite(entities.fishing.fishZ));
    assert(entities.fishing.ticks > entities.fishing.approachAt);
    assertEqual(game.sounds.played[0], 'cast');
    assertEqual(game.player.attackTime, 8);
  });

  it('does not cast when there is no water in the line of sight', () => {
    const game = fishingGame();
    game.world.getBlock = () => ({ block: { id: 'mc:stone', solid: true } });
    const entities = new MobSystem(game);
    assertEqual(entities.useFishingRod(), true);
    assertEqual(entities.fishing, null);
    assert(game.ui.messages.length > 0);
  });
});
