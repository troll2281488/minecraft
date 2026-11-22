import { describe, it, assert } from './framework.js';
import { generateItemIcon } from '../src/render/item_icons.js';

describe('expanded pixel-art item icons', () => {
  for (const id of [
    'mc:paper', 'mc:book', 'mc:enchanted_book', 'mc:ender_pearl',
    'mc:gunpowder', 'mc:name_tag', 'mc:golden_apple', 'mc:apple',
    'mc:bread', 'mc:carrot', 'mc:potato', 'mc:rotten_flesh',
    'mc:glowstone_dust', 'mc:bone_meal', 'mc:ink_sac',
    'mc:nautilus_shell', 'mc:fire_charge', 'mc:arrow',
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
