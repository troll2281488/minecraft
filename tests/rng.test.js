import { describe, it, assert, assertEqual } from './framework.js';
import {
  Random, add64, xor64, shl64, rotl64, normalizeSeed, positionalRandom,
} from '../src/core/rng.js';

const MASK64 = (1n << 64n) - 1n;

const toBig = (h, l) => ((BigInt(h >>> 0) << 32n) | BigInt(l >>> 0)) & MASK64;
const fromBig = (b) => [
  Number((b >> 32n) & 0xffffffffn) >>> 0,
  Number(b & 0xffffffffn) >>> 0,
];

/**
 * Deterministic input generator for the fuzz cases.
 *
 * Deliberately NOT Math.random: a fuzz failure that cannot be reproduced is
 * nearly useless, and a fixed sequence means a failure reported today is the
 * same failure tomorrow.
 */
function* testInputs(count) {
  // Edge cases first -- these are where hand-written carry and shift logic
  // actually breaks. Random 64-bit values almost never hit a zero half or an
  // exact word boundary.
  const edges = [
    0n,
    1n,
    0xffffffffn,                  // low word full
    0x100000000n,                 // low word empty, high word 1
    0xffffffff00000000n,          // high word full
    0xffffffffffffffffn,          // all bits
    0x8000000000000000n,          // high sign bit
    0x0000000080000000n,          // low sign bit -- trips >> vs >>>
    0x8000000080000000n,          // both sign bits
    0x123456789abcdef0n,
    0xfedcba9876543210n,
  ];
  for (const e of edges) yield e;

  let state = 0x9e3779b97f4a7c15n;
  for (let i = edges.length; i < count; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & MASK64;
    yield state;
  }
}

describe('rng: 64-bit primitives verified against BigInt', () => {
  // These four tests are the reason the fast path can be trusted at all. The
  // implementation splits every 64-bit word into two Uint32s and does carries
  // by hand, which is exactly the kind of code that looks right and is not.
  // BigInt is an independent, obviously-correct oracle.

  it('add64 matches BigInt addition for 400 inputs including all edge cases', () => {
    const values = [...testInputs(20)];
    let checked = 0;
    for (const a of values) {
      for (const b of values) {
        const [ah, al] = fromBig(a);
        const [bh, bl] = fromBig(b);
        const [rh, rl] = add64(ah, al, bh, bl);
        const expected = (a + b) & MASK64;
        assertEqual(
          toBig(rh, rl), expected,
          `add64(0x${a.toString(16)}, 0x${b.toString(16)})`,
        );
        checked++;
      }
    }
    assert(checked === 400, `expected 400 combinations, checked ${checked}`);
  });

  it('xor64 matches BigInt xor', () => {
    const values = [...testInputs(20)];
    for (const a of values) {
      for (const b of values) {
        const [ah, al] = fromBig(a);
        const [bh, bl] = fromBig(b);
        const [rh, rl] = xor64(ah, al, bh, bl);
        assertEqual(toBig(rh, rl), (a ^ b) & MASK64, `xor64(0x${a.toString(16)}, 0x${b.toString(16)})`);
      }
    }
  });

  it('shl64 matches BigInt shift for every shift amount 0..63', () => {
    for (const v of testInputs(40)) {
      const [h, l] = fromBig(v);
      for (let n = 0; n < 64; n++) {
        const [rh, rl] = shl64(h, l, n);
        assertEqual(
          toBig(rh, rl), (v << BigInt(n)) & MASK64,
          `shl64(0x${v.toString(16)}, ${n})`,
        );
      }
    }
  });

  it('rotl64 matches BigInt rotation for every rotation amount 0..63', () => {
    for (const v of testInputs(40)) {
      const [h, l] = fromBig(v);
      for (let n = 0; n < 64; n++) {
        const [rh, rl] = rotl64(h, l, n);
        const big = n === 0
          ? v
          : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK64;
        assertEqual(toBig(rh, rl), big, `rotl64(0x${v.toString(16)}, ${n})`);
      }
    }
  });

  it('shl64 by 0 does not corrupt the high word', () => {
    // JavaScript evaluates `x >>> 32` as `x >>> 0`, not 0. A naive shl64 that
    // computes `(l >>> (32 - n))` returns the whole low word instead of nothing
    // when n is 0, ORing it into the high word. Called out separately because
    // it is the single most likely bug in this file.
    const [h, l] = fromBig(0x00000000ffffffffn);
    assertEqual(toBig(...shl64(h, l, 0)), 0x00000000ffffffffn);
  });
});

describe('rng: generator behavior', () => {
  it('is deterministic for a given seed', () => {
    const a = new Random(12345);
    const b = new Random(12345);
    for (let i = 0; i < 500; i++) {
      assertEqual(a.nextUint32(), b.nextUint32(), `divergence at draw ${i}`);
    }
  });

  it('produces different streams for different seeds', () => {
    const a = new Random(1);
    const b = new Random(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.nextUint32() === b.nextUint32()) same++;
    }
    // Adjacent seeds producing correlated worlds is a real, visible bug, and
    // the reason seeding runs through splitmix64 rather than using the seed
    // directly as state.
    assert(same < 5, `seeds 1 and 2 produced ${same}/100 identical draws`);
  });

  it('never returns the all-zero fixed point', () => {
    // xoroshiro's all-zero state emits zeroes forever. Seed 0 is the single
    // most likely seed a player types.
    const r = new Random(0);
    let nonZero = 0;
    for (let i = 0; i < 100; i++) if (r.nextUint32() !== 0) nonZero++;
    assert(nonZero > 90, `seed 0 produced ${100 - nonZero}/100 zeroes`);
  });

  it('nextInt respects its bound and covers the range', () => {
    const r = new Random(99);
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const v = r.nextInt(7);
      assert(v >= 0 && v < 7, `nextInt(7) returned ${v}`);
      seen.add(v);
    }
    assertEqual(seen.size, 7, 'not every value in [0,7) was produced');
  });

  it('nextInt is not visibly biased for a non-power-of-two bound', () => {
    // Bound 3 over 2^32 is the classic modulo-bias case: without rejection
    // sampling, 0 and 1 come up measurably more often than 2.
    const r = new Random(4242);
    const counts = [0, 0, 0];
    const draws = 60000;
    for (let i = 0; i < draws; i++) counts[r.nextInt(3)]++;
    const expected = draws / 3;
    for (let i = 0; i < 3; i++) {
      const deviation = Math.abs(counts[i] - expected) / expected;
      assert(deviation < 0.05, `value ${i} deviated ${(deviation * 100).toFixed(1)}% from uniform`);
    }
  });

  it('nextDouble stays in [0, 1)', () => {
    const r = new Random(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.nextDouble();
      assert(v >= 0 && v < 1, `nextDouble returned ${v}`);
    }
  });

  it('powers of two take the mask path and remain uniform', () => {
    const r = new Random(31337);
    const counts = new Array(8).fill(0);
    for (let i = 0; i < 24000; i++) counts[r.nextInt(8)]++;
    for (let i = 0; i < 8; i++) {
      assert(Math.abs(counts[i] - 3000) / 3000 < 0.08, `bucket ${i} = ${counts[i]}`);
    }
  });
});

describe('rng: seeding', () => {
  it('numeric strings are used literally, as players expect', () => {
    assertEqual(normalizeSeed('12345'), 12345n);
    assertEqual(normalizeSeed('-99'), normalizeSeed(-99));
  });

  it('text seeds hash with Java String.hashCode semantics', () => {
    // Matching Java means a named seed produces the world a player would get in
    // Minecraft, which is the whole point of accepting text seeds.
    //
    // The expected value is computed here by a separate, deliberately literal
    // transcription of the spec (h = 31*h + c, wrapping at int32) rather than
    // hardcoded. A magic constant in a test only proves the implementation
    // still agrees with whatever it produced the day it was written.
    const javaHashCode = (s) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; // |0 forces int32 wraparound
      }
      return h;
    };

    for (const text of ['gargamel', 'Glacier', 'a', 'the nether is fine actually']) {
      const expected = BigInt.asUintN(64, BigInt(javaHashCode(text)));
      assertEqual(normalizeSeed(text), expected, `seed text: ${JSON.stringify(text)}`);
    }
  });

  it('the same text seed always yields the same world seed', () => {
    assertEqual(normalizeSeed('Cool Island'), normalizeSeed('Cool Island'));
  });

  it('empty and whitespace seeds are stable rather than throwing', () => {
    assertEqual(normalizeSeed(''), 0n);
    assertEqual(normalizeSeed('   '), 0n);
  });
});

describe('rng: positional and forked streams', () => {
  it('positionalRandom is stable for a position regardless of call order', () => {
    // Chunks generate across a worker pool and complete out of order. If
    // position-derived seeding were order-dependent, the same seed would produce
    // different worlds run to run.
    const first = positionalRandom(42, 100, 64, -200).nextUint32();
    positionalRandom(42, 0, 0, 0).nextUint32();
    positionalRandom(42, 999, 12, 7).nextUint32();
    const again = positionalRandom(42, 100, 64, -200).nextUint32();
    assertEqual(again, first);
  });

  it('adjacent positions produce uncorrelated values', () => {
    let collisions = 0;
    for (let x = 0; x < 200; x++) {
      const a = positionalRandom(1, x, 64, 0).nextUint32();
      const b = positionalRandom(1, x + 1, 64, 0).nextUint32();
      if (a === b) collisions++;
    }
    assert(collisions === 0, `${collisions} adjacent positions collided`);
  });

  it('fork gives each label an independent stream', () => {
    // Each feature type draws from its own stream so that adding a new feature
    // in a later version does not shift the sequence every existing feature
    // reads from -- which would silently change terrain in existing worlds.
    const base = new Random(500);
    const trees = base.fork('trees').nextUint32();
    const ores = base.fork('ores').nextUint32();
    assert(trees !== ores, 'different fork labels produced the same stream');

    const base2 = new Random(500);
    assertEqual(base2.fork('trees').nextUint32(), trees, 'fork is not reproducible');
  });
});
