/**
 * Seeded pseudo-random number generation.
 *
 * Uses xoroshiro128++, the same generator Minecraft moved to in 1.18. Matching
 * the algorithm matters because world generation must be reproducible from a
 * seed forever -- a save stores its seed, not its terrain, for every chunk the
 * player has not visited yet. Change the generator and every unexplored chunk
 * in every existing world changes with it.
 *
 * IMPLEMENTATION NOTE
 *
 * JavaScript has no 64-bit integer type, and BigInt is roughly two orders of
 * magnitude too slow for a generator called millions of times during terrain
 * generation. So the hot path here represents each 64-bit word as a pair of
 * Uint32s and does the carry arithmetic by hand.
 *
 * That is error-prone code, so it is verified rather than trusted: the test
 * suite recomputes every primitive below with BigInt -- obviously correct, just
 * slow -- and asserts the fast path agrees, across thousands of random inputs
 * and every edge case (zero shifts, 32-bit boundaries, sign-bit wraparound).
 * This is a genuine check rather than the implementation testing itself,
 * because BigInt is an independent source of truth.
 *
 * Seeding uses BigInt directly. It runs once per generator, so its cost is
 * irrelevant and correctness is easier to see.
 */

// ---------------------------------------------------------------------------
// 64-bit primitives on [hi, lo] Uint32 pairs
//
// Exported solely so the test suite can verify them against BigInt.
// ---------------------------------------------------------------------------

/** Returns [hi, lo] of a + b. */
export function add64(ah, al, bh, bl) {
  const lo = (al + bl) >>> 0;
  // Unsigned wraparound is the carry: the sum is smaller than an addend only
  // if it overflowed 32 bits.
  const carry = lo < (al >>> 0) ? 1 : 0;
  const hi = (ah + bh + carry) >>> 0;
  return [hi, lo];
}

/** Returns [hi, lo] of a ^ b. */
export function xor64(ah, al, bh, bl) {
  return [(ah ^ bh) >>> 0, (al ^ bl) >>> 0];
}

/** Returns [hi, lo] of value << n, for 0 <= n < 64. */
export function shl64(h, l, n) {
  if (n === 0) return [h >>> 0, l >>> 0];
  if (n >= 64) return [0, 0];
  if (n >= 32) return [(l << (n - 32)) >>> 0, 0];
  // The >>> (32 - n) below is why n === 0 is special-cased: x >>> 32 is x >>> 0
  // in JavaScript, not 0, which would corrupt the high word.
  return [((h << n) | (l >>> (32 - n))) >>> 0, (l << n) >>> 0];
}

/** Returns [hi, lo] of value rotated left by n, for 0 <= n < 64. */
export function rotl64(h, l, n) {
  n &= 63;
  if (n === 0) return [h >>> 0, l >>> 0];
  if (n === 32) return [l >>> 0, h >>> 0];
  if (n > 32) {
    // Rotating by more than a word is a word swap plus a smaller rotation.
    const m = n - 32;
    return [((l << m) | (h >>> (32 - m))) >>> 0, ((h << m) | (l >>> (32 - m))) >>> 0];
  }
  return [((h << n) | (l >>> (32 - n))) >>> 0, ((l << n) | (h >>> (32 - n))) >>> 0];
}

// ---------------------------------------------------------------------------
// Seeding (BigInt -- runs once, correctness over speed)
// ---------------------------------------------------------------------------

const MASK64 = (1n << 64n) - 1n;
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;

/**
 * splitmix64. Used to expand a single seed into well-distributed generator
 * state. Without it, adjacent seeds (1, 2, 3) produce visibly correlated
 * worlds -- a real problem, since players pick small round-numbered seeds.
 */
function splitmix64(state) {
  let z = (state + GOLDEN_GAMMA) & MASK64;
  const next = z;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  z = z ^ (z >> 31n);
  return [z, next];
}

function toWords(big) {
  return [Number((big >> 32n) & 0xffffffffn) >>> 0, Number(big & 0xffffffffn) >>> 0];
}

/** Accepts a number, bigint, or string seed. Strings are hashed, as in vanilla. */
export function normalizeSeed(seed) {
  if (typeof seed === 'bigint') return seed & MASK64;
  if (typeof seed === 'number') return BigInt(Math.floor(seed)) & MASK64;
  if (typeof seed === 'string') {
    const trimmed = seed.trim();
    if (trimmed === '') return 0n;
    // A numeric string is used literally, so "12345" is the seed 12345 -- this
    // is what players expect when sharing seeds.
    if (/^-?\d+$/.test(trimmed)) return BigInt(trimmed) & MASK64;
    // Otherwise hash it. Java's String.hashCode, matching vanilla behavior so
    // that a named seed produces the same world it would in Minecraft.
    let h = 0;
    for (let i = 0; i < trimmed.length; i++) {
      h = (Math.imul(31, h) + trimmed.charCodeAt(i)) | 0;
    }
    return BigInt(h) & MASK64;
  }
  return 0n;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class Random {
  /** @param {number|bigint|string} seed */
  constructor(seed = 0) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    let state = normalizeSeed(seed);
    let a, b;
    [a, state] = splitmix64(state);
    [b, state] = splitmix64(state);

    [this.s0h, this.s0l] = toWords(a);
    [this.s1h, this.s1l] = toWords(b);

    // All-zero state is a fixed point that emits nothing but zeroes forever.
    if ((this.s0h | this.s0l | this.s1h | this.s1l) === 0) {
      this.s0h = 0x9e3779b9;
      this.s0l = 0x7f4a7c15;
      this.s1h = 0x6a09e667;
      this.s1l = 0xf3bcc909;
    }
    return this;
  }

  /** Raw 64-bit output as [hi, lo]. */
  nextBits() {
    const s0h = this.s0h, s0l = this.s0l;
    let s1h = this.s1h, s1l = this.s1l;

    // result = rotl(s0 + s1, 17) + s0
    const [sumh, suml] = add64(s0h, s0l, s1h, s1l);
    const [roth, rotl_] = rotl64(sumh, suml, 17);
    const [resh, resl] = add64(roth, rotl_, s0h, s0l);

    // s1 ^= s0
    [s1h, s1l] = xor64(s1h, s1l, s0h, s0l);

    // s[0] = rotl(s0, 49) ^ s1 ^ (s1 << 21)
    const [r49h, r49l] = rotl64(s0h, s0l, 49);
    const [sh21h, sh21l] = shl64(s1h, s1l, 21);
    let [n0h, n0l] = xor64(r49h, r49l, s1h, s1l);
    [n0h, n0l] = xor64(n0h, n0l, sh21h, sh21l);

    // s[1] = rotl(s1, 28)
    const [n1h, n1l] = rotl64(s1h, s1l, 28);

    this.s0h = n0h; this.s0l = n0l;
    this.s1h = n1h; this.s1l = n1l;

    return [resh, resl];
  }

  /** Uniform 32-bit unsigned integer. */
  nextUint32() {
    return this.nextBits()[0];
  }

  /** Uniform integer in [0, bound). Rejection-sampled to avoid modulo bias. */
  nextInt(bound) {
    if (bound <= 0) throw new RangeError(`bound must be positive, got ${bound}`);
    // Power of two needs no rejection -- masking is already uniform.
    if ((bound & (bound - 1)) === 0) {
      return (this.nextUint32() & (bound - 1)) >>> 0;
    }
    // Otherwise discard values in the final partial bucket, which would
    // otherwise make low results very slightly more likely.
    const limit = Math.floor(0x100000000 / bound) * bound;
    let value;
    do {
      value = this.nextUint32();
    } while (value >= limit);
    return value % bound;
  }

  /** Uniform integer in [min, max]. */
  nextIntRange(min, max) {
    return min + this.nextInt(max - min + 1);
  }

  /** Uniform float in [0, 1). */
  nextFloat() {
    return this.nextUint32() / 0x100000000;
  }

  /** Uniform double in [0, 1) using 53 bits of entropy. */
  nextDouble() {
    const [hi, lo] = this.nextBits();
    // 53-bit mantissa: 26 bits from one word, 27 from the other.
    return ((hi >>> 6) * 0x8000000 + (lo >>> 5)) / 0x20000000000000;
  }

  nextBoolean() {
    return (this.nextUint32() & 1) === 1;
  }

  /** Normally distributed value, mean 0, stddev 1 (Box-Muller). */
  nextGaussian() {
    if (this._spare !== undefined) {
      const v = this._spare;
      this._spare = undefined;
      return v;
    }
    let u, v, s;
    do {
      u = this.nextDouble() * 2 - 1;
      v = this.nextDouble() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * mul;
    return u * mul;
  }

  /**
   * A generator derived from this one plus a label. Used to give each feature
   * type its own independent stream, so that adding a new feature in a later
   * version does not shift the random sequence every existing feature draws
   * from -- which would silently change terrain in worlds already created.
   */
  fork(label) {
    let h = 0n;
    for (let i = 0; i < label.length; i++) {
      h = (h * 31n + BigInt(label.charCodeAt(i))) & MASK64;
    }
    const mixed =
      ((BigInt(this.s0h) << 32n) | BigInt(this.s0l)) ^
      ((BigInt(this.s1h) << 32n) | BigInt(this.s1l)) ^
      h;
    return new Random(mixed & MASK64);
  }
}

/**
 * A generator seeded deterministically from a world seed and a block position.
 *
 * Position-derived seeding is what lets chunks generate in any order and still
 * produce identical results -- a hard requirement when generation is spread
 * across a worker pool and chunks complete out of order.
 */
export function positionalRandom(worldSeed, x, y, z, salt = 0) {
  const s = normalizeSeed(worldSeed);
  const mix =
    (s ^
      (BigInt(x | 0) * 0x2fc20f7d1n) ^
      (BigInt(y | 0) * 0x6f4f7a19n) ^
      (BigInt(z | 0) * 0x1b873593n) ^
      (BigInt(salt | 0) * 0x9e3779b1n)) &
    MASK64;
  return new Random(mix);
}

/** Non-deterministic seed for "random seed" in the world creation screen. */
export function randomSeed() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return (BigInt(buf[0]) << 32n) | BigInt(buf[1]);
}
