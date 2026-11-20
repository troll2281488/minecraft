import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Chunk } from '../src/world/chunk.js';
import { TerrainGenerator, findNearestStructure } from '../src/world/gen/terrain.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { blockDrops } from '../src/game/interaction.js';

describe('Nether and End dimensions', () => {
  it('generates a separate Nether chunk with bedrock and netherrack', () => {
    const generator = new TerrainGenerator('dimension-test', 'nether');
    const chunk = generator.generate(new Chunk(0, 0));
    assertEqual(chunk.getBlock(0, 0, 0).block.id, 'mc:bedrock');
    assert(['mc:netherrack','mc:stone'].includes(chunk.getBlock(8, 10, 8).block.id));
  });

  it('generates an End island rather than Overworld terrain', () => {
    const generator = new TerrainGenerator('dimension-test', 'end');
    const chunk = generator.generate(new Chunk(0, 0));
    assertEqual(chunk.getBiome(8, 64, 8), 'mc:the_end');
    assert(['mc:end_stone','mc:air'].includes(chunk.getBlock(8, 64, 8).block.id));
  });

  it('locates dimension-specific fortress and End-city candidates deterministically', () => {
    const fortress = findNearestStructure('locate-seed','nether','fortress',0,0,12000);
    const city = findNearestStructure('locate-seed','end','end_city',0,0,12000);
    assert(fortress && Number.isFinite(fortress.x) && Number.isFinite(fortress.z));
    assert(city && Number.isFinite(city.x) && Number.isFinite(city.z));
    assertEqual(
      JSON.stringify(fortress),
      JSON.stringify(findNearestStructure('locate-seed','nether','fortress',0,0,12000)),
    );
  });
});


describe('Nether portal gameplay additions', () => {
  it('registers lava, portal, flint and steel, and blaze rods', () => {
    assert(BLOCKS.get('mc:lava'));
    assert(BLOCKS.get('mc:portal'));
    assert(ITEMS.get('mc:flint_and_steel'));
    assert(ITEMS.get('mc:blaze_rod'));
    assertEqual(RECIPES.producing('mc:flint_and_steel').length, 1);
  });

  it('drops coal items rather than coal ore blocks', () => {
    const state = BLOCKS.get('mc:coal_ore').defaultState;
    const drops = blockDrops(state, { item: ITEMS.get('mc:iron_pickaxe') }, 'coal-drop-test', 1, 20, 1);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:coal');
  });

  it('creates a wide lava sea and a spawn-side fortress floor in the Nether', () => {
    const generator = new TerrainGenerator('portal-nether-test', 'nether');
    const lake = generator.generate(new Chunk(0, 0));
    assertEqual(lake.getBlock(8, 31, 8).block.id, 'mc:lava');
    const fortress = generator.generate(new Chunk(2, 2));
    assertEqual(fortress.getBlock(4, 52, 4).block.id, 'mc:nether_bricks');
  });
});
