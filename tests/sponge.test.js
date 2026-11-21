import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS, AIR } from '../src/world/block.js';
import { absorbWaterAround } from '../src/game/sponge.js';
import { SMELTING, SMELTING_XP } from '../src/game/containers.js';

function makeWorld(entries = {}, unloaded = []) {
  const blocks = new Map(Object.entries(entries));
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    blocks,
    hasChunk(cx, cz) { return !unloaded.includes(`${cx},${cz}`); },
    getBlock(x, y, z) { return blocks.get(key(x, y, z)) || AIR.defaultState; },
    setBlock(x, y, z, state) { blocks.set(key(x, y, z), state); return true; },
  };
}

describe('sponge water absorption', () => {
  it('absorbs connected water sources and leaves disconnected water untouched', () => {
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld({
      '1,0,0': water, '2,0,0': water, '2,1,0': water,
      '0,0,2': water,
    });
    const changes = absorbWaterAround(world, 0, 0, 0);
    assertEqual(changes.length, 3);
    assertEqual(world.getBlock(1, 0, 0).block.id, 'mc:air');
    assertEqual(world.getBlock(2, 1, 0).block.id, 'mc:air');
    assertEqual(world.getBlock(0, 0, 2).block.id, 'mc:water');
  });

  it('caps absorption at 64 blocks and search radius six', () => {
    const water = BLOCKS.get('mc:water').defaultState;
    const entries = {};
    for (let x = 1; x <= 70; x++) entries[`${x},0,0`] = water;
    const world = makeWorld(entries);
    const changes = absorbWaterAround(world, 0, 0, 0);
    assertEqual(changes.length, 6);
    const capWorld = makeWorld(Object.fromEntries(
      Array.from({ length: 70 }, (_, i) => [`${i + 1},0,0`, water]),
    ));
    assertEqual(absorbWaterAround(capWorld, 0, 0, 0, 64, 100).length, 6);
  });

  it('does not inspect unloaded chunks or invalid requests', () => {
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld({ '16,0,0': water }, ['1,0']);
    assertEqual(absorbWaterAround(world, 15, 0, 0).length, 0);
    assertEqual(absorbWaterAround(world, 0.5, 0, 0).length, 0);
  });

  it('dries wet sponge in a furnace', () => {
    assertEqual(SMELTING.get('mc:wet_sponge')?.result, 'mc:sponge');
    assertEqual(SMELTING_XP.get('mc:wet_sponge'), 0.15);
  });
});
