import { describe, it, assertEqual } from './framework.js';
import { tickChickenEggLaying, tickSheepGrassRegrowth, MobSystem } from '../src/entity/mobs.js';
import { BLOCKS } from '../src/world/block.js';
import '../src/world/blocks/index.js';

describe('Java animal life cycle', () => {
  it('lays a chicken egg when its saved timer expires and resets the timer', () => {
    const chicken = { type: 'chicken', eggLayTicks: 1 };
    assertEqual(tickChickenEggLaying(chicken, () => 0), true);
    assertEqual(chicken.eggLayTicks, 6000);
    assertEqual(tickChickenEggLaying({ type: 'cow', eggLayTicks: 1 }), false);
  });

  it('regrows sheared wool only by grazing a grass block', () => {
    const sheep = { type: 'sheep', x: 2.5, y: 65, z: 3.5, sheared: true, grazeTicks: 1 };
    let replaced = null;
    const world = {
      getBlock: (x, y, z) => ({ block: { id: x === 2 && y === 64 && z === 3 ? 'mc:grass_block' : 'mc:stone' } }),
      setBlock: (x, y, z, state) => { replaced = { x, y, z, state }; return true; },
    };
    const result = tickSheepGrassRegrowth(sheep, world, () => 0);
    assertEqual(result.x, 2);
    assertEqual(result.y, 64);
    assertEqual(result.z, 3);
    assertEqual(result.state, BLOCKS.get('mc:dirt').defaultState);
    assertEqual(sheep.sheared, false);
    assertEqual(replaced.state, result.state);
  });

  it('does not regrow wool when the block beneath is not grass', () => {
    const sheep = { type: 'sheep', x: 0.5, y: 10, z: 0.5, sheared: true, grazeTicks: 1 };
    const world = { getBlock: () => ({ block: { id: 'mc:stone' } }), setBlock: () => true };
    assertEqual(tickSheepGrassRegrowth(sheep, world, () => 0), null);
    assertEqual(sheep.sheared, true);
  });

  it('persists chicken egg and sheep grazing timers', () => {
    const system = new MobSystem({});
    system.mobs = [
      { id: 1, type: 'chicken', x: 1, y: 64, z: 1, yaw: 0, health: 4, eggLayTicks: 2345 },
      { id: 2, type: 'sheep', x: 2, y: 64, z: 2, yaw: 0, health: 8, sheared: true, grazeTicks: 345 },
    ];
    const restored = new MobSystem({});
    restored.loadFrom(system.toJSON());
    assertEqual(restored.mobs[0].eggLayTicks, 2345);
    assertEqual(restored.mobs[1].grazeTicks, 345);
    assertEqual(restored.mobs[1].sheared, true);
  });
});
