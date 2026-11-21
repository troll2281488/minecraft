import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory } from '../src/game/inventory.js';
import { Chest, Furnace, serializeContainer, deserializeContainer, drainContainer } from '../src/game/containers.js';
import { ItemStack } from '../src/world/item.js';
import { ContainerScreensMixin } from '../src/game/container_screens.js';

function gameWith(spec) {
  return Object.assign({}, ContainerScreensMixin, {
    inventory: new Inventory(),
    _activeContainer: spec,
    _renderContainer() {},
  });
}

describe('container shift-click transfers', () => {
  it('moves a chest stack into player storage', () => {
    const chest = new Chest();
    chest.slots[0] = ItemStack.of('mc:diamond', 12);
    const game = gameWith({ kind: 'chest', slots: chest.slots });

    ContainerScreensMixin._onContainerClick.call(game, 'chest', 0, 0, true);

    assert(game.inventory.slots.some((s) => s.item?.id === 'mc:diamond' && s.count === 12));
    assert(chest.slots[0].isEmpty, 'chest source was not cleared');
  });

  it('keeps the remainder in the chest when player storage is nearly full', () => {
    const chest = new Chest();
    chest.slots[0] = ItemStack.of('mc:cobblestone', 10);
    const game = gameWith({ kind: 'chest', slots: chest.slots });
    for (let i = 0; i <= 35; i++) game.inventory.set(i, ItemStack.of('mc:stone', 64));
    game.inventory.set(9, ItemStack.of('mc:cobblestone', 60));

    ContainerScreensMixin._onContainerClick.call(game, 'chest', 0, 0, true);

    assertEqual(game.inventory.get(9).count, 64);
    assertEqual(chest.slots[0].count, 6, 'unmoved items should remain in the chest');
  });

  it('shift-clicks furnace output directly into player storage', () => {
    const furnace = new Furnace();
    furnace.output = ItemStack.of('mc:iron_ingot', 3);
    const game = gameWith({ kind: 'furnace', furnace });

    ContainerScreensMixin._onContainerClick.call(game, 'furnace-out', 0, 0, true);

    assert(game.inventory.slots.some((s) => s.item?.id === 'mc:iron_ingot' && s.count === 3));
    assert(furnace.output.isEmpty, 'furnace output was not cleared');
  });

  it('preserves source remainder when shift-clicking inventory into a full chest', () => {
    const chest = new Chest();
    for (let i = 0; i < chest.slots.length; i++) chest.slots[i] = ItemStack.of('mc:stone', 64);
    chest.slots[0] = ItemStack.of('mc:cobblestone', 63);
    const game = gameWith({ kind: 'chest', slots: chest.slots });
    game.inventory.set(9, ItemStack.of('mc:cobblestone', 5));

    ContainerScreensMixin._onContainerClick.call(game, 'inv', 9, 0, true);

    assertEqual(chest.slots[0].count, 64);
    assertEqual(game.inventory.get(9).count, 4, 'remaining stack should stay in player inventory');
  });

  it('moves only the available capacity into a furnace input slot', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:iron_ore', 63);
    const game = gameWith({ kind: 'furnace', furnace });
    game.inventory.set(9, ItemStack.of('mc:iron_ore', 5));

    ContainerScreensMixin._onContainerClick.call(game, 'inv', 9, 0, true);

    assertEqual(furnace.input.count, 64);
    assertEqual(game.inventory.get(9).count, 4, 'unmoved input must remain in inventory');
  });

  it('does not move non-smeltable, non-fuel items into a furnace', () => {
    const furnace = new Furnace();
    const game = gameWith({ kind: 'furnace', furnace });
    game.inventory.set(9, ItemStack.of('mc:diamond', 3));

    ContainerScreensMixin._onContainerClick.call(game, 'inv', 9, 0, true);

    assert(furnace.input.isEmpty && furnace.fuel.isEmpty);
    assertEqual(game.inventory.get(9).count, 3);
  });

  it('does not allow placing cursor items into the furnace output slot', () => {
    const furnace = new Furnace();
    furnace.output = ItemStack.of('mc:iron_ingot', 2);
    const game = gameWith({ kind: 'furnace', furnace });
    game.inventory.cursor = ItemStack.of('mc:diamond', 1);

    ContainerScreensMixin._onContainerClick.call(game, 'furnace-out', 0, 0, false);

    assertEqual(furnace.output.count, 2);
    assertEqual(game.inventory.cursor.item.id, 'mc:diamond');
    assertEqual(game.inventory.cursor.count, 1);
  });

  it('returns a partial furnace output transfer without losing the remainder', () => {
    const furnace = new Furnace();
    furnace.output = ItemStack.of('mc:iron_ingot', 10);
    const game = gameWith({ kind: 'furnace', furnace });
    for (let i = 0; i <= 35; i++) game.inventory.set(i, ItemStack.of('mc:stone', 64));
    game.inventory.set(9, ItemStack.of('mc:iron_ingot', 60));

    ContainerScreensMixin._onContainerClick.call(game, 'furnace-out', 0, 0, true);

    assertEqual(game.inventory.get(9).count, 64);
    assertEqual(furnace.output.count, 6, 'output remainder must stay in the furnace');
  });

});


describe('container persistence and break handling', () => {
  it('round-trips chest slots without sharing mutable stack objects', () => {
    const chest = new Chest();
    chest.slots[4] = ItemStack.of('mc:diamond', 7);
    const restored = deserializeContainer(serializeContainer('chest', chest));

    assert(restored && restored.type === 'chest');
    assertEqual(restored.data.slots[4].item.id, 'mc:diamond');
    assertEqual(restored.data.slots[4].count, 7);
    restored.data.slots[4].count = 1;
    assertEqual(chest.slots[4].count, 7, 'restored state must not alias original stacks');
  });

  it('rejects malformed chest records instead of restoring partial inventories', () => {
    assertEqual(deserializeContainer({ type: 'chest', slots: [] }), null);
    assertEqual(deserializeContainer({ type: 'chest', slots: Array(26).fill(null) }), null);
    assertEqual(deserializeContainer(null), null);
  });

  it('clamps restored furnace timers to valid non-negative ranges', () => {
    const restored = deserializeContainer({
      type: 'furnace',
      input: null, fuel: null, output: null,
      burnTotal: 20, burnLeft: 99, cookProgress: 999,
    });

    assert(restored && restored.type === 'furnace');
    assertEqual(restored.data.burnTotal, 20);
    assertEqual(restored.data.burnLeft, 20);
    assertEqual(restored.data.cookProgress, 199);
  });

  it('drains chest contents as independent drops and empties the chest', () => {
    const chest = new Chest();
    chest.slots[0] = ItemStack.of('mc:iron_ingot', 4);
    const drops = drainContainer('chest', chest);

    assertEqual(drops.length, 1);
    assertEqual(drops[0].count, 4);
    assert(chest.slots.every((stack) => stack.isEmpty));
    drops[0].count = 1;
    assertEqual(chest.slots[0].count, 0);
  });

  it('clears furnace slots and progress when the furnace is drained', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:iron_ore', 2);
    furnace.fuel = ItemStack.of('mc:coal', 3);
    furnace.output = ItemStack.of('mc:iron_ingot', 1);
    furnace.burnLeft = 80;
    furnace.burnTotal = 160;
    furnace.cookProgress = 45;

    const drops = drainContainer('furnace', furnace);

    assertEqual(drops.length, 3);
    assert(furnace.input.isEmpty && furnace.fuel.isEmpty && furnace.output.isEmpty);
    assertEqual(furnace.burnLeft, 0);
    assertEqual(furnace.burnTotal, 0);
    assertEqual(furnace.cookProgress, 0);
  });
});


describe('container edit lock UI gate', () => {
  for (const lockState of ['pending', 'busy', 'offline', 'lost']) {
    it(`blocks slot changes while lock state is ${lockState}`, () => {
      const chest = new Chest();
      chest.slots[0] = ItemStack.of('mc:diamond', 4);
      const game = gameWith({ kind: 'chest', slots: chest.slots, lockState });
      game.inventory.cursor = ItemStack.of('mc:stone', 2);

      ContainerScreensMixin._onContainerClick.call(game, 'chest', 0, 0, false);

      assertEqual(chest.slots[0].count, 4);
      assertEqual(chest.slots[0].item.id, 'mc:diamond');
      assertEqual(game.inventory.cursor.count, 2);
      assertEqual(game.inventory.cursor.item.id, 'mc:stone');
    });
  }

  it('does not publish container snapshots after the edit lease is lost', () => {
    const chest = new Chest();
    let published = 0;
    const game = gameWith({ kind: 'chest', slots: chest.slots, key: '1,64,2', lockState: 'lost' });
    game._containers = new Map([['1,64,2', { type: 'chest', data: chest }]]);
    game.multiplayer = { pushContainerState: () => { published++; } };

    ContainerScreensMixin._syncActiveContainer.call(game);

    assertEqual(published, 0);
  });
});



describe('host furnace lease coordination', () => {
  it('pauses furnace ticks while another player owns the edit lease', () => {
    let ticks = 0;
    const game = Object.assign({}, ContainerScreensMixin, {
      _containers: new Map([['1,64,2', { type: 'furnace', data: { tick: () => { ticks++; } } }]]),
      multiplayer: { roomId: 'ABCDE', isHost: true, isContainerLockedByOther: () => true },
      tickCount: 20,
    });

    ContainerScreensMixin._tickFurnaces.call(game);

    assertEqual(ticks, 0);
  });

  it('continues furnace ticks when no other player owns the lease', () => {
    let ticks = 0;
    const game = Object.assign({}, ContainerScreensMixin, {
      _containers: new Map([['1,64,2', { type: 'furnace', data: { tick: () => { ticks++; } } }]]),
      multiplayer: { roomId: 'ABCDE', isHost: true, isContainerLockedByOther: () => false, pushContainerState() {} },
      tickCount: 1,
    });

    ContainerScreensMixin._tickFurnaces.call(game);

    assertEqual(ticks, 1);
  });
});

