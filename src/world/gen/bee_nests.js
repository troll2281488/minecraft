/**
 * Deterministic bee-nest placement for oak/birch trees.
 * The decision depends only on world seed and tree origin, never chunk order.
 */
function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function placementRoll(seed, x, z, salt) {
  let h = mix32((Number(seed) || 0) >>> 0);
  h = mix32(h ^ Math.imul(x | 0, 0x9e3779b1));
  h = mix32(h ^ Math.imul(z | 0, 0x85ebca77));
  h = mix32(h ^ salt);
  return h / 0x100000000;
}

const BEE_NEST_BIOMES = new Set([
  'mc:plains', 'mc:sunflower_plains', 'mc:flower_forest',
  'mc:forest', 'mc:birch_forest', 'mc:tall_birch_forest',
]);

export function shouldGenerateBeeNest(seed, x, z, biome, species) {
  if (!['oak', 'birch'].includes(species) || !BEE_NEST_BIOMES.has(biome)) return false;
  return placementRoll(seed, x, z, 0x424545) < 0.05;
}

export function beeNestFacing(seed, x, z) {
  return ['north', 'south', 'west', 'east'][
    Math.floor(placementRoll(seed, x, z, 0x4e455354) * 4)
  ];
}
