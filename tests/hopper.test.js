import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Chest, Hopper, moveOneItem, serializeContainer, deserializeContainer, drainContainer, isItemInHopperIntake, insertDroppedStack } from '../src/game/containers.js';
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
  it('collects item entities intersecting the hopper intake volume', () => {
    assertEqual(isItemInHopperIntake({ x: 0.5, y: 1.08, z: 0.5 }, 0, 0, 0), true);
    assertEqual(isItemInHopperIntake({ x: 0.02, y: 1.08, z: 0.5 }, 0, 0, 0), false);
    assertEqual(isItemInHopperIntake({ x: 0.5, y: 1.5, z: 0.5 }, 0, 0, 0), false);
    assertEqual(isItemInHopperIntake({ x: NaN, y: 1, z: 0 }, 0, 0, 0), false);
  });
  it('inserts a dropped stack and reports partial capacity accurately', () => {
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 60));
    for (let i = 1; i < 5; i++) hopper.slots[i] = ItemStack.of('mc:stone', 64);
    const result = insertDroppedStack(hopper, ItemStack.of('mc:coal', 9));
    assertEqual(result.inserted, 4);
    assertEqual(result.remaining, 5);
    assertEqual(hopper.slots[0].count, 64);
  });
  it('does not change a hopper when a dropped stack cannot fit', () => {
    const hopper = new Hopper();
    for (let i = 0; i < 5; i++) hopper.slots[i] = ItemStack.of('mc:stone', 64);
    const result = insertDroppedStack(hopper, ItemStack.of('mc:coal', 3));
    assertEqual(result.inserted, 0);
    assertEqual(result.remaining, 3);
  });
  it('collects a dropped item into a nearby hopper on the eight-tick cycle', () => {
    const blocks = new Map([['0,0,0', BLOCKS.get('mc:hopper').defaultState]]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const hopper = new Hopper();
    const drop = { stack: ItemStack.of('mc:melon_slice', 7), x: 0.5, y: 1.08, z: 0.5 };
    const entities = { droppedItems: [drop] };
    const game = {
      world, entities, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => hopper;
    game._tickHoppers();
    assertEqual(hopper.slots[0].item.id, 'mc:melon_slice');
    assertEqual(hopper.slots[0].count, 7);
    assertEqual(entities.droppedItems.length, 0);
  });
  it('claims a shared dropped stack atomically before inserting it into the hopper', async () => {
    const blocks = new Map([['0,0,0', BLOCKS.get('mc:hopper').defaultState]]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const hopper = new Hopper();
    const drop = { networkKey: 'drop-1', stack: ItemStack.of('mc:paper', 12), x: 0.5, y: 1.08, z: 0.5 };
    const entities = { droppedItems: [drop], spawnItemStackAt() { throw new Error('no remainder expected'); } };
    let claims = 0;
    const multiplayer = {
      roomId: 'ABCDE', isHost: true,
      claimDroppedItem: async () => { claims++; return true; },
    };
    const game = {
      world, entities, multiplayer, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => hopper;
    game._tickHoppers();
    await Promise.resolve();
    assertEqual(claims, 1);
    assertEqual(hopper.slots[0].item.id, 'mc:paper');
    assertEqual(hopper.slots[0].count, 12);
    assertEqual(entities.droppedItems.length, 0);
    assertEqual(game._hopperDirtyKeys.has('0,0,0'), true);
  });
  it('returns a partially accepted network stack to the world after the atomic claim', async () => {
    const blocks = new Map([['0,0,0', BLOCKS.get('mc:hopper').defaultState]]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 60));
    for (let i = 1; i < 5; i++) hopper.slots[i] = ItemStack.of('mc:stone', 64);
    const drop = { networkKey: 'drop-partial', stack: ItemStack.of('mc:coal', 9), x: 0.5, y: 1.08, z: 0.5 };
    const returned = [];
    const entities = {
      droppedItems: [drop],
      spawnItemStackAt(stack) { returned.push(stack.clone()); return true; },
    };
    const game = {
      world, entities,
      multiplayer:{ roomId:'ABCDE', isHost:true, claimDroppedItem: async () => true },
      player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => hopper;
    game._tickHoppers();
    await Promise.resolve();
    assertEqual(hopper.slots[0].count, 64);
    assertEqual(entities.droppedItems.length, 0);
    assertEqual(returned.length, 1);
    assertEqual(returned[0].count, 5);
    assertEqual(returned[0].item.id, 'mc:coal');
  });
  it('does not collect a shared item on a non-host client', () => {
    const blocks = new Map([['0,0,0', BLOCKS.get('mc:hopper').defaultState]]);
    const world = { getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; } };
    const drop = { networkKey: 'drop-2', stack: ItemStack.of('mc:paper', 2), x: 0.5, y: 1.08, z: 0.5 };
    const game = {
      world, entities:{ droppedItems:[drop] },
      multiplayer:{ roomId:'ABCDE', isHost:false },
      player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => { throw new Error('non-host must not mutate hopper state'); };
    game._tickHoppers();
    assertEqual(game.entities.droppedItems.length, 1);
    assertEqual(drop.stack.count, 2);
  });
  it('keeps the uncollected remainder in the world when the hopper is almost full', () => {
    const blocks = new Map([['0,0,0', BLOCKS.get('mc:hopper').defaultState]]);
    const world = {
      getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
    };
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 60));
    for (let i = 1; i < 5; i++) hopper.slots[i] = ItemStack.of('mc:stone', 64);
    const drop = { stack: ItemStack.of('mc:coal', 9), x: 0.5, y: 1.08, z: 0.5 };
    const entities = { droppedItems: [drop] };
    const game = {
      world, entities, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => hopper;
    game._tickHoppers();
    assertEqual(hopper.slots[0].count, 64);
    assertEqual(entities.droppedItems.length, 1);
    assertEqual(entities.droppedItems[0].stack.count, 5);
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
    const drop = { stack: ItemStack.of('mc:coal', 2), x:0.5, y:1.08, z:0.5 };
    const game = {
      world, entities:{ droppedItems:[drop] }, player:{x:0.5,y:0,z:0.5}, tickCount:8, _containers:new Map(),
      ...ContainerScreensMixin,
    };
    game._hopperAt = () => { throw new Error('powered hopper must not transfer'); };
    game._tickHoppers();
    assertEqual(blocks.get('0,0,0').get('enabled'), false);
    assertEqual(game.entities.droppedItems.length, 1);
  });
  it('has the vanilla five-iron-and-chest crafting recipe', () => {
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:hopper' &&
      recipe.pattern?.join('|') === 'I I|ICI| I '), 'hopper recipe missing');
  });
});
