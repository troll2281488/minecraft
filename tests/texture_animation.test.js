import { describe, it, assert, assertEqual, assertDeepEqual } from './framework.js';
import { parseTextureAnimation, textureFrameAt } from '../src/render/texture_animation.js';

describe('Java 1.19 texture animation metadata', () => {
  it('reads vertical strips and defaults to one tick per frame', () => {
    const animation = parseTextureAnimation({ animation: {} }, 16, 48);
    assert(animation);
    assertEqual(animation.width, 16);
    assertEqual(animation.height, 16);
    assertEqual(animation.frameCount, 3);
    assertEqual(animation.duration, 3);
    assertDeepEqual(animation.frames, [
      { index: 0, time: 1 }, { index: 1, time: 1 }, { index: 2, time: 1 },
    ]);
  });

  it('supports horizontal strips, explicit frame sizes, and per-frame timing', () => {
    const animation = parseTextureAnimation({
      animation: {
        width: 8, height: 8, frametime: 4, interpolate: true,
        frames: [0, { index: 2, time: 7 }, 1],
      },
    }, 24, 8);
    assert(animation);
    assertEqual(animation.columns, 3);
    assertEqual(animation.rows, 1);
    assertEqual(animation.interpolate, true);
    assertEqual(animation.duration, 15);
    assertDeepEqual(animation.frames, [
      { index: 0, time: 4 }, { index: 2, time: 7 }, { index: 1, time: 4 },
    ]);
  });

  it('ignores invalid frame indices and rejects malformed dimensions', () => {
    const animation = parseTextureAnimation({
      animation: { frames: [-1, 0, 99, { index: 1, time: 0 }] },
    }, 16, 32);
    assert(animation);
    assertDeepEqual(animation.frames, [{ index: 0, time: 1 }, { index: 1, time: 1 }]);
    assertEqual(parseTextureAnimation({ animation: { width: 7 } }, 16, 32), null);
    assertEqual(parseTextureAnimation(null, 16, 32), null);
  });

  it('cycles by total duration and respects custom frame order', () => {
    const animation = parseTextureAnimation({
      animation: { frametime: 2, frames: [2, { index: 0, time: 1 }] },
    }, 16, 48);
    assertEqual(textureFrameAt(animation, 0), 2);
    assertEqual(textureFrameAt(animation, 1), 2);
    assertEqual(textureFrameAt(animation, 2), 0);
    assertEqual(textureFrameAt(animation, 3), 2);
    assertEqual(textureFrameAt(animation, 4), 2);
  });

  it('handles negative and non-finite ticks deterministically', () => {
    const animation = parseTextureAnimation({ animation: {} }, 16, 32);
    assertEqual(textureFrameAt(animation, -5), 0);
    assertEqual(textureFrameAt(animation, Infinity), 0);
    assertEqual(textureFrameAt(null, 10), 0);
  });
});
