/**
 * Inventory icons.
 *
 * Block items reuse the block's own texture, so a stack of stone looks like
 * stone with no extra art. Everything else -- tools, ingots, gems -- gets a
 * generated 16x16 icon here.
 *
 * Icons are drawn as small pixel maps rather than vector shapes because they sit
 * next to block textures at the same resolution, and a smooth icon beside a
 * 16x16 pixel texture looks conspicuously out of place.
 */

import { TILE_SIZE } from './atlas.js';

const _ = null; // transparent, and short enough to keep the maps readable

/** Tier colours. Tools differ only by the material part of the icon. */
const TIER_COLOR = {
  wooden:    ['#9c7248', '#7d5a38'],
  stone:     ['#9a9a9a', '#7a7a7a'],
  iron:      ['#dcdcdc', '#b0b0b0'],
  golden:    ['#f7d54c', '#c9ab35'],
  diamond:   ['#53e2d4', '#38b3a8'],
  netherite: ['#544c50', '#3b3438'],
};

const HANDLE = ['#6b4b2a', '#54391f'];

/**
 * Tool shapes as coordinate lists. 'M' is the material, 'H' the handle.
 * Written as explicit pixel runs rather than a 16x16 character grid: the grids
 * are unreadable at this size and every edit to one risks a silent
 * off-by-one that shifts the whole icon.
 */
const TOOL_SHAPES = {
  pickaxe: {
    M: [[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
        [2,3],[3,3],[11,3],[12,3],
        [2,4],[12,4]],
    H: [[7,4],[7,5],[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  axe: {
    M: [[4,2],[5,2],[6,2],[7,2],
        [3,3],[4,3],[5,3],[6,3],[7,3],[8,3],
        [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
        [4,5],[5,5],[6,5],[7,5],
        [5,6],[6,6]],
    H: [[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  hoe: {
    M: [[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3]],
    H: [[7,4],[7,5],[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  shovel: {
    M: [[6,2],[7,2],[8,2],
        [6,3],[7,3],[8,3],
        [6,4],[7,4],[8,4],
        [7,5]],
    H: [[7,5],[7,6],[6,7],[6,8],[5,9],[5,10],[4,11],[4,12],[3,13]],
  },
  shears: {
    M: [[4,3],[5,2],[6,2],[7,3],[8,4],[9,5],[10,6],[11,7],[12,8],[13,9],[12,10],[11,11],[10,12],[9,13], [3,4],[2,5],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13]],
    H: [[6,7],[7,8],[8,9]],
  },
  fishing_rod: {
    M: [[12,1],[11,2],[10,3],[9,4],[8,5],[7,6],[6,7]],
    H: [[6,7],[5,8],[4,9],[3,10],[2,11],[2,12],[3,13]],
  },
  sword: {
    M: [[10,2],[11,2],[12,2],
        [9,3],[10,3],[11,3],
        [8,4],[9,4],[10,4],
        [7,5],[8,5],[9,5],
        [6,6],[7,6],[8,6],
        [5,7],[6,7],[7,7],
        [4,8],[5,8],[6,8]],
    H: [[3,9],[4,9],[5,9],[2,10],[3,10],[4,10],[3,11],[4,11],[2,12],[3,12]],
  },
};

/** Rounded lumps for ingots, gems, and dusts. */
const BLOB_SHAPES = {
  ingot: [
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
    [3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],
    [3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],
    [4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],
  ],
  gem: [
    [6,3],[7,3],[8,3],[9,3],
    [5,4],[6,4],[7,4],[8,4],[9,4],[10,4],
    [4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
    [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
    [5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
    [6,9],[7,9],[8,9],[9,9],
    [7,10],[8,10],
  ],
  chunk: [
    [5,5],[6,5],[7,5],[8,5],[9,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],
    [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
    [4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
    [5,9],[6,9],[7,9],[8,9],[9,9],
    [6,10],[7,10],[8,10],
  ],
  dust: [
    [6,6],[8,5],[5,8],[9,8],[7,9],[10,6],[4,6],[7,7],[8,9],[6,10],
  ],
  stick: [
    [10,4],[9,5],[10,5],[8,6],[9,6],[7,7],[8,7],
    [6,8],[7,8],[5,9],[6,9],[4,10],[5,10],[4,11],
  ],
};

const ITEM_ICON_SPEC = {
  'mc:wheat':         { shape: 'chunk', colors: ['#d8bd50', '#a98b32'] },
  'mc:wheat_seeds':   { shape: 'dust', colors: ['#c9b35b', '#8f7938'] },
  'mc:stick':        { shape: 'stick', colors: HANDLE },
  'mc:raw_cod':      { shape: 'chunk', colors: ['#b6c8d0', '#738e9b'] },
  'mc:raw_salmon':   { shape: 'chunk', colors: ['#ed9b78', '#bd6654'] },
  'mc:pufferfish':   { shape: 'chunk', colors: ['#e7cf52', '#b68e36'] },
  'mc:tropical_fish':{ shape: 'chunk', colors: ['#e58d38', '#a84c34'] },
  'mc:string':       { shape: 'stick', colors: ['#eee6d2', '#b9ad95'] },
  'mc:bone':         { shape: 'stick', colors: ['#eee8d8', '#bdb5a2'] },
  'mc:leather':      { shape: 'chunk', colors: ['#9b633b', '#633b27'] },
  'mc:feather':      { shape: 'stick', colors: ['#eee9df', '#bdb6aa'] },
  'mc:coal':         { shape: 'chunk', colors: ['#2c2c2c', '#141414'] },
  'mc:charcoal':     { shape: 'chunk', colors: ['#3a332c', '#1e1a16'] },
  'mc:raw_iron':     { shape: 'chunk', colors: ['#d8a582', '#a97e5f'] },
  'mc:raw_copper':   { shape: 'chunk', colors: ['#d07f4a', '#a05f34'] },
  'mc:raw_gold':     { shape: 'chunk', colors: ['#f6d34a', '#c4a52f'] },
  'mc:iron_ingot':   { shape: 'ingot', colors: ['#e8e8e8', '#b4b4b4'] },
  'mc:copper_ingot': { shape: 'ingot', colors: ['#e08a52', '#ab6438'] },
  'mc:gold_ingot':   { shape: 'ingot', colors: ['#ffe14f', '#cfae2e'] },
  'mc:diamond':      { shape: 'gem',   colors: ['#5ef0e2', '#33b8ab'] },
  'mc:emerald':      { shape: 'gem',   colors: ['#3ce060', '#22a341'] },
  'mc:lapis_lazuli': { shape: 'chunk', colors: ['#3562d8', '#22409a'] },
  'mc:redstone':     { shape: 'dust',  colors: ['#e02020', '#a01414'] },
  'mc:flint':        { shape: 'chunk', colors: ['#4a4a4a', '#2c2c2c'] },
  'mc:clay_ball':    { shape: 'chunk', colors: ['#b0b4c0', '#8a8e99'] },
  'mc:paper':         { shape: 'chunk', colors: ['#f4edcf', '#cfc5a5'] },
  'mc:book':          { shape: 'chunk', colors: ['#8b3f32', '#54251f'] },
  'mc:enchanted_book':{ shape: 'chunk', colors: ['#8a5bd0', '#51318b'] },
  'mc:ender_pearl':   { shape: 'gem', colors: ['#4c9b82', '#245b50'] },
  'mc:gunpowder':     { shape: 'dust', colors: ['#55534f', '#292826'] },
  'mc:name_tag':      { shape: 'chunk', colors: ['#d5c59a', '#8b7046'] },
  'mc:golden_apple':  { shape: 'chunk', colors: ['#f7d34d', '#b47a24'] },
  'mc:apple':         { shape: 'chunk', colors: ['#cf3434', '#842020'] },
  'mc:bread':         { shape: 'chunk', colors: ['#d9a65d', '#94602e'] },
  'mc:carrot':        { shape: 'stick', colors: ['#ed8a2f', '#a84d1e'] },
  'mc:potato':        { shape: 'chunk', colors: ['#c9a36a', '#85623c'] },
  'mc:rotten_flesh':  { shape: 'chunk', colors: ['#795044', '#49302c'] },
  'mc:glowstone_dust':{ shape: 'dust', colors: ['#f4cf69', '#b27c2d'] },
  'mc:bone_meal':     { shape: 'dust', colors: ['#eee8d8', '#bdb5a2'] },
  'mc:ink_sac':       { shape: 'chunk', colors: ['#39323b', '#17151b'] },
  'mc:nautilus_shell':{ shape: 'chunk', colors: ['#e7d9bd', '#a58c6b'] },
  'mc:fire_charge':   { shape: 'gem', colors: ['#f07a2c', '#a62f1e'] },
  'mc:arrow':         { shape: 'stick', colors: ['#b7a17b', '#626262'] },
  'mc:gold_nugget':   { shape: 'gem', colors: ['#f5d34a', '#b58b27'] },
  'mc:blaze_powder':  { shape: 'dust', colors: ['#f3a52c', '#b85b1e'] },
  'mc:blaze_rod':     { shape: 'stick', colors: ['#f1b13b', '#b66b25'] },
  'mc:snowball':      { shape: 'gem', colors: ['#f5f5f5', '#c7d5df'] },
  'mc:quartz':        { shape: 'gem', colors: ['#eee8df', '#bcb4a9'] },
  'mc:slime_ball':    { shape: 'gem', colors: ['#8bd64b', '#4f9d31'] },
  'mc:honeycomb':     { shape: 'chunk', colors: ['#e9a52e', '#a96a20'] },
  'mc:glass_bottle':  { shape: 'chunk', colors: ['#9ed7d1', '#4b928e'] },
  'mc:water_bottle':  { shape: 'chunk', colors: ['#72b9e8', '#387db8'] },
  'mc:egg':           { shape: 'gem', colors: ['#eee9d9', '#b8b0a1'] },
  'mc:goat_horn':     { shape: 'stick', colors: ['#c5a878', '#79603d'] },
  'mc:compass':       { shape: 'gem', colors: ['#c9c6b9', '#a83b35'] },
  'mc:map':           { shape: 'chunk', colors: ['#d9c98d', '#8f7848'] },
  'mc:melon_slice':   { shape: 'chunk', colors: ['#e45c50', '#3e9a43'] },
  'mc:sugar':         { shape: 'dust', colors: ['#f2eee2', '#c9c2b3'] },
  'mc:beetroot':      { shape: 'chunk', colors: ['#a72c42', '#5c263b'] },
  'mc:beetroot_seeds':{ shape: 'dust', colors: ['#a95b48', '#63352d'] },
  'mc:melon_seeds':   { shape: 'dust', colors: ['#d8b56b', '#8e6b3b'] },
  'mc:pumpkin_seeds': { shape: 'dust', colors: ['#d8c28a', '#8c7043'] },
  'mc:sweet_berries': { shape: 'chunk', colors: ['#c72d48', '#731e35'] },
  'mc:golden_carrot': { shape: 'stick', colors: ['#f5c13b', '#b17b25'] },
  'mc:feather':       { shape: 'stick', colors: ['#eee9df', '#bdb6aa'] },
  'mc:rabbit_hide':   { shape: 'chunk', colors: ['#c9b99d', '#88765d'] },
  'mc:milk_bucket':   { shape: 'chunk', colors: ['#eee9dc', '#b7b1a6'] },
  'mc:bucket':        { shape: 'chunk', colors: ['#b7c4c9', '#65757d'] },
  'mc:water_bucket':  { shape: 'chunk', colors: ['#6eb8e7', '#65757d'] },
  'mc:lava_bucket':   { shape: 'chunk', colors: ['#ed702b', '#65757d'] },
  'mc:tripwire_hook': { shape: 'stick', colors: ['#b7c0c5', '#6c7378'] },
  'mc:lily_pad':      { shape: 'chunk', colors: ['#4c9b43', '#28652e'] },
  'mc:saddle':        { shape: 'chunk', colors: ['#9b5534', '#5d3026'] },
  'mc:lead':          { shape: 'stick', colors: ['#c6b28c', '#806c4d'] },
  'mc:firework_rocket':{ shape: 'stick', colors: ['#d94a42', '#8b2f45'] },
  'mc:music_disc_13': { shape: 'gem', colors: ['#34343c', '#17171d'] },
  'mc:music_disc_cat':{ shape: 'gem', colors: ['#4c7b42', '#243c27'] },
  'mc:music_disc_otherside':{ shape: 'gem', colors: ['#438b9b', '#23475e'] },
  'mc:raw_beef':      { shape: 'chunk', colors: ['#b94a43', '#71302f'] },
  'mc:cooked_beef':   { shape: 'chunk', colors: ['#8a5739', '#503020'] },
  'mc:raw_porkchop':  { shape: 'chunk', colors: ['#e99a9c', '#a85e67'] },
  'mc:cooked_porkchop':{ shape: 'chunk', colors: ['#a96b4d', '#70402e'] },
  'mc:raw_chicken':   { shape: 'chunk', colors: ['#e5c7a1', '#aa8764'] },
  'mc:cooked_chicken':{ shape: 'chunk', colors: ['#d99b4c', '#95602e'] },
  'mc:baked_potato':  { shape: 'chunk', colors: ['#d5a75e', '#91602f'] },
  'mc:raw_mutton':    { shape: 'chunk', colors: ['#c77b78', '#80494d'] },
  'mc:raw_rabbit':    { shape: 'chunk', colors: ['#c9a18a', '#886755'] },
  'mc:cooked_rabbit': { shape: 'chunk', colors: ['#b77c52', '#70462e'] },
  'mc:cooked_mutton': { shape: 'chunk', colors: ['#a96b4d', '#70402e'] },
  'mc:cooked_cod':    { shape: 'chunk', colors: ['#d7b17a', '#987344'] },
  'mc:cooked_salmon': { shape: 'chunk', colors: ['#e18b64', '#a95642'] },
  'mc:pufferfish':    { shape: 'chunk', colors: ['#e7cf52', '#b68e36'] },
  'mc:tropical_fish': { shape: 'chunk', colors: ['#e58d38', '#a84c34'] },
  'mc:mushroom_stew': { shape: 'chunk', colors: ['#a56b43', '#60402e'] },
  'mc:beetroot_soup': { shape: 'chunk', colors: ['#a33b48', '#602634'] },
  'mc:rabbit_stew':   { shape: 'chunk', colors: ['#b27a4d', '#6e482f'] },
  'mc:honey_bottle':  { shape: 'chunk', colors: ['#e8a52d', '#a96820'] },
  'mc:bowl':          { shape: 'chunk', colors: ['#9b7048', '#5e422c'] },
  'mc:white_dye':     { shape: 'dust', colors: ['#eee9df', '#bdb6aa'] },
  'mc:orange_dye':    { shape: 'dust', colors: ['#ed8b32', '#a95022'] },
  'mc:magenta_dye':   { shape: 'dust', colors: ['#d65ab3', '#87346f'] },
  'mc:light_blue_dye':{ shape: 'dust', colors: ['#6eb9df', '#3e789b'] },
  'mc:yellow_dye':    { shape: 'dust', colors: ['#f2d84b', '#a88b28'] },
  'mc:lime_dye':      { shape: 'dust', colors: ['#91d83e', '#57952a'] },
  'mc:pink_dye':      { shape: 'dust', colors: ['#e9a0b8', '#a75f7c'] },
  'mc:gray_dye':      { shape: 'dust', colors: ['#777777', '#454545'] },
  'mc:light_gray_dye':{ shape: 'dust', colors: ['#b9b9b9', '#777777'] },
  'mc:cyan_dye':      { shape: 'dust', colors: ['#399c9a', '#236565'] },
  'mc:purple_dye':    { shape: 'dust', colors: ['#9856c9', '#583080'] },
  'mc:blue_dye':      { shape: 'dust', colors: ['#456bd1', '#293f86'] },
  'mc:brown_dye':     { shape: 'dust', colors: ['#8b5b38', '#533522'] },
  'mc:green_dye':     { shape: 'dust', colors: ['#4b9b3c', '#2b5d28'] },
  'mc:red_dye':       { shape: 'dust', colors: ['#d63a38', '#852322'] },
  'mc:black_dye':     { shape: 'dust', colors: ['#353238', '#18171b'] },
};

function blankIcon() {
  return new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
}

function parseHex(color) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function plot(icon, points, color, shadow) {
  const [r, g, b] = parseHex(color);
  const [sr, sg, sb] = parseHex(shadow);
  for (const [x, y] of points) {
    if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) continue;
    const i = (y * TILE_SIZE + x) * 4;
    // The bottom-right of each run is shaded, which is what gives a flat pixel
    // shape the suggestion of volume.
    const shaded = (x + y) % 3 === 2;
    icon[i] = shaded ? sr : r;
    icon[i + 1] = shaded ? sg : g;
    icon[i + 2] = shaded ? sb : b;
    icon[i + 3] = 255;
  }
}

/** Generate the icon for one item, or null if it should use its block texture. */
export function generateItemIcon(item) {
  if (item.block) return null; // block items render their block texture instead

  const icon = blankIcon();

  if (item.spawnEggMob) {
    const colors = {
      cow: ['#6a4a32','#f1eee5'], pig: ['#e9a0a5','#f5c4c4'],
      sheep: ['#ddd9ce','#f7f4e9'], chicken: ['#f0e6c8','#d6b56c'],
      zombie: ['#477d55','#315b3e'], skeleton: ['#d7d4c8','#8e8b83'],
      stray: ['#b7d4d5','#6c9da4'], creeper: ['#4f9b42','#2d692d'],
      enderman: ['#25202e','#8d58c7'], spider: ['#44302a','#171313'],
      cave_spider: ['#397e70','#182d2a'],
      wolf: ['#aaa69b','#dedbd1'], horse: ['#8b5b35','#d4b48a'],
      rabbit: ['#a77b55','#e2d1b6'], polar_bear: ['#eeeae1','#b7b1a6'],
      mooshroom: ['#b84a42','#eee4d6'], bat: ['#51434a','#b49a8e'],
      blaze: ['#e9a33a','#ffe16a'], ghast: ['#eee9e5','#d5c7c7'],
      guardian: ['#b67b39','#f0c36c'], elder_guardian: ['#9b8d64','#d4c18b'],
      endermite: ['#79528c','#c39ad0'], magma_cube: ['#a43c2d','#f18a35'],
      ocelot: ['#d7b76b','#463a2b'], parrot: ['#d84a36','#36a4a1'],
      shulker: ['#9169a9','#d4b6dc'], silverfish: ['#777777','#b5b5b5'],
      slime: ['#76b83f','#b0e36b'], snow_golem: ['#eee9df','#d47b32'],
      squid: ['#6e496c','#b38cae'], vex: ['#b9c8d0','#e9edf0'],
      witch: ['#4d5b48','#9a7b9d'], wither: ['#333333','#777777'],
      wither_skeleton: ['#353535','#777777'], zombie_villager: ['#477d55','#8b6b4d'],
      husk: ['#b49b6a','#6e583c'], donkey: ['#77736b','#b7b0a2'],
      mule: ['#6b6259','#b5a99a'], skeleton_horse: ['#d7d4c8','#8e8b83'],
      zombie_horse: ['#477d55','#315b3e'], llama: ['#c5a47d','#7a5940'],
      villager: ['#a77b55','#d0b28a'], bee: ['#e6b52d','#3d3022'],
      vindicator: ['#8a8d87','#c2c3bb'], evoker: ['#6f6b78','#b9b5ad'],
    };
    const [shell, spot] = colors[item.spawnEggMob] ?? ['#ded6c8','#8c8c8c'];
    const shellPixels = [];
    const spotPixels = [];
    for (let y = 3; y <= 13; y++) for (let x = 4; x <= 11; x++) {
      const nx = (x - 7.5) / 4, ny = (y - 8) / 5.5;
      if (nx * nx + ny * ny <= 1) shellPixels.push([x, y]);
    }
    for (const [x, y] of [[6,5],[7,5],[8,5],[7,6],[8,6],[9,6],[6,7],[7,7],[8,7]]) spotPixels.push([x,y]);
    plot(icon, shellPixels, shell, '#b8b0a3');
    plot(icon, spotPixels, spot, '#38302a');
    return icon;
  }

  if (item.id === 'mc:fishing_rod') {
    const icon = blankIcon();
    plot(icon, TOOL_SHAPES.fishing_rod.M, '#b7a17b', '#826b4c');
    plot(icon, TOOL_SHAPES.fishing_rod.H, HANDLE[0], HANDLE[1]);
    return icon;
  }

  // Armour silhouettes are drawn separately from generic materials so every
  // equipment slot reads clearly at the game's native 16px inventory scale.
  if (item.armorSlot) {
    const material = item.id.split(':')[1].split('_')[0];
    const palette = {
      leather: ['#9b633b', '#633b27'], chainmail: ['#b5bdc2', '#737d84'],
      iron: ['#d9dfe2', '#929da4'], golden: ['#f2cf45', '#a77c20'],
      diamond: ['#55d8cc', '#278e87'], netherite: ['#62575b', '#342d32'],
    }[material] ?? ['#a9adb0', '#666b70'];
    const shapes = {
      helmet: [[5,3],[6,2],[7,2],[8,2],[9,2],[10,3],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[4,5],[11,5],[5,6],[10,6]],
      chestplate: [[4,3],[5,2],[6,2],[9,2],[10,2],[11,3],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7]],
      leggings: [[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[4,3],[5,3],[6,3],[9,3],[10,3],[11,3],[5,4],[6,4],[9,4],[10,4],[5,5],[6,5],[9,5],[10,5],[5,6],[6,6],[9,6],[10,6],[5,7],[6,7],[9,7],[10,7],[5,8],[6,8],[9,8],[10,8],[5,9],[6,9],[9,9],[10,9]],
      boots: [[4,8],[5,8],[6,8],[4,9],[5,9],[6,9],[4,10],[5,10],[6,10],[9,8],[10,8],[11,8],[9,9],[10,9],[11,9],[9,10],[10,10],[11,10]],
    };
    plot(icon, shapes[item.armorSlot] ?? shapes.chestplate, palette[0], palette[1]);
    return icon;
  }

  if (item.id.startsWith('mc:potion_') || item.id === 'mc:water_bottle') {
    const potionColors = {
      swiftness: '#65b9ee', strength: '#d34b36', regeneration: '#d68ac7',
      fire_resistance: '#ee8a32', healing: '#ed5c91', poison: '#75a83d',
      water_breathing: '#4d9bc4', slow_falling: '#d9c6ee', leaping: '#8bce54',
      weakness: '#777c84',
    };
    const potion = item.id.split('_').slice(1).join('_');
    const liquid = item.id === 'mc:water_bottle' ? '#55a9e0' : (potionColors[potion] ?? '#8c65bd');
    const bottle = [];
    for (let y = 6; y <= 13; y++) {
      for (let x = 5; x <= 10; x++) {
        if ((y >= 8 && x >= 5 && x <= 10) || (y >= 6 && y <= 7 && x >= 6 && x <= 9)) bottle.push([x,y]);
      }
    }
    plot(icon, bottle, liquid, '#315d8a');
    plot(icon, [[6,3],[7,3],[8,3],[9,3],[6,4],[7,4],[8,4],[9,4],[7,5],[8,5]], '#d9e5e7', '#84969b');
    return icon;
  }

  if (item.id === 'mc:shield') {
    const shield = [[6,2],[7,2],[8,2],[9,2],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[6,6],[7,6],[8,6],[9,6],[7,7],[8,7]];
    plot(icon, shield, '#a8794c', '#63432d');
    plot(icon, [[7,3],[8,3],[7,4],[8,4],[7,5],[8,5]], '#c6cbd0', '#7b858d');
    return icon;
  }

  if (item.id === 'mc:bow' || item.id === 'mc:crossbow') {
    const bow = [[10,2],[9,3],[8,4],[7,5],[6,6],[6,7],[7,8],[8,9],[9,10],[10,11],[10,12]];
    plot(icon, bow, '#9c7045', '#5d3d27');
    plot(icon, [[5,5],[5,6],[5,7],[5,8],[5,9]], '#d7d0bf', '#8e887b');
    if (item.id === 'mc:crossbow') plot(icon, [[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6]], '#aeb7bc', '#626e76');
    return icon;
  }

  if (item.id === 'mc:trident') {
    plot(icon, [[8,3],[7,4],[8,4],[9,4],[8,5],[8,6],[8,7],[8,8],[8,9],[8,10],[8,11],[8,12],[8,13]], '#82c6c4', '#3b7f82');
    return icon;
  }
  if (item.tool === 'shears') {
    plot(icon, TOOL_SHAPES.shears.M, '#c9d0d6', '#858e98');
    plot(icon, TOOL_SHAPES.shears.H, '#b7a17b', '#826b4c');
    return icon;
  }
  if (item.tool && TOOL_SHAPES[item.tool]) {
    const prefix = item.id.slice('mc:'.length).split('_')[0];
    const colors = TIER_COLOR[prefix] ?? TIER_COLOR.stone;
    const shape = TOOL_SHAPES[item.tool];
    plot(icon, shape.H, HANDLE[0], HANDLE[1]);
    plot(icon, shape.M, colors[0], colors[1]);
    return icon;
  }

  const spec = ITEM_ICON_SPEC[item.id];
  if (spec) {
    plot(icon, BLOB_SHAPES[spec.shape], spec.colors[0], spec.colors[1]);
    return icon;
  }

  // Unrecognized item: a neutral square, so it is visible and obviously
  // placeholder rather than an invisible slot the player cannot reason about.
  const points = [];
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) points.push([x, y]);
  plot(icon, points, '#b060c0', '#7a3e85');
  return icon;
}

/**
 * Turn raw RGBA pixels into a canvas that can be drawn or used as a CSS
 * background. Scaled up with smoothing disabled to keep the pixels sharp.
 */
export function iconToCanvas(pixels, scale = 2) {
  const source = document.createElement('canvas');
  source.width = TILE_SIZE;
  source.height = TILE_SIZE;
  const sctx = source.getContext('2d');
  const image = sctx.createImageData(TILE_SIZE, TILE_SIZE);
  image.data.set(pixels);
  sctx.putImageData(image, 0, 0);

  if (scale === 1) return source;

  const scaled = document.createElement('canvas');
  scaled.width = TILE_SIZE * scale;
  scaled.height = TILE_SIZE * scale;
  const ctx = scaled.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/**
 * Build a data-URL icon for every registered item.
 *
 * Done once at startup and cached: the inventory redraws whenever a slot
 * changes, and regenerating icons on each redraw would be visibly slow with a
 * full inventory open.
 */
export function buildItemIconCache(items, blocks, textureData, textureIndex, externalItemIcons = null) {
  const cache = new Map();

  for (const item of items.items.values()) {
    const external = externalItemIcons?.get(item.id);
    if (external) {
      cache.set(item.id, external);
      continue;
    }
    let pixels = generateItemIcon(item);

    if (!pixels) {
      // Block item: lift the block's top-face texture straight out of the
      // generated texture array.
      const block = blocks.get(item.block);
      const name = block?.textures?.top ?? block?.textures?.side ?? block?.texture;
      const layer = textureIndex.get(name) ?? textureIndex.get('__missing');
      const offset = layer * TILE_SIZE * TILE_SIZE * 4;
      pixels = textureData.subarray(offset, offset + TILE_SIZE * TILE_SIZE * 4);
    }

    cache.set(item.id, iconToCanvas(pixels, 2).toDataURL());
  }

  return cache;
}

export { TOOL_SHAPES, BLOB_SHAPES };
