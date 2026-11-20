import { describe, it, assert, assertEqual } from './framework.js';
import {
  SPAWNER_MOB_TYPES, spawnerMobType, spawnerPlayerInRange,
  countSpawnerMobs, nextSpawnerDelay, spawnerSpawnPosition,
} from '../src/entity/spawners.js';
import { placeDungeonRoom, dungeonDims } from '../src/world/gen/structures.js';
import { dungeonCandidateForCell, strongholdCandidateForCell } from '../src/world/gen/terrain.js';
import { positionalRandom } from '../src/core/rng.js';
import { Chest } from '../src/game/containers.js';
import { generatedChestKind, fillGeneratedChest, DUNGEON_LOOT_POOLS, TEMPLE_LOOT_POOLS, STRONGHOLD_LOOT_POOLS, chooseWeightedLootEntry, scatterGeneratedChestLoot } from '../src/game/container_screens.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
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


describe('generated dungeon chest loot', () => {
  it('recognizes both deterministic chest positions in a dungeon room', () => {
    const seed = 'dungeon-loot-regression';
    let room = null;
    for (let gx = -24; gx <= 24 && !room; gx++) {
      for (let gz = -24; gz <= 24 && !room; gz++) {
        const candidate = dungeonCandidateForCell(seed, gx, gz);
        if (!candidate) continue;
        const rng = positionalRandom(seed, candidate.x, 7301, candidate.z, 7301);
        if (rng.nextBoolean()) room = candidate;
      }
    }
    assert(room, 'test seed should contain a dungeon with its optional second chest');
    const { ix, iz } = dungeonDims(room);
    assertEqual(generatedChestKind(seed, room.x + 1, room.y + 1, room.z + 1), 'dungeon');
    assertEqual(generatedChestKind(seed, room.x + ix, room.y + 1, room.z + iz), 'dungeon');
  });

  it('uses three weighted pools and only registered items', () => {
    assertEqual(DUNGEON_LOOT_POOLS.length, 3);
    for (const pool of DUNGEON_LOOT_POOLS) {
      assert(pool.entries.length > 0);
      for (const [id, weight, min, max] of pool.entries) {
        assert(ITEMS.get(id), `loot item ${id} must be registered`);
        assert(weight > 0 && min > 0 && max >= min);
      }
    }
    assert(ITEMS.get('mc:enchanted_book'), 'enchanted book loot item must be registered');
    assert(ITEMS.get('mc:gunpowder'), 'gunpowder loot item must be registered');
    assert(DUNGEON_LOOT_POOLS[0].entries.some(([id]) => id === 'mc:enchanted_book'));
    assert(DUNGEON_LOOT_POOLS[2].entries.some(([id]) => id === 'mc:gunpowder'));
    const entries = DUNGEON_LOOT_POOLS[0].entries;
    assertEqual(chooseWeightedLootEntry(entries, { nextInt: () => 0 })[0], 'mc:saddle');
    assertEqual(chooseWeightedLootEntry(entries, { nextInt: () => 20 })[0], 'mc:golden_apple');
  });

  it('uses distinct weighted loot pools for desert and jungle temples', () => {
    assertEqual(TEMPLE_LOOT_POOLS.desert_temple.length, 3);
    assertEqual(TEMPLE_LOOT_POOLS.jungle_temple.length, 2);
    for (const [kind, pools] of Object.entries(TEMPLE_LOOT_POOLS)) {
      assert(pools.length > 0, kind + ' must have loot pools');
      for (const pool of pools) {
        assert(pool.entries.length > 0);
        for (const [id, weight, min, max] of pool.entries) {
          assert(ITEMS.get(id), kind + ' loot item ' + id + ' must be registered');
          assert(weight > 0 && min > 0 && max >= min);
        }
      }
    }
    const desert = new Chest();
    const jungle = new Chest();
    fillGeneratedChest('temple-pool-test', 4, 30, 8, desert, 'desert_temple');
    fillGeneratedChest('temple-pool-test', 4, 30, 8, jungle, 'jungle_temple');
    const contents = chest => JSON.stringify(chest.slots.map(stack => stack.toJSON()));
    assert(contents(desert).length > 2);
    assert(contents(jungle).length > 2);
    assert(contents(desert) !== contents(jungle), 'temple types must not share identical loot rolls');
  });

  it('recognizes distinct stronghold library, crossing, and portal-room chests', () => {
    const seed = 'stronghold-room-loot-regression';
    let site = null;
    for (let gx = -80; gx <= 80 && !site; gx++) {
      for (let gz = -80; gz <= 80 && !site; gz++) {
        site = strongholdCandidateForCell(seed, gx, gz);
      }
    }
    assert(site, 'test seed should contain a stronghold candidate');
    const y = site.y + 1;
    assertEqual(generatedChestKind(seed, site.x + 2, y, site.z + 2), 'stronghold_crossing');
    assertEqual(generatedChestKind(seed, site.x - 10, y, site.z + 8), 'stronghold_library');
    assertEqual(generatedChestKind(seed, site.x - 6, y, site.z + 8), 'stronghold_library');
    assertEqual(generatedChestKind(seed, site.x + 20, y, site.z + 10), 'stronghold_corridor');
  });

  it('uses separate registered weighted loot pools for all stronghold room types', () => {
    assertEqual(STRONGHOLD_LOOT_POOLS.stronghold_library.length, 1);
    assertEqual(STRONGHOLD_LOOT_POOLS.stronghold_crossing.length, 1);
    assertEqual(STRONGHOLD_LOOT_POOLS.stronghold_corridor.length, 2);
    for (const [kind, pools] of Object.entries(STRONGHOLD_LOOT_POOLS)) {
      for (const pool of pools) for (const [id, weight, min, max] of pool.entries) {
        assert(ITEMS.get(id), kind + ' loot item ' + id + ' must be registered');
        assert(weight > 0 && min > 0 && max >= min);
      }
    }
    const make = kind => {
      const chest = new Chest();
      fillGeneratedChest('stronghold-pools-test', 12, 24, -8, chest, kind);
      return chest.slots.map(stack => stack.toJSON());
    };
    const library = make('stronghold_library');
    const crossing = make('stronghold_crossing');
    const corridor = make('stronghold_corridor');
    assert(library.some(Boolean) && crossing.some(Boolean) && corridor.some(Boolean));
    assert(JSON.stringify(library) !== JSON.stringify(crossing));
    assert(JSON.stringify(crossing) !== JSON.stringify(corridor));
  });

  it('scatters loot into deterministic non-packed chest slots', () => {
    const a = new Chest();
    const b = new Chest();
    for (const chest of [a, b]) {
      chest.insert(ItemStack.of('mc:iron_ingot', 3));
      chest.insert(ItemStack.of('mc:gold_ingot', 2));
      chest.insert(ItemStack.of('mc:bread', 1));
      scatterGeneratedChestLoot('slot-scatter-seed', 17, 31, -9, chest, 'dungeon');
    }
    const occupied = (chest) => chest.slots.map((stack, i) => stack.isEmpty ? -1 : i).filter((i) => i >= 0);
    assertEqual(JSON.stringify(occupied(a)), JSON.stringify(occupied(b)));
    assertEqual(occupied(a).length, 3);
    assertEqual(a.slots.reduce((sum, stack) => sum + (stack.isEmpty ? 0 : stack.count), 0), 6);
  });

  it('generates repeatable loot for a generated dungeon chest', () => {
    const seed = 'dungeon-loot-regression';
    const a = new Chest();
    const b = new Chest();
    fillGeneratedChest(seed, 41, 18, -27, a, 'dungeon');
    fillGeneratedChest(seed, 41, 18, -27, b, 'dungeon');
    const contents = (chest) => chest.slots.map((stack) => stack.toJSON());
    assert(contents(a).some(Boolean), 'dungeon chest should contain loot');
    assertEqual(JSON.stringify(contents(a)), JSON.stringify(contents(b)));
  });
});
