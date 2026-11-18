import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { MIN_Y, MAX_Y, WORLD_HEIGHT, TOOL_TIER, HARVEST_LEVEL, HOSTILE_SPAWN_MAX_LIGHT } from '../src/core/constants.js';
import { buildTextures } from '../src/render/atlas.js';
import { TerrainGenerator, generateChunk } from '../src/world/gen/terrain.js';

describe('Minecraft Java Edition 1.12.2 compatibility guardrails', () => {
  it('uses the classic 256-block build height', () => {
    assertEqual(MIN_Y, 0);
    assertEqual(MAX_Y, 256);
    assertEqual(WORLD_HEIGHT, 256);
    assertEqual(HOSTILE_SPAWN_MAX_LIGHT, 7);
  });

  it('does not register post-1.12 block families removed in this pass', () => {
    for (const id of [
      'mc:deepslate', 'mc:cobbled_deepslate', 'mc:deepslate_coal_ore',
      'mc:copper_ore', 'mc:copper_block',
    ]) assertEqual(BLOCKS.get(id), undefined, `${id} must not exist in the 1.12.2 registry`);
  });

  it('does not register the netherite tool tier', () => {
    assertEqual(TOOL_TIER.NETHERITE, undefined);
    assertEqual(HARVEST_LEVEL.NETHERITE, undefined);
    assertEqual(ITEMS.get('mc:netherite_sword'), undefined);
  });

  it('registers all six classic overworld wood families', () => {
    for (const species of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
      for (const part of ['log', 'planks', 'leaves', 'sapling']) {
        assert(BLOCKS.get(`mc:${species}_${part}`), `missing ${species}_${part}`);
      }
    }
  });

  it('registers the 16-color wool, stained-glass, terracotta and concrete families', () => {
    for (const color of ['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']) {
      for (const family of ['wool','stained_glass','terracotta','concrete','concrete_powder']) {
        assert(BLOCKS.get(`mc:${color}_${family}`), `missing ${color}_${family}`);
      }
    }
  });

  it('can build every registered block texture without missing atlas entries', () => {
    const atlas = buildTextures();
    assert(atlas.layers > 0);
    assert(atlas.index.has('jungle_log'));
    assert(atlas.index.has('acacia_planks'));
    assert(atlas.index.has('dark_oak_leaves'));
    assert(atlas.index.has('magenta_stained_glass'));
    assert(atlas.index.has('black_concrete'));
    assert(atlas.index.has('chest_top'));
    assert(atlas.index.has('chest_side'));
    assert(atlas.index.has('furnace_top'));
    assert(atlas.index.has('furnace_side'));
    assert(atlas.index.has('furnace_front'));
  });

  it('registers working 1.12.2 chest and furnace blocks', () => {
    assert(BLOCKS.get('mc:chest'));
    assert(BLOCKS.get('mc:furnace'));
    assert(ITEMS.get('mc:chest'));
    assert(ITEMS.get('mc:furnace'));
  });

  it('generates a classic-height chunk with no negative or over-height terrain', () => {
    const chunk = generateChunk(new TerrainGenerator('1.12.2-guardrail'), 0, 0);
    for (const height of chunk.heightmap) {
      assert(height >= 0 && height < 256, `height ${height} outside classic build range`);
    }
  });
});
