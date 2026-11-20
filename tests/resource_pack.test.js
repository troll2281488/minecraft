import { describe, it, assert, assertEqual } from './framework.js';
import { shouldFetchExternalItemTexture } from '../src/render/resource_pack.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { buildTextures, buildBlockTextureTable } from '../src/render/atlas.js';

describe('External item texture selection', () => {
  it('uses built-in generated icons for spawn eggs', () => {
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:cow_spawn_egg', spawnEggMob: 'cow' }), false);
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:zombie_spawn_egg', spawnEggMob: 'zombie' }), false);
  });

  it('does not request textures for block items', () => {
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:stone', block: 'mc:stone' }), false);
  });

  it('still requests external textures for ordinary non-block items', () => {
    assert(shouldFetchExternalItemTexture({ id: 'mc:apple' }));
    assert(shouldFetchExternalItemTexture({ id: 'mc:iron_ingot' }));
  });
});

describe('Vanilla biome soil texture aliases', () => {
  it('uses the exact classic dirt texture for all biome soil variants', () => {
    const built = buildTextures();
    const index = built.index;
    const dirtLayer = index.get('dirt');
    const tileBytes = 16 * 16 * 4;
    const tile = (name) => built.data.slice(index.get(name) * tileBytes, (index.get(name) + 1) * tileBytes);
    for (const key of ['plains_soil', 'forest_floor', 'birch_soil', 'jungle_soil',
      'savanna_soil', 'taiga_soil', 'swamp_mud']) {
      assertEqual(tile(key).join(','), tile('dirt').join(','), `${key} must reuse dirt texture`);
    }
    assertEqual(tile('alpine_gravel').join(','), tile('gravel').join(','));
  });
});

describe('Grass biome tint and missing texture safety', () => {
  it('tints the top and all four grass-block side faces', () => {
    const grass = BLOCKS.get('mc:grass_block');
    for (const face of ['up', 'north', 'south', 'west', 'east']) {
      assert(grass.tintFaces.includes(face), `grass tint missing on ${face}`);
    }
    assert(!grass.tintFaces.includes('down'), 'bottom face should remain dirt');
  });

  it('never maps an unresolved block texture to the pink diagnostic checker', () => {
    const built = buildTextures();
    const table = buildBlockTextureTable(BLOCKS, built.index);
    const missing = built.index.get('__missing');
    for (const layer of table) assert(layer !== missing, 'block face mapped to pink missing texture');
  });
});

describe('Grass shader tint isolation', () => {
  it('applies biome colour only to grass blocks and recognizes the actual top face', async () => {
    const { TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER } = await import('../src/render/gl.js');
    assert(TERRAIN_VERTEX_SHADER.includes('vTintKind = tintKind'));
    assert(TERRAIN_FRAGMENT_SHADER.includes('if (vTintKind == 1u)'));
    assert(TERRAIN_FRAGMENT_SHADER.includes('if (vFace == 1u)'));
    assert(TERRAIN_FRAGMENT_SHADER.includes('vec3 textureColor = texel.rgb'));
  });
});
