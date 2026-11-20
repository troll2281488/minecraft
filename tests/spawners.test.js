import { describe, it, assert, assertEqual } from './framework.js';
import {
  SPAWNER_MOB_TYPES, spawnerMobType, spawnerPlayerInRange,
  countSpawnerMobs, nextSpawnerDelay, spawnerSpawnPosition,
} from '../src/entity/spawners.js';
import { placeDungeonRoom } from '../src/world/gen/structures.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';

describe('Java monster spawner rules', () => {
  it('chooses a stable dungeon mob type from world seed and coordinates', () => {
    const a = spawnerMobType('dungeon-seed', 12, 24, -7);
    assertEqual(spawnerMobType('dungeon-seed', 12, 24, -7), a);
    assert(SPAWNER_MOB_TYPES.includes(a));
    assert(SPAWNER_MOB_TYPES.includes(spawnerMobType('other-seed', 12, 24, -7)));
  });

  it('activates only for a non-spectator player within 16 blocks of the block center', () => {
    const spawner = { x: 0, y: 10, z: 0 };
    assertEqual(spawnerPlayerInRange(spawner, { x: 0.5, y: 10, z: 0.5, gamemode: 'survival' }), true);
    assertEqual(spawnerPlayerInRange(spawner, { x: 0.5, y: 10, z: 0.5, gamemode: 'spectator' }), false);
    assertEqual(spawnerPlayerInRange(spawner, { x: 16.6, y: 10, z: 0.5, gamemode: 'survival' }), false);
    assertEqual(spawnerPlayerInRange(spawner, null), false);
  });

  it('counts only matching mobs inside the 9x9x9 nearby cap box', () => {
    const spawner = { x: 0, y: 10, z: 0 };
    const mobs = [
      { type: 'zombie', x: 0.5, y: 10.5, z: 0.5 },
      { type: 'zombie', x: 4.9, y: 14.9, z: 4.9 },
      { type: 'skeleton', x: 0.5, y: 10.5, z: 0.5 },
      { type: 'zombie', x: 8, y: 10, z: 0 },
    ];
    assertEqual(countSpawnerMobs(mobs, spawner, 'zombie'), 2);
    assertEqual(countSpawnerMobs(mobs, spawner, 'skeleton'), 1);
  });

  it('keeps the randomized cycle delay in the inclusive 200..799 range', () => {
    assertEqual(nextSpawnerDelay(() => 0), 200);
    assertEqual(nextSpawnerDelay(() => 0.5), 500);
    assertEqual(nextSpawnerDelay(() => 0.9999), 799);
    assertEqual(nextSpawnerDelay(() => Number.NaN), 200);
  });

  it('samples only the 9x3x9 block volume around the cage', () => {
    const p = spawnerSpawnPosition({ x: 8, y: 20, z: -3 }, () => 0.5);
    assert(p.x >= 4 && p.x <= 12);
    assert(p.z >= -7 && p.z <= 1);
    assert(p.y >= 19 && p.y <= 21);
  });

  it('places a monster spawner in the center of every generated dungeon room', () => {
    const ids = ['mc:air','mc:cobblestone','mc:mossy_cobblestone','mc:chest','mc:mob_spawner'];
    const states = Object.fromEntries(ids.map((id) => [id, BLOCKS.get(id)?.defaultState]).filter(([, state]) => state));
    const placed = new Map();
    const key = (x,y,z) => `${x},${y},${z}`;
    const writer = {
      touches: () => true,
      inside: () => true,
      id: (x,y,z) => placed.get(key(x,y,z))?.block?.id ?? 'mc:stone',
      set: (x,y,z,state) => placed.set(key(x,y,z), state),
    };
    placeDungeonRoom(writer, states, { x: 10, y: 20, z: 30, variant: 0 }, 'test-dungeon-seed');
    assertEqual(placed.get(key(13,21,33))?.block?.id, 'mc:mob_spawner');
    assert(placed.has(key(11,21,31)), 'dungeon chest remains beside the spawner');
  });
});
