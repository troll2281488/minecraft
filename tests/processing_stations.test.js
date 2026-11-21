import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { Furnace, SMELTING, SMOKING, BLASTING, serializeContainer, deserializeContainer } from '../src/game/containers.js';

describe('Java processing stations', () => {
  it('registers smooth stone, smoker and blast furnace as obtainable blocks', () => {
    for (const id of ['mc:smooth_stone', 'mc:smoker', 'mc:blast_furnace']) {
      assertEqual(BLOCKS.has(id), true);
      assertEqual(ITEMS.has(id), true);
    }
    assertEqual(RECIPES.producing('mc:smoker').length, 1);
    assertEqual(RECIPES.producing('mc:blast_furnace').length, 1);
    assertEqual(RECIPES.validate().length, 0);
  });

  it('smelts stone into smooth stone in a regular furnace', () => {
    const furnace = new Furnace('furnace');
    furnace.input = ItemStack.of('mc:stone', 1);
    furnace.fuel = ItemStack.of('mc:coal', 1);
    for (let i = 0; i < 200; i++) furnace.tick();
    assertEqual(furnace.output.item.id, 'mc:smooth_stone');
    assertEqual(furnace.output.count, 1);
  });

  it('smoker accepts food only and cooks it in half the furnace time', () => {
    assertEqual(SMOKING.has('mc:raw_beef'), true);
    assertEqual(SMOKING.has('mc:iron_ore'), false);
    const smoker = new Furnace('smoker');
    smoker.input = ItemStack.of('mc:raw_beef', 1);
    smoker.fuel = ItemStack.of('mc:coal', 1);
    assertEqual(smoker.acceptsInput('mc:raw_beef'), true);
    assertEqual(smoker.acceptsInput('mc:iron_ore'), false);
    for (let i = 0; i < 100; i++) smoker.tick();
    assertEqual(smoker.output.item.id, 'mc:cooked_beef');
    assertEqual(smoker.output.count, 1);
    const invalid = new Furnace('smoker');
    invalid.input = ItemStack.of('mc:iron_ore', 1);
    invalid.fuel = ItemStack.of('mc:coal', 1);
    for (let i = 0; i < 120; i++) invalid.tick();
    assertEqual(invalid.output.isEmpty, true);
  });

  it('blast furnace accepts supported ores only and smelts them twice as fast', () => {
    assertEqual(BLASTING.has('mc:iron_ore'), true);
    assertEqual(BLASTING.has('mc:raw_beef'), false);
    const blast = new Furnace('blast_furnace');
    blast.input = ItemStack.of('mc:iron_ore', 1);
    blast.fuel = ItemStack.of('mc:coal', 1);
    assertEqual(blast.acceptsInput('mc:iron_ore'), true);
    assertEqual(blast.acceptsInput('mc:raw_beef'), false);
    for (let i = 0; i < 100; i++) blast.tick();
    assertEqual(blast.output.item.id, 'mc:iron_ingot');
    assertEqual(blast.output.count, 1);
  });

  it('persists station type, fuel, progress and inventory through serialization', () => {
    const smoker = new Furnace('smoker');
    smoker.input = ItemStack.of('mc:raw_cod', 1);
    smoker.fuel = ItemStack.of('mc:coal', 1);
    for (let i = 0; i < 37; i++) smoker.tick();
    const restored = deserializeContainer(serializeContainer('smoker', smoker));
    assertEqual(restored.type, 'smoker');
    assertEqual(restored.data.kind, 'smoker');
    assertEqual(restored.data.cookProgress, 37);
    assertEqual(restored.data.input.item.id, 'mc:raw_cod');
  });
});
