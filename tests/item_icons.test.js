import { describe, it, assert } from './framework.js';
import { generateItemIcon } from '../src/render/item_icons.js';

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
