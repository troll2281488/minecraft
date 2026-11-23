import { describe, it, assert } from './framework.js';
import { generateItemIcon, resolveBlockItemTextureLayers } from '../src/render/item_icons.js';
import { buildTextures } from '../src/render/atlas.js';
import { BLOCKS } from '../src/world/block.js';
import { BLOCK_COUNT, STATE_COUNT, ITEM_COUNT } from '../src/world/blocks/index.js';
import { TEXTURES } from '../src/render/atlas.js';

describe('expanded pixel-art item icons', () => {
  for (const id of [
    'mc:paper', 'mc:book', 'mc:enchanted_book', 'mc:ender_pearl',
    'mc:gunpowder', 'mc:name_tag', 'mc:golden_apple', 'mc:apple',
    'mc:bread', 'mc:carrot', 'mc:potato', 'mc:rotten_flesh',
    'mc:glowstone_dust', 'mc:bone_meal', 'mc:ink_sac',
    'mc:nautilus_shell', 'mc:fire_charge', 'mc:arrow',
    'mc:gold_nugget', 'mc:blaze_powder', 'mc:blaze_rod', 'mc:snowball',
    'mc:quartz', 'mc:slime_ball', 'mc:honeycomb', 'mc:glass_bottle',
    'mc:water_bottle', 'mc:egg', 'mc:compass', 'mc:map',
    'mc:melon_slice', 'mc:sweet_berries', 'mc:golden_carrot',
    'mc:water_bucket', 'mc:lava_bucket', 'mc:saddle', 'mc:lead',
    'mc:firework_rocket', 'mc:music_disc_13', 'mc:raw_beef',
    'mc:cooked_beef', 'mc:raw_porkchop', 'mc:cooked_chicken',
    'mc:baked_potato', 'mc:honey_bottle', 'mc:mushroom_stew',
    'mc:white_dye', 'mc:orange_dye', 'mc:magenta_dye', 'mc:light_blue_dye',
    'mc:yellow_dye', 'mc:lime_dye', 'mc:pink_dye', 'mc:gray_dye',
    'mc:light_gray_dye', 'mc:cyan_dye', 'mc:purple_dye', 'mc:blue_dye',
    'mc:brown_dye', 'mc:green_dye', 'mc:red_dye', 'mc:black_dye',
  ]) {
    it(`${id} has a visible non-placeholder icon`, () => {
      const pixels = generateItemIcon({ id, block: null, tool: null });
      assert(pixels instanceof Uint8Array, 'icon should be RGBA pixels');
      assert(pixels.length === 16 * 16 * 4, 'icon should be 16x16 RGBA');
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
      assert(visible >= 5, 'icon should contain visible pixels');
    });
  }
});


describe('equipment and potion icon silhouettes', () => {
  for (const slot of ['helmet', 'chestplate', 'leggings', 'boots']) {
    it(`renders a dedicated ${slot} silhouette`, () => {
      const pixels = generateItemIcon({ id: `mc:iron_${slot}`, block: null, tool: null, armorSlot: slot });
      assert(pixels instanceof Uint8Array && pixels.length === 1024, 'expected 16x16 RGBA icon');
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      assert(colors.size >= 2, 'armour should have shaded pixels');
    });
  }
  for (const id of ['mc:potion_swiftness', 'mc:potion_strength', 'mc:potion_healing', 'mc:potion_water_breathing', 'mc:water_bottle']) {
    it(`${id} renders a bottle icon`, () => {
      const pixels = generateItemIcon({ id, block: null, tool: null });
      assert(pixels instanceof Uint8Array && pixels.length === 1024, 'expected 16x16 RGBA icon');
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      assert(visible >= 20, 'bottle should be visible');
    });
  }
  for (const id of ['mc:shield', 'mc:bow', 'mc:crossbow', 'mc:trident']) {
    it(`${id} renders its own equipment shape`, () => {
      const pixels = generateItemIcon({ id, block: null, tool: null });
      assert(pixels instanceof Uint8Array && pixels.length === 1024, 'expected 16x16 RGBA icon');
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      assert(visible >= 8, 'equipment shape should be visible');
    });
  }
});


describe('3D block inventory icons and safe texture fallback', () => {
  it('resolves top and side faces without selecting the diagnostic checker', () => {
    const textureIndex = new Map([
      ['__missing', 0], ['stone', 1], ['grass_top', 2], ['dirt', 3],
    ]);
    const layers = resolveBlockItemTextureLayers(
      { textures: { top: 'grass_top', side: 'dirt', west: 'dirt', east: 'unknown_face' } },
      textureIndex,
    );
    assert(layers.top === 2, 'top face should use its own texture');
    assert(layers.left === 3, 'left face should use its own texture');
    assert(layers.right === 3, 'unknown face should use safe stone fallback');
  });

  it('uses a safe non-checker texture if every requested block face is missing', () => {
    const textureIndex = new Map([['__missing', 0], ['stone', 1]]);
    const layers = resolveBlockItemTextureLayers(
      { textures: { top: 'missing_top', side: 'missing_side' } },
      textureIndex,
    );
    assert(layers.top === 1 && layers.left === 1 && layers.right === 1,
      'all missing faces should resolve to stone');
  });
});


describe('generated fallback block textures', () => {
  it('creates distinct material-like pixels for unresolved block texture names', () => {
    const built = buildTextures(null, ['unmapped_oak_planks', 'unmapped_diamond_ore']);
    for (const name of ['unmapped_oak_planks', 'unmapped_diamond_ore']) {
      const layer = built.index.get(name);
      assert(layer !== undefined && layer !== built.index.get('__missing'),
        'every required block texture should receive its own layer');
      const start = layer * 16 * 16 * 4;
      const pixels = built.data.subarray(start, start + 16 * 16 * 4);
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      assert(colors.size > 2, 'fallback should contain textured pixel art, not a flat fill');
      assert(!pixels.every((value, index) => index % 4 === 1 ? value === 0 : true),
        'fallback must not be the magenta diagnostic checker');
    }
    assert(built.index.get('unmapped_oak_planks') !== built.index.get('unmapped_diamond_ore'),
      'different materials need separate layers');
  });
});


describe('registered vanilla texture coverage', () => {
  it('allocates a non-diagnostic texture layer for every registered block face', () => {
    const required = new Set();
    for (const state of BLOCKS.statesById) {
      const block = state.block;
      if (block.texture && block.texture !== 'none') required.add(block.texture);
      for (const name of Object.values(block.textures ?? {})) {
        if (typeof name === 'string' && name !== 'none') required.add(name);
      }
      for (const name of Object.values(block.doorTextures ?? {})) {
        if (typeof name === 'string' && name !== 'none') required.add(name);
      }
    }
    const built = buildTextures(null, [...required]);
    for (const name of required) {
      const layer = built.index.get(name);
      assert(layer !== undefined && layer !== built.index.get('__missing'),
        'missing registered texture layer: ' + name);
    }
    console.log('[asset coverage] ' + BLOCK_COUNT + ' blocks, ' + STATE_COUNT +
      ' blockstates, ' + ITEM_COUNT + ' items, ' + required.size +
      ' unique block texture keys (' + [...required].filter(name => !Object.hasOwn(TEXTURES, name)).length +
      ' with generated fallback art).');
  });
});
