/**
 * Fast deterministic positional hash from the world-generation archive.
 * Used for per-column feature rolls without allocating a PRNG.
 */
export function seedToInt(seed) {
  const big = typeof seed === 'bigint' ? seed : BigInt(Math.floor(seed));
  return Number(big & 0xffffffffn) | 0;
}

export function hash01(seedInt, x, y, z, salt) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^
    Math.imul(z | 0, 668265263) ^ Math.imul(salt | 0, 362437) ^
    Math.imul(seedInt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
