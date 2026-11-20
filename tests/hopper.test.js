import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Chest, Hopper, moveOneItem, serializeContainer, deserializeContainer, drainContainer } from '../src/game/containers.js';
import { ContainerScreensMixin } from '../src/game/container_screens.js';
import { RECIPES } from '../src/game/recipes.js';

describe('Java hopper inventory and automation primitives', () => {
  it('registers a five-slot hopper with a downward default outlet', () => {
    const state = BLOCKS.get('mc:hopper').defaultState;
    assertEqual(state.get('facing'), 'down');
    assertEqual(state.get('enabled'), true);
    assertEqual(ITEMS.get('mc:hopper').block, 'mc:hopper');
  });
  it('inserts items into the five-slot inventory', () => {
    const hopper = new Hopper();
    assertEqual(hopper.slots.length, 5);
    assertEqual(hopper.insert(ItemStack.of('mc:oak_planks', 12)), 0);
    assertEqual(hopper.slots[0].count, 12);
  });
  it('moves one item at a time and preserves stack identity', () => {
    const source = [ItemStack.of('mc:oak_planks', 3)];
    const destination = Array.from({ length: 5 }, () => ItemStack.EMPTY.clone());
    assert(moveOneItem(source, destination), 'one item should move');
    assertEqual(source[0].count, 2);
    assertEqual(destination[0].item.id, 'mc:oak_planks');
    assertEqual(destination[0].count, 1);
  });
  it('does not move an item into a full incompatible destination', () => {
    const source = [ItemStack.of('mc:oak_planks', 1)];
    const destination = [ItemStack.of('mc:stick', 64)];
    assertEqual(moveOneItem(source, destination), false);
    assertEqual(source[0].count, 1);
  });
  it('serializes and restores all five hopper slots', () => {
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:iron_ingot', 9));
    const record = serializeContainer('hopper', hopper);
    assertEqual(record.slots.length, 5);
    const restored = deserializeContainer(record);
    assertEqual(restored.type, 'hopper');
    assertEqual(restored.data.slots[0].item.id, 'mc:iron_ingot');
    assertEqual(restored.data.slots[0].count, 9);
  });
  it('drops stored contents when a hopper is broken', () => {
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 4));
    const drops = drainContainer('hopper', hopper);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].count, 4);
    assertEqual(hopper.slots.filter((slot) => !slot.isEmpty).length, 0);
  });
  it('pulls one item from a chest above on the eight-tick transfer cycle', () => {
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:hopper').defaultState],
      ['0,1,0', BLOCKS.get('mc:chest').defaultState],
    ]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const chest = new Chest();
    chest.insert(ItemStack.of('mc:oak_planks', 3));
    const hopper = new Hopper();
    const game = {
      world, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._chestAt = () => chest;
    game._hopperAt = () => hopper;
    game._tickHoppers();
    assertEqual(chest.slots[0].count, 2);
    assertEqual(hopper.slots[0].count, 1);
  });
  it('pushes one item into the container at the hopper outlet', () => {
    const hopperState = BLOCKS.get('mc:hopper').defaultState;
    const blocks = new Map([
      ['0,0,0', hopperState],
      ['0,-1,0', BLOCKS.get('mc:chest').defaultState],
    ]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const chest = new Chest();
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 2));
    const game = {
      world, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._chestAt = () => chest;
    game._hopperAt = () => hopper;
    game._tickHoppers();
    assertEqual(hopper.slots[0].count, 1);
    assertEqual(chest.slots[0].item.id, 'mc:coal');
    assertEqual(chest.slots[0].count, 1);
  });
  it('locks a hopper while an adjacent redstone block powers it', () => {
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:hopper').defaultState],
      ['1,0,0', BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const game = {
      world, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => { throw new Error('powered hopper must not transfer'); };
    game._tickHoppers();
    assertEqual(blocks.get('0,0,0').get('enabled'), false);
  });
  it('has the vanilla five-iron-and-chest crafting recipe', () => {
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:hopper' &&
      recipe.pattern?.join('|') === 'I I|ICI| I '), 'hopper recipe missing');
  });
});
