import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Inventory } from '../src/game/inventory.js';
import { AIR, BLOCKS } from '../src/world/block.js';
import { BlockActionsMixin } from '../src/game/block_actions.js';
import { GAMEMODE } from '../src/entity/player.js';
import { RECIPES } from '../src/game/recipes.js';
import { scoopFluid, emptyBucket, planBucketInteraction } from '../src/game/bucket.js';
import { Furnace, serializeContainer, deserializeContainer } from '../src/game/containers.js';

describe('Java fluid buckets', () => {
  it('registers non-stackable water and lava buckets with an empty-bucket return', () => {
    assertEqual(ITEMS.get('mc:water_bucket')?.stackSize, 1);
    assertEqual(ITEMS.get('mc:water_bucket')?.containerItem, 'mc:bucket');
    assertEqual(ITEMS.get('mc:lava_bucket')?.stackSize, 1);
    assertEqual(ITEMS.get('mc:lava_bucket')?.containerItem, 'mc:bucket');
  });

  it('scoops only source water and lava with an empty bucket', () => {
    assertEqual(scoopFluid(ItemStack.of('mc:bucket'), 'mc:water')?.item.id, 'mc:water_bucket');
    assertEqual(scoopFluid(ItemStack.of('mc:bucket'), 'mc:lava')?.item.id, 'mc:lava_bucket');
    assertEqual(scoopFluid(ItemStack.of('mc:bucket'), 'mc:stone'), null);
    assertEqual(planBucketInteraction('mc:bucket', 'mc:water', 1, null), null);
    assertEqual(planBucketInteraction('mc:bucket', 'mc:water', 0, null)?.type, 'scoop');
  });

  it('empties filled buckets only into air or replaceable blocks', () => {
    assertEqual(emptyBucket(ItemStack.of('mc:water_bucket'))?.fluid, 'mc:water');
    assertEqual(emptyBucket(ItemStack.of('mc:lava_bucket'))?.fluid, 'mc:lava');
    assertEqual(planBucketInteraction('mc:water_bucket', 'mc:stone', undefined, { id: 'mc:air', replaceable: true })?.fluid, 'mc:water');
    assertEqual(planBucketInteraction('mc:lava_bucket', 'mc:stone', undefined, { id: 'mc:tall_grass', replaceable: true })?.fluid, 'mc:lava');
    assertEqual(planBucketInteraction('mc:water_bucket', 'mc:stone', undefined, { id: 'mc:stone', replaceable: false }), null);
  });

  it('adds the vanilla iron bucket recipe and validates the recipe book', () => {
    assertEqual(RECIPES.producing('mc:bucket').length, 1);
    assertEqual(RECIPES.validate().length, 0);
  });
});

describe('Lava bucket furnace fuel', () => {
  it('burns for 20,000 ticks and returns the empty bucket to the fuel slot', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:raw_beef', 1);
    furnace.fuel = ItemStack.of('mc:lava_bucket', 1);
    furnace.tick();
    assertEqual(furnace.burnTotal, 20000);
    assertEqual(furnace.burnLeft, 20000);
    assertEqual(furnace.fuel.item.id, 'mc:bucket');
    assertEqual(furnace.fuel.count, 1);
  });

  it('keeps a returned bucket when the furnace fuel slot is serialized', () => {
    const furnace = new Furnace();
    furnace.input = ItemStack.of('mc:raw_beef', 1);
    furnace.fuel = ItemStack.of('mc:lava_bucket', 1);
    furnace.tick();
    const restored = deserializeContainer(serializeContainer('furnace', furnace));
    assertEqual(restored.data.fuel.item.id, 'mc:bucket');
    assertEqual(restored.data.burnLeft, 20000);
  });
});


describe('Fluid bucket gameplay integration', () => {
  function makeGame(itemId, hitBlockId, hitLevel = undefined) {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of(itemId, 1));
    const changes = [];
    const world = {
      getBlock(x, y, z) {
        if (x === 4 && y === 5 && z === 6) {
          const block = BLOCKS.get(hitBlockId);
          return { block: block ?? AIR, get: (name) => name === 'level' ? hitLevel : undefined };
        }
        return { block: AIR };
      },
      setBlock(x, y, z, state) { changes.push({ x, y, z, state }); return true; },
    };
    const game = {
      inventory, world, player: { gamemode: GAMEMODE.SURVIVAL, x: 0, y: 4, z: 0 },
      hit: {
        x: 4, y: 5, z: 6, face: { dx: 1, dy: 0, dz: 0 },
        state: { block: BLOCKS.get(hitBlockId), get: (name) => name === 'level' ? hitLevel : undefined },
      },
      entities: { targetedMob: () => null, spawnItemStackAt() {} },
      multiplayer: { pushBlockChange() {} },
      sounds: { play() {} }, ui: { toast() {} },
    };
    return { game, changes };
  }

  it('collects source water and replaces it with air in survival', () => {
    const { game, changes } = makeGame('mc:bucket', 'mc:water', 0);
    BlockActionsMixin._useOrPlace.call(game);
    assertEqual(changes.length, 1);
    assertEqual(changes[0].state.block.id, 'mc:air');
    assertEqual(game.inventory.held.item.id, 'mc:water_bucket');
  });

  it('places lava into the adjacent replaceable block and returns an empty bucket', () => {
    const { game, changes } = makeGame('mc:lava_bucket', 'mc:stone');
    BlockActionsMixin._useOrPlace.call(game);
    assertEqual(changes.length, 1);
    assertEqual(changes[0].x, 5);
    assertEqual(changes[0].state.block.id, 'mc:lava');
    assertEqual(game.inventory.held.item.id, 'mc:bucket');
  });
});
