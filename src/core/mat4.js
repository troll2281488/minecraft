/**
 * 4x4 matrices and 3-vectors, column-major to match WebGL's expectations.
 *
 * Every function writes into a caller-supplied output array rather than
 * allocating. These run per frame, and per-frame allocation is how a renderer
 * ends up with a sawtooth GC pattern and periodic frame drops that look like a
 * driver problem.
 */

export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  },

  /** Right-handed perspective with a [-1, 1] depth range. */
  perspective(out, fovyRadians, aspect, near, far) {
    const f = 1 / Math.tan(fovyRadians / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[11] = -1;
    if (far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = 2 * far * near * nf;
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }
    return out;
  },

  ortho(out, left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },

  /**
   * View matrix from a position and Euler angles, in Minecraft's convention:
   * yaw 0 faces +Z (south), increasing yaw turns right; positive pitch looks down.
   *
   * Built as a standard right-handed lookAt derived from `forwardVector`, so that
   * `forwardVector` is the SINGLE source of truth for "which way is forward" --
   * the raycast, movement, and mouse-look all use it, and the camera must agree
   * with them exactly.
   *
   * This replaced a hand-written trig matrix that used an incompatible
   * convention: its forward mapped to eye-space +Z (or off to the side) instead
   * of -Z, so the rendered view disagreed with the aim direction in a
   * yaw-dependent way -- horizontal look swung the world the wrong way and the
   * crosshair never lined up with the targeted block. The invariant that failed
   * is now pinned by tests/camera.test.js: fromCamera(...) . forward === [0,0,-1]
   * at every angle.
   */
  fromCamera(out, x, y, z, yawDeg, pitchDeg) {
    const f = forwardVector(yawDeg, pitchDeg);
    const fx = f[0], fy = f[1], fz = f[2];

    // right = normalize(cross(forward, worldUp)), worldUp = [0,1,0].
    let rx = -fz, ry = 0, rz = fx;
    const rlen = Math.hypot(rx, ry, rz);
    if (rlen < 1e-4) {
      // Looking straight up or down: forward is parallel to world-up and the
      // cross product vanishes. Pick a right vector from yaw alone so the view
      // does not snap to a random roll at the poles.
      const yaw = (yawDeg * Math.PI) / 180;
      rx = Math.cos(yaw); ry = 0; rz = -Math.sin(yaw);
    } else {
      rx /= rlen; ry /= rlen; rz /= rlen;
    }

    // up = cross(right, forward). Already unit length (right and forward are
    // unit and orthogonal), so no normalize needed.
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    // Rows are [right, up, -forward]; the camera looks down eye -Z.
    out[0] = rx;  out[4] = ry;  out[8]  = rz;
    out[1] = ux;  out[5] = uy;  out[9]  = uz;
    out[2] = -fx; out[6] = -fy; out[10] = -fz;
    out[3] = 0;   out[7] = 0;   out[11] = 0;

    // Translation is -(row . eye) for each row.
    out[12] = -(rx * x + ry * y + rz * z);
    out[13] = -(ux * x + uy * y + uz * z);
    out[14] = fx * x + fy * y + fz * z; // -(-f . eye)
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  },

  translate(out, m, x, y, z) {
    if (out !== m) out.set(m);
    out[12] = m[0] * x + m[4] * y + m[8]  * z + m[12];
    out[13] = m[1] * x + m[5] * y + m[9]  * z + m[13];
    out[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    out[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return out;
  },
};

/** Direction the camera is facing, in Minecraft's yaw/pitch convention. */
export function forwardVector(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp];
}

/**
 * Six frustum planes extracted from a view-projection matrix.
 *
 * Gribb-Hartmann: each plane is a sum or difference of two matrix rows. Cheap,
 * exact, and needs no knowledge of how the projection was built.
 */
export class Frustum {
  constructor() {
    this.planes = new Float32Array(24); // 6 planes x (a, b, c, d)
  }

  update(vp) {
    const p = this.planes;
    const rows = [
      [vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8],  vp[15] + vp[12]], // left
      [vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8],  vp[15] - vp[12]], // right
      [vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9],  vp[15] + vp[13]], // bottom
      [vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9],  vp[15] - vp[13]], // top
      [vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]], // near
      [vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]], // far
    ];
    for (let i = 0; i < 6; i++) {
      const [a, b, c, d] = rows[i];
      // Normalizing lets the distance test double as a real distance, which
      // matters for the "how far outside?" checks used by mesh eviction.
      const len = Math.hypot(a, b, c) || 1;
      p[i * 4] = a / len;
      p[i * 4 + 1] = b / len;
      p[i * 4 + 2] = c / len;
      p[i * 4 + 3] = d / len;
    }
    return this;
  }

  /** Conservative AABB test: false only when the box is definitely outside. */
  containsBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const p = this.planes;
    for (let i = 0; i < 6; i++) {
      const a = p[i * 4], b = p[i * 4 + 1], c = p[i * 4 + 2], d = p[i * 4 + 3];
      // Test the box corner furthest along the plane normal. If even that is
      // behind the plane, every corner is.
      const x = a >= 0 ? maxX : minX;
      const y = b >= 0 ? maxY : minY;
      const z = c >= 0 ? maxZ : minZ;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }
}
