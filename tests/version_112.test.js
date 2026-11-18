import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { MIN_Y, MAX_Y, WORLD_HEIGHT, TOOL_TIER, HARVEST_LEVEL } from '../src/core/constants.js';
import { buildTextures } from '../src/render/atlas.js';
import { TerrainGenerator, generateChunk } from '../src/world/gen/terrain.js';

describe('Minecraft Java Edition 1.12.2 compatibility guardrails', () => {
  it('uses the classic 256-block build height', () => {
    assertEqual(MIN_Y, 0);
    assertEqual(MAX_Y, 256);
    assertEqual(WORLD_HEIGHT, 256);
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

  it('can build every registered block texture without missing atlas entries', () => {
    const atlas = buildTextures();
    assert(atlas.layers > 0);
    assert(atlas.index.has('jungle_log'));
    assert(atlas.index.has('acacia_planks'));
    assert(atlas.index.has('dark_oak_leaves'));
  });

  it('generates a classic-height chunk with no negative or over-height terrain', () => {
    const chunk = generateChunk(new TerrainGenerator('1.12.2-guardrail'), 0, 0);
    for (const height of chunk.heightmap) {
      assert(height >= 0 && height < 256, `height ${height} outside classic build range`);
    }
  });
});
