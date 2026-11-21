import { describe, it, assertEqual } from './framework.js';
import { weatherAt, precipitationRoll, nextRainCauldronLevel, shouldRainExtinguishCampfire, shouldLightningRodStrike, tickWeatherBlocks } from '../src/game/weather.js';

describe('Seeded Overworld weather', () => {
  it('is deterministic within a weather period', () => {
    assertEqual(weatherAt('seed-a', 12000), weatherAt('seed-a', 12001));
    assertEqual(weatherAt('seed-a', 12000), weatherAt('seed-a', 17999));
  });

  it('uses deterministic coordinate-specific precipitation rolls', () => {
    assertEqual(precipitationRoll('world', 1, 64, 2, 40), precipitationRoll('world', 1, 64, 2, 40));
    assertEqual(precipitationRoll('world', 1, 64, 2, 40) === precipitationRoll('world', 2, 64, 2, 40), false);
  });

  it('fills cauldrons one level at a time and never exceeds three', () => {
    assertEqual(nextRainCauldronLevel(0, 'rain', 0), 1);
    assertEqual(nextRainCauldronLevel(2, 'thunder', 0), 3);
    assertEqual(nextRainCauldronLevel(3, 'rain', 0), 3);
    assertEqual(nextRainCauldronLevel(1, 'clear', 0), 1);
    assertEqual(nextRainCauldronLevel(1, 'rain', 0.5), 1);
  });

  it('limits lightning rod strikes to deterministic thunder rolls', () => {\n    assertEqual(shouldLightningRodStrike('seed', 0, 64, 0, 20, 'rain'), false);\n    assertEqual(shouldLightningRodStrike('seed', 0, 64, 0, 20, 'clear'), false);\n    let seed = 'rod';\n    while (!shouldLightningRodStrike(seed, 0, 64, 0, 20, 'thunder')) seed += 'x';\n    assertEqual(shouldLightningRodStrike(seed, 0, 64, 0, 20, 'thunder'), true);\n    assertEqual(shouldLightningRodStrike(seed, 0, 64, 0, 20, 'rain'), false);\n  });\n\n  it('lets rain extinguish only lit campfires', () => {
    assertEqual(shouldRainExtinguishCampfire('rain', true, 0), true);
    assertEqual(shouldRainExtinguishCampfire('thunder', true, 0.049), true);
    assertEqual(shouldRainExtinguishCampfire('clear', true, 0), false);
    assertEqual(shouldRainExtinguishCampfire('rain', false, 0), false);
    assertEqual(shouldRainExtinguishCampfire('rain', true, 0.05), false);
  });
});

describe('Weather block integration', () => {
  function state(id, values = {}) {
    return {
      block: { id, solid: false, opaqueCube: false },
      values,
      get(key) { return this.values[key]; },
      with(key, value) { return state(id, { ...this.values, [key]: value }); },
    };
  }

  function mockWorld(seed, entries = {}) {
    const blocks = new Map(Object.entries(entries));
    const key = (x, y, z) => x + ',' + y + ',' + z;
    return {
      seed,
      blocks,
      hasChunk: () => true,
      getHeight: () => 64,
      getBlock(x, y, z) { return blocks.get(key(x, y, z)) || state('mc:air'); },
      setBlock(x, y, z, next) { blocks.set(key(x, y, z), next); return true; },
    };
  }

  it('extinguishes exposed campfires and collects rain in exposed cauldrons', () => {
    let campSeed = 'weather-campfire';
    while (precipitationRoll(campSeed, 0, 64, 0, 20, 'campfire') >= 0.05) campSeed += 'x';
    const campWorld = mockWorld(campSeed, { '0,64,0': state('mc:campfire', { lit: true }) });
    const campChanges = tickWeatherBlocks(campWorld, { x: 0, z: 0 }, 'rain', 20);
    assertEqual(campChanges.length, 1);
    assertEqual(campWorld.getBlock(0, 64, 0).get('lit'), false);

    let cauldronSeed = 'weather-cauldron';
    while (precipitationRoll(cauldronSeed, 0, 64, 0, 20, 'cauldron') >= 0.001) cauldronSeed += 'x';
    const cauldronWorld = mockWorld(cauldronSeed, { '0,64,0': state('mc:cauldron', { level: 1 }) });
    const cauldronChanges = tickWeatherBlocks(cauldronWorld, { x: 0, z: 0 }, 'thunder', 20);
    assertEqual(cauldronChanges.length, 1);
    assertEqual(cauldronWorld.getBlock(0, 64, 0).get('level'), 2);
  });

  it('charges exposed lightning rods during thunder and resets their redstone pulse', () => {\n    let seed = 'weather-lightning-rod';\n    while (!shouldLightningRodStrike(seed, 0, 64, 0, 20, 'thunder')) seed += 'x';\n    const world = mockWorld(seed, { '0,64,0': state('mc:lightning_rod', { powered: false }) });\n    const changes = tickWeatherBlocks(world, { x: 0, z: 0 }, 'thunder', 20);\n    assertEqual(changes.length, 1);\n    assertEqual(world.getBlock(0, 64, 0).get('powered'), true);\n    const reset = tickWeatherBlocks(world, { x: 0, z: 0 }, 'thunder', 40);\n    assertEqual(reset.length, 1);\n    assertEqual(world.getBlock(0, 64, 0).get('powered'), false);\n  });\n\n  it('does not apply rain effects beneath a solid roof or during clear weather', () => {
    let seed = 'covered-weather';
    while (precipitationRoll(seed, 0, 64, 0, 20, 'campfire') >= 0.05) seed += 'x';
    const covered = mockWorld(seed, {
      '0,64,0': state('mc:campfire', { lit: true }),
      '0,65,0': { block: { id: 'mc:stone', solid: true, opaqueCube: true } },
    });
    assertEqual(tickWeatherBlocks(covered, { x: 0, z: 0 }, 'rain', 20).length, 0);
    const clear = mockWorld(seed, { '0,64,0': state('mc:campfire', { lit: true }) });
    assertEqual(tickWeatherBlocks(clear, { x: 0, z: 0 }, 'clear', 20).length, 0);
  });
});
