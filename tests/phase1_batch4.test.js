import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { ItemStack } from '../src/world/item.js';
import { generateItemIcon } from '../src/render/item_icons.js';
import { scoopFluid, emptyBucket } from '../src/game/bucket.js';
import { drawPower, canFire, FULL_DRAW_TICKS } from '../src/game/bow.js';
import { equipArmor, armorSlotIndex } from '../src/game/armor_slots.js';
import { SL_OT } from '../src/game/inventory.js';
