import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ItemStack } from '../src/world/item.js';
import { Chest, Furnace, SMELT_TICKS, CHEST_SLOTS, serializeContainer, deserializeContainer, drainContainer } from '../src/game/containers.js';
import { RECIPES } from '../src/game/recipes.js';
import { ContainerScreensMixin } from '../src/game/container_screens.js';
import { TerrainGenerator, dungeonCandidateForCell, villageCandidateForCell, mineshaftCandidateForCell } from '../src/world/gen/terrain.js';
import { mineshaftPlan } from '../src/world/gen/structures.js';

/**
 * Chest and furnace rules from the 1.12.2 reference (docs/TARGET_1_12_2.md, sections 11 and 17).
 */
describe('Chest', () => {
  it('has 27 slots', () => assertEqual(new Chest().slots.length, CHEST_SLOTS));
  it('fills matching partial stacks before empty slots', () => {
    const c = new Chest();
    c.insert(ItemStack.of('mc:cobblestone', 10));
    c.insert(ItemStack.of('mc:cobblestone', 5));
    assertEqual(c.slots[0].count, 15);
    assert(c.slots[1].isEmpty, 'second slot should stay empty');
  });
  it('returns the leftover when full', () => {
    const c = new Chest();
    let leftover = 0;
    for (let i = 0; i < CHEST_SLOTS; i++) leftover = c.insert(ItemStack.of('mc:stone', 64));
    assertEqual(leftover, 0);
    assertEqual(c.insert(ItemStack.of('mc:stone', 64)), 64);
  });
});

describe('1.12.2 crafting access to containers', () => {
  it('crafts a chest from any of the six plank families', () => {
    const grid = [
      ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'),
      ItemStack.of('mc:jungle_planks'), ItemStack.EMPTY.clone(), ItemStack.of('mc:jungle_planks'),
      ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'),
    ];
    assertEqual(RECIPES.match(grid, 3)?.result, 'mc:chest');
  });

  it('crafts a furnace from eight cobblestone', () => {
    const grid = [
      ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'),
      ItemStack.of('mc:cobblestone'), ItemStack.EMPTY.clone(), ItemStack.of('mc:cobblestone'),
      ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'),
    ];
    assertEqual(RECIPES.match(grid, 3)?.result, 'mc:furnace');
  });
});

describe('Java 1.12.2 furnace fuel values', () => {
  it('uses the vanilla burn duration for the registered wood fuels', async () => {
    const { ITEMS } = await import('../src/world/item.js');
    assertEqual(ITEMS.get('mc:oak_sapling')?.fuelTicks, 100);
    assertEqual(ITEMS.get('mc:oak_slab')?.fuelTicks, 150);
    assertEqual(ITEMS.get('mc:wooden_pickaxe')?.fuelTicks, 200);
    assertEqual(ITEMS.get('mc:crafting_table')?.fuelTicks, 300);
    assertEqual(ITEMS.get('mc:coal_block')?.fuelTicks, 16000);
    assertEqual(ITEMS.get('mc:golden_pickaxe')?.fuelTicks, 0);
  });
});

describe('Breaking containers', () => {
  it('returns every chest stack and clears all 27 slots', () => {
    const chest = new Chest();
    chest.slots[0] = ItemStack.of('mc:diamond', 4);
    chest.slots[1] = ItemStack.of('mc:iron_pickaxe', 1, 23, { enchantments: { efficiency: 2 } });
    const drops = drainContainer('chest', chest);
    assertEqual(drops.length, 2);
    assertEqual(drops[0].count, 4);
    assertEqual(drops[1].damage, 23);
    assertEqual(drops[1].data.enchantments.efficiency, 2);
    assert(chest.slots.every((slot) => slot.isEmpty), 'chest contents were not cleared');
  });

  it('returns furnace input, remaining fuel and output, then resets its timers', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:iron_ore', 2);
    furnace.fuel = ItemStack.of('mc:coal', 3);
    furnace.output = ItemStack.of('mc:iron_ingot', 1);
    furnace.burnLeft = 400;
    furnace.burnTotal = 1600;
    furnace.cookProgress = 80;
    const drops = drainContainer('furnace', furnace);
    assertEqual(drops.length, 3);
    assertEqual(drops[0].count, 2);
    assertEqual(drops[1].count, 3);
    assertEqual(drops[2].item.id, 'mc:iron_ingot');
    assert(furnace.input.isEmpty && furnace.fuel.isEmpty && furnace.output.isEmpty);
    assertEqual(furnace.burnLeft, 0);
    assertEqual(furnace.cookProgress, 0);
  });

  it('ignores unknown container types', () => {
    assertEqual(drainContainer('unknown', {} ).length, 0);
  });
});

describe('Container save data', () => {
  it('round-trips chest slots including damaged and data-bearing stacks', () => {
    const chest = new Chest();
    chest.slots[0] = ItemStack.of('mc:oak_planks', 23);
    chest.slots[1] = ItemStack.of('mc:wooden_pickaxe', 1, 17, { customName: 'Old pick' });
    const restored = deserializeContainer(serializeContainer('chest', chest));
    assertEqual(restored.type, 'chest');
    assertEqual(restored.data.slots[0].item.id, 'mc:oak_planks');
    assertEqual(restored.data.slots[0].count, 23);
    assertEqual(restored.data.slots[1].damage, 17);
    assertEqual(restored.data.slots[1].data.customName, 'Old pick');
  });

  it('round-trips furnace inventory and in-progress timers', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:iron_ore', 3);
    furnace.fuel = ItemStack.of('mc:coal', 2);
    furnace.output = ItemStack.of('mc:iron_ingot', 4);
    furnace.burnLeft = 721;
    furnace.burnTotal = 1600;
    furnace.cookProgress = 139;
    const restored = deserializeContainer(serializeContainer('furnace', furnace));
    assertEqual(restored.data.input.count, 3);
    assertEqual(restored.data.fuel.count, 2);
    assertEqual(restored.data.output.count, 4);
    assertEqual(restored.data.burnLeft, 721);
    assertEqual(restored.data.burnTotal, 1600);
    assertEqual(restored.data.cookProgress, 139);
  });

  it('rejects malformed container records and clamps invalid furnace timers', () => {
    assertEqual(deserializeContainer({ type: 'chest', slots: [] }), null);
    assertEqual(deserializeContainer({ type: 'unknown' }), null);
    const restored = deserializeContainer({
      type: 'furnace', burnLeft: 900, burnTotal: 100, cookProgress: 9999,
    });
    assertEqual(restored.data.burnLeft, 100);
    assertEqual(restored.data.cookProgress, SMELT_TICKS - 1);
  });
});


describe('Generated structure chest loot', () => {
  it('fills dungeon chests deterministically and leaves ordinary chests empty', () => {
    const seed = 'generated-dungeon-loot';
    let room = null;
    for (let gz = -20; gz <= 20 && !room; gz++) {
      for (let gx = -20; gx <= 20 && !room; gx++) room = dungeonCandidateForCell(seed, gx, gz);
    }
    assert(room, 'test seed did not produce a dungeon');
    const position = [room.x + 1, room.y + 1, room.z + 1];
    const makeContext = () => ({
      world: { seed },
      _containers: new Map(),
      _containerKey: (x, y, z) => `${x},${y},${z}`,
    });
    const first = ContainerScreensMixin._chestAt.call(makeContext(), ...position);
    const second = ContainerScreensMixin._chestAt.call(makeContext(), ...position);
    assert(first.slots.some((stack) => !stack.isEmpty), 'generated dungeon chest is empty');
    assertEqual(
      JSON.stringify(first.slots.map((stack) => stack.toJSON())),
      JSON.stringify(second.slots.map((stack) => stack.toJSON())),
      'same seed and chest position must produce identical loot',
    );
    const ordinary = ContainerScreensMixin._chestAt.call(makeContext(), 100000, 120, 100000);
    assert(ordinary.slots.every((stack) => stack.isEmpty), 'player-placed chest should start empty');
  });

  it('fills generated mineshaft end chests with mining loot', () => {
    const seed = 'generated-mineshaft-loot-regression';
    let position = null;
    for (let gz = -40; gz <= 40 && !position; gz++) {
      for (let gx = -40; gx <= 40 && !position; gx++) {
        const shaft = mineshaftCandidateForCell(seed, gx, gz);
        if (!shaft) continue;
        for (const piece of mineshaftPlan(seed, shaft).pieces) {
          if (piece.kind !== 'corridor' || !piece.deadEnd || !piece.chest || piece.d !== 1 ||
              shaft.x - gx * 96 >= 29) continue;
          const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][piece.d];
          position = [piece.sx + dx * (piece.length - 1), piece.y + 1,
            piece.sz + dz * (piece.length - 1)];
          break;
        }
      }
    }
    assert(position, 'test seed did not produce a mineshaft chest');
    const context = {
      world: { seed },
      _containers: new Map(),
      _containerKey: (x, y, z) => `${x},${y},${z}`,
    };
    const chest = ContainerScreensMixin._chestAt.call(context, ...position);
    assert(chest.slots.some((stack) => !stack.isEmpty), 'mineshaft chest has no loot');
  });

  it('replaces stale mismatched block-entity data instead of crashing when opening a chest', () => {
    const context = {
      world: { seed: 'stale-container-regression' },
      _containers: new Map([['4,70,9', { type: 'furnace', data: new Furnace() }]]),
      _containerKey: (x, y, z) => `${x},${y},${z}`,
    };
    const chest = ContainerScreensMixin._chestAt.call(context, 4, 70, 9);
    assertEqual(chest.slots.length, 27);
    assert(context._containers.get('4,70,9').type === 'chest',
      'stale furnace record should be replaced by a chest record');
  });

  it('fills the village pantry chest with food and supplies', () => {
    const seed = 'generated-village-pantry';
    const generator = new TerrainGenerator(seed);
    let pantry = null;
    for (let gz = -24; gz <= 24 && !pantry; gz++) {
      for (let gx = -24; gx <= 24 && !pantry; gx++) {
        const village = villageCandidateForCell(seed, gx, gz);
        if (!village) continue;
        const site = generator.validateVillageSite(village.x, village.z);
        if (site) pantry = [village.x + 5, site.y + 1, village.z + 5];
      }
    }
    assert(pantry, 'test seed did not produce a village site');
    const context = {
      world: { seed },
      _containers: new Map(),
      _containerKey: (x, y, z) => `${x},${y},${z}`,
    };
    const chest = ContainerScreensMixin._chestAt.call(context, ...pantry);
    assert(chest.slots.some((stack) => !stack.isEmpty), 'village pantry chest is empty');
  });
});

describe('Furnace', () => {
  it('smelts iron ore to an ingot after 200 ticks with coal', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:iron_ore', 1);
    f.fuel = ItemStack.of('mc:coal', 1);
    for (let i = 0; i < SMELT_TICKS; i++) f.tick();
    assertEqual(f.output.item.id, 'mc:iron_ingot');
    assertEqual(f.output.count, 1);
    assert(f.input.isEmpty, 'input should be consumed');
  });
  it('smelts cobblestone into stone and sand into glass', () => {
    for (const [input, output] of [['mc:cobblestone', 'mc:stone'], ['mc:sand', 'mc:glass']]) {
      const f = new Furnace();
      f.input = ItemStack.of(input, 1);
      f.fuel = ItemStack.of('mc:coal', 1);
      for (let i = 0; i < SMELT_TICKS; i++) f.tick();
      assertEqual(f.output.item?.id, output, input);
    }
  });

  it('does not smelt without fuel', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:cobblestone', 1);
    for (let i = 0; i < SMELT_TICKS + 10; i++) f.tick();
    assert(f.output.isEmpty, 'no output without fuel');
  });
  it('coal burns for 1600 ticks', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:cobblestone', 1);
    f.fuel = ItemStack.of('mc:coal', 1);
    f.tick();
    assertEqual(f.burnTotal, 1600);
  });
  it('smelts every 1.12.2 overworld log into charcoal', () => {
    for (const wood of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
      const f = new Furnace();
      f.input = ItemStack.of(`mc:${wood}_log`, 1);
      f.fuel = ItemStack.of('mc:coal', 1);
      for (let i = 0; i < SMELT_TICKS; i++) f.tick();
      assertEqual(f.output.item.id, 'mc:charcoal', wood);
    }
  });

  it('progress falls back when it stops smelting', () => {
    const f = new Furnace();
    f.cookProgress = 100;
    f.tick();
    assertEqual(f.cookProgress, 98);
  });
});


describe('Furnace screen item placement', () => {
  it('accepts smeltable items and fuel from shift-clicked inventory stacks', () => {
    const spec = { kind: 'furnace', furnace: new Furnace() };
    const ore = ItemStack.of('mc:iron_ore', 3);
    const fuel = ItemStack.of('mc:coal', 4);
    assert(ContainerScreensMixin._moveToFurnace(spec, ore));
    assertEqual(spec.furnace.input.count, 3);
    assert(ore.isEmpty, 'all ore should move into input');
    assert(ContainerScreensMixin._moveToFurnace(spec, fuel));
    assertEqual(spec.furnace.fuel.count, 4);
    assert(fuel.isEmpty, 'all fuel should move into fuel slot');
  });

  it('leaves incompatible items in inventory and preserves overflow', () => {
    const spec = { kind: 'furnace', furnace: new Furnace() };
    const incompatible = ItemStack.of('mc:diamond', 2);
    assert(!ContainerScreensMixin._moveToFurnace(spec, incompatible));
    assertEqual(incompatible.count, 2);
    spec.furnace.input = ItemStack.of('mc:iron_ore', 63);
    const overflow = ItemStack.of('mc:iron_ore', 4);
    assert(ContainerScreensMixin._moveToFurnace(spec, overflow));
    assertEqual(spec.furnace.input.count, 64);
    assertEqual(overflow.count, 3);
  });
});
