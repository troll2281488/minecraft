import { describe, it, assert, assertEqual } from './framework.js';
import { shouldFetchExternalItemTexture, shouldFetchExternalBlockTexture, resolveJavaBlockFaces, javaEntityTextureKey } from '../src/render/resource_pack.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { buildTextures, buildBlockTextureTable } from '../src/render/atlas.js';
import { packSurface } from '../src/render/mesher.js';
import { parseTextureAnimation, textureFrameAt } from '../src/render/texture_animation.js';

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

describe('ItsBrian terrain and jungle vine textures', () => {
  it('loads the original ItsBrian gravel texture for normal and alpine gravel', () => {
    assert(shouldFetchExternalBlockTexture('gravel'));
    assert(shouldFetchExternalBlockTexture('alpine_gravel'));
  });

  it('keeps only intentionally local soil and foliage variants out of the external pack', () => {
    assert(!shouldFetchExternalBlockTexture('oak_leaves'));
    assert(!shouldFetchExternalBlockTexture('coarse_dirt'));
    assert(shouldFetchExternalBlockTexture('vine'));
  });

  it('tints jungle vines with the biome foliage colour instead of leaving them grey', () => {
    assertEqual(BLOCKS.get('mc:vine').tint, 'foliage');
  });
});


describe('Snow leaf tint channel', () => {
  it('marks leaves separately from ordinary foliage so only leaves turn white in snow biomes', () => {
    assertEqual(BLOCKS.get('mc:oak_leaves').tint, 'leaves');
    assertEqual(BLOCKS.get('mc:birch_leaves').tint, 'leaves');
    assertEqual(BLOCKS.get('mc:vine').tint, 'foliage');
  });

  it('packs the new leaf tint without corrupting ambient occlusion or light', () => {
    const word = packSurface(7, 5, 2, 4, 3, 15, 11);
    assertEqual((word >>> 17) & 7, 4);
    assertEqual((word >>> 20) & 3, 3);
    assertEqual((word >>> 22) & 15, 15);
    assertEqual((word >>> 26) & 15, 11);
  });

  it('has a dedicated leaf colour in the terrain shader', async () => {
    const { TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER } = await import('../src/render/gl.js');
    assert(TERRAIN_VERTEX_SHADER.includes('uLeavesColor'));
    assert(TERRAIN_VERTEX_SHADER.includes('tintKind == 4u'));
    assert(TERRAIN_FRAGMENT_SHADER.includes('vTintKind == 4u && uLeavesColor.r > 0.9'));
  });
});

describe('Java block model texture resolution', () => {
  it('resolves inherited cube model texture variables into six block faces', () => {
    const models = new Map([
      ['cube_all', {
        elements: [{
          faces: Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east']
            .map(face => [face, { texture: '#all' }])),
        }],
      }],
      ['stone', {
        parent: 'minecraft:block/cube_all',
        textures: { all: 'minecraft:block/stone' },
      }],
    ]);
    const blockstates = new Map([
      ['stone', { variants: { '': { model: 'minecraft:block/stone' } } }],
    ]);
    const faces = resolveJavaBlockFaces(models, blockstates);
    assertEqual(faces['mc:stone'].up, 'stone');
    assertEqual(faces['mc:stone'].down, 'stone');
    assertEqual(faces['mc:stone'].north, 'stone');
  });

  it('uses per-face model textures rather than replacing all faces with one tile', () => {
    const models = new Map([
      ['log', {
        textures: { end: 'minecraft:block/oak_log_top', side: 'minecraft:block/oak_log' },
        elements: [{
          faces: {
            up: { texture: '#end' }, down: { texture: '#end' },
            north: { texture: '#side' }, south: { texture: '#side' },
            west: { texture: '#side' }, east: { texture: '#side' },
          },
        }],
      }],
    ]);
    const blockstates = new Map([
      ['oak_log', { variants: { '': { model: 'minecraft:block/log' } } }],
    ]);
    const faces = resolveJavaBlockFaces(models, blockstates);
    assertEqual(faces['mc:oak_log'].up, 'oak_log_top');
    assertEqual(faces['mc:oak_log'].east, 'oak_log');
  });
});


describe('Java animated texture metadata', () => {
  it('parses vertical sprite sheets and custom frame durations', () => {
    const animation = parseTextureAnimation({ animation: { frametime: 2, frames: [0, { index: 2, time: 5 }] } }, 16, 48);
    assertEqual(animation.frameCount, 3);
    assertEqual(animation.frames.length, 2);
    assertEqual(animation.frames[1].time, 5);
    assertEqual(animation.duration, 7);
  });

  it('selects the correct animation frame over time', () => {
    const animation = parseTextureAnimation({ animation: { frames: [0, { index: 2, time: 3 }] } }, 16, 48);
    assertEqual(textureFrameAt(animation, 0), 0);
    assertEqual(textureFrameAt(animation, 1), 2);
    assertEqual(textureFrameAt(animation, 3), 2);
    assertEqual(textureFrameAt(animation, 4), 0);
  });

  it('rejects invalid dimensions and ignores out-of-range frame indices', () => {
    assertEqual(parseTextureAnimation({ animation: {} }, 16, 30), null);
    const animation = parseTextureAnimation({ animation: { frames: [99, 1] } }, 16, 32);
    assertEqual(animation.frames.length, 1);
    assertEqual(animation.frames[0].index, 1);
  });
});


describe('Java entity texture pack imports', () => {
  it('maps entity skin paths to stable mob texture keys', () => {
    assertEqual(javaEntityTextureKey('textures/entity/cow/cow.png'), 'cow');
    assertEqual(javaEntityTextureKey('assets/minecraft/textures/entity/horse/horse_black.png'), 'horse_black');
    assertEqual(javaEntityTextureKey('textures/entity/warden/warden.png'), 'warden');
    assertEqual(javaEntityTextureKey('textures/item/iron_sword.png'), null);
    assertEqual(javaEntityTextureKey('textures/entity/cow/cow.txt'), null);
  });
});
