/**
 * Perlin noise, seeded and octaved.
 *
 * Terrain generation calls this millions of times per world, so the hot paths
 * avoid allocation entirely -- no vectors, no objects, no closures per sample.
 * That is why the gradient tables are flat typed arrays and the interpolation is
 * written out longhand rather than factored into helpers.
 *
 * Classic Perlin rather than simplex: simplex is faster in higher dimensions,
 * but in 2D and 3D the difference is small, and Perlin's axis-aligned artifacts
 * are actually part of what Minecraft terrain looks like. Matching the feel
 * matters more here than shaving a few percent.
 */

import { Random } from '../../core/rng.js';
import { fade, lerp } from '../../core/math.js';

/**
 * The 12 gradient directions of classic 3D Perlin -- the edge midpoints of a
 * cube. Using a fixed small set rather than random unit vectors is what keeps
 * the dot products cheap and the output well-conditioned.
 */
const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export class PerlinNoise {
  constructor(seed) {
    const random = seed instanceof Random ? seed : new Random(seed);

    // Permutation table, doubled so lookups can index without wrapping.
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates. Biased shuffles show up as visible repeating structure in
    // the terrain, which is exactly the kind of bug that is obvious in a
    // screenshot and invisible in a unit test.
    for (let i = 255; i > 0; i--) {
      const j = random.nextInt(i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];

    // Random offset so two noise instances from related seeds do not line up
    // at the origin.
    this.ox = random.nextDouble() * 256;
    this.oy = random.nextDouble() * 256;
    this.oz = random.nextDouble() * 256;
  }

  /** 3D Perlin noise, roughly in [-1, 1]. */
  sample3(x, y, z) {
    x += this.ox; y += this.oy; z += this.oz;

    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const perm = this.perm;
    const a = perm[xi] + yi;
    const aa = perm[a] + zi;
    const ab = perm[a + 1] + zi;
    const b = perm[xi + 1] + yi;
    const ba = perm[b] + zi;
    const bb = perm[b + 1] + zi;

    return lerp(w,
      lerp(v,
        lerp(u, grad3(perm[aa], xf, yf, zf), grad3(perm[ba], xf - 1, yf, zf)),
        lerp(u, grad3(perm[ab], xf, yf - 1, zf), grad3(perm[bb], xf - 1, yf - 1, zf))),
      lerp(v,
        lerp(u, grad3(perm[aa + 1], xf, yf, zf - 1), grad3(perm[ba + 1], xf - 1, yf, zf - 1)),
        lerp(u, grad3(perm[ab + 1], xf, yf - 1, zf - 1), grad3(perm[bb + 1], xf - 1, yf - 1, zf - 1))));
  }

  /** 2D noise. Implemented as 3D at a fixed z rather than duplicated. */
  sample2(x, z) {
    return this.sample3(x, 0.5, z);
  }
}

function grad3(hash, x, y, z) {
  const h = (hash % 12) * 3;
  return GRAD3[h] * x + GRAD3[h + 1] * y + GRAD3[h + 2] * z;
}

/**
 * Several octaves of Perlin summed at halving amplitude and doubling frequency.
 *
 * One octave is smooth rolling hills and reads as obviously artificial. Summing
 * octaves is what produces detail at every scale -- mountains with ridges with
 * bumps -- and is the difference between terrain that looks generated and
 * terrain that looks eroded.
 */
export class OctaveNoise {
  constructor(seed, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    const random = seed instanceof Random ? seed : new Random(seed);
    this.layers = [];
    for (let i = 0; i < octaves; i++) {
      this.layers.push(new PerlinNoise(random.fork(`octave_${i}`)));
    }
    this.persistence = persistence;
    this.lacunarity = lacunarity;

    // Precomputed so output can be normalized to [-1, 1] regardless of how many
    // octaves are used.
    let max = 0;
    let amplitude = 1;
    for (let i = 0; i < octaves; i++) {
      max += amplitude;
      amplitude *= persistence;
    }
    this.normalization = 1 / max;
  }

  sample2(x, z, scale = 1) {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    for (const layer of this.layers) {
      total += layer.sample2(x * frequency, z * frequency) * amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return total * this.normalization;
  }

  sample3(x, y, z, scale = 1) {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    for (const layer of this.layers) {
      total += layer.sample3(x * frequency, y * frequency, z * frequency) * amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return total * this.normalization;
  }

  /**
   * Ridged noise: folds the output so zero-crossings become sharp ridges.
   * This is what makes mountain ranges rather than lumps.
   */
  ridged2(x, z, scale = 1) {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    for (const layer of this.layers) {
      const v = 1 - Math.abs(layer.sample2(x * frequency, z * frequency));
      total += v * v * amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return total * this.normalization;
  }
}
