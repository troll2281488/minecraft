import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory } from '../src/game/inventory.js';
import { Chest, Furnace } from '../src/game/containers.js';
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
