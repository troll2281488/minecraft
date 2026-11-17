import { describe, it, assert, assertEqual } from './framework.js';
import { mat4, forwardVector, Frustum } from '../src/core/mat4.js';

/**
 * Camera / aim consistency.
 *
 * These pin down the invariant that a real bug violated: the view matrix must
 * agree with `forwardVector`, which is the single source of truth for facing
 * direction shared by the raycast, movement, and mouse-look.
 *
 * The old `fromCamera` used an incompatible convention -- its forward mapped to
 * eye-space +Z (or sideways) instead of -Z -- so the rendered view swung the
 * wrong way relative to where the game thought the player was aiming. Nothing
 * caught it because every other test set the aim target directly and a still
 * screenshot always shows *some* plausible terrain regardless of camera
 * direction. This is a render-vs-logic divergence, and only a math invariant
 * like the one below can catch it.
 */

/** Multiply a column-major mat4 by a 3-vector's rotation part (w=0). */
function rotateByView(view, v) {
  return [
    view[0] * v[0] + view[4] * v[1] + view[8] * v[2],
    view[1] * v[0] + view[5] * v[1] + view[9] * v[2],
    view[2] * v[0] + view[6] * v[1] + view[10] * v[2],
  ];
}

/** Full column-major mat4 times a homogeneous point. */
function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

const YAWS = [0, 30, 45, 90, 135, 180, 225, 270, 315, 360];
const PITCHES = [-90, -60, -45, -20, 0, 20, 45, 60, 90];

describe('camera: view matrix agrees with forwardVector', () => {
  it('forward always maps to eye-space [0,0,-1]', () => {
    // This is THE regression. For a correct camera the facing direction lands
    // dead center, into the screen (-Z). The old matrix produced +Z at yaw 0
    // and sideways vectors elsewhere.
    const view = mat4.create();
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        mat4.fromCamera(view, 0, 0, 0, yaw, pitch);
        const eye = rotateByView(view, forwardVector(yaw, pitch));
        assert(Math.abs(eye[0]) < 1e-5, `yaw=${yaw} pitch=${pitch}: eye.x=${eye[0].toFixed(4)}, expected 0`);
        assert(Math.abs(eye[1]) < 1e-5, `yaw=${yaw} pitch=${pitch}: eye.y=${eye[1].toFixed(4)}, expected 0`);
        assert(Math.abs(eye[2] + 1) < 1e-5, `yaw=${yaw} pitch=${pitch}: eye.z=${eye[2].toFixed(4)}, expected -1`);
      }
    }
  });

  it('the camera up vector stays upward for non-vertical pitch', () => {
    // A negated or rolled up vector would render the world upside down or
    // tilted. The up vector is row 1 of the view rotation: out[1], out[5], out[9].
    const view = mat4.create();
    for (const yaw of YAWS) {
      for (const pitch of [-60, -45, -20, 0, 20, 45, 60]) {
        mat4.fromCamera(view, 0, 0, 0, yaw, pitch);
        const upY = view[5];
        assert(upY > 0, `yaw=${yaw} pitch=${pitch}: up.y=${upY.toFixed(4)} not positive`);
      }
    }
  });

  it('the view rotation is orthonormal (a real rotation, not a skew)', () => {
    const view = mat4.create();
    for (const yaw of [17, 90, 213]) {
      for (const pitch of [-30, 0, 55]) {
        mat4.fromCamera(view, 5, 70, -12, yaw, pitch);
        const rows = [
          [view[0], view[4], view[8]],
          [view[1], view[5], view[9]],
          [view[2], view[6], view[10]],
        ];
        for (let i = 0; i < 3; i++) {
          const len = Math.hypot(...rows[i]);
          assert(Math.abs(len - 1) < 1e-5, `row ${i} length ${len.toFixed(5)} != 1`);
          for (let j = i + 1; j < 3; j++) {
            const dot = rows[i][0] * rows[j][0] + rows[i][1] * rows[j][1] + rows[i][2] * rows[j][2];
            assert(Math.abs(dot) < 1e-5, `rows ${i},${j} not orthogonal (dot ${dot.toFixed(5)})`);
          }
        }
      }
    }
  });

  it('does not blow up looking straight up or down (gimbal guard)', () => {
    const view = mat4.create();
    for (const pitch of [-90, 90]) {
      mat4.fromCamera(view, 0, 64, 0, 45, pitch);
      for (let i = 0; i < 16; i++) {
        assert(Number.isFinite(view[i]), `pitch=${pitch}: view[${i}] is not finite`);
      }
      // Forward must still map to -Z even at the pole.
      const eye = rotateByView(view, forwardVector(45, pitch));
      assert(Math.abs(eye[2] + 1) < 1e-5, `pitch=${pitch}: forward did not map to -Z`);
    }
  });

  it('the eye position projects to the point in front of the camera', () => {
    // End-to-end: a point one unit ahead of the eye along `forward`, run through
    // view*projection, must land at the center of the screen (NDC ~0,0). This is
    // the crosshair-targets-what-you-see property the bug broke.
    const view = mat4.create();
    const proj = mat4.create();
    const vp = mat4.create();
    const eye = [8.5, 70, -20.5];

    for (const yaw of [0, 45, 90, 200, 300]) {
      for (const pitch of [-30, 0, 40]) {
        mat4.perspective(proj, (70 * Math.PI) / 180, 16 / 9, 0.05, 1000);
        mat4.fromCamera(view, eye[0], eye[1], eye[2], yaw, pitch);
        mat4.multiply(vp, proj, view);

        const f = forwardVector(yaw, pitch);
        const target = [eye[0] + f[0] * 5, eye[1] + f[1] * 5, eye[2] + f[2] * 5];
        const clip = transformPoint(vp, target[0], target[1], target[2]);

        assert(clip[3] > 0, `yaw=${yaw} pitch=${pitch}: target is behind the camera (w=${clip[3].toFixed(3)})`);
        const ndcX = clip[0] / clip[3];
        const ndcY = clip[1] / clip[3];
        assert(Math.abs(ndcX) < 1e-4, `yaw=${yaw} pitch=${pitch}: ndcX=${ndcX.toFixed(5)}, not centered`);
        assert(Math.abs(ndcY) < 1e-4, `yaw=${yaw} pitch=${pitch}: ndcY=${ndcY.toFixed(5)}, not centered`);
      }
    }
  });
});

describe('camera: frustum culling follows the camera', () => {
  it('keeps a chunk directly ahead and rejects one directly behind', () => {
    // A concrete consequence of the fix: with the old matrix, "ahead" and
    // "behind" were swapped, so the frustum culled exactly the chunks it should
    // have drawn.
    const view = mat4.create();
    const proj = mat4.create();
    const vp = mat4.create();
    const frustum = new Frustum();

    // At yaw 0 the camera faces +Z (south).
    mat4.perspective(proj, (70 * Math.PI) / 180, 1, 0.05, 1000);
    mat4.fromCamera(view, 0, 70, 0, 0, 0);
    mat4.multiply(vp, proj, view);
    frustum.update(vp);

    const ahead = frustum.containsBox(-8, 66, 40, 8, 74, 56);   // +Z, in front
    const behind = frustum.containsBox(-8, 66, -56, 8, 74, -40); // -Z, behind
    assert(ahead, 'a chunk directly in front was culled');
    assert(!behind, 'a chunk directly behind was kept');
  });
});
