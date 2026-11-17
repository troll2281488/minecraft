/**
 * Chunk geometry on the GPU: upload, budget, cull, draw.
 *
 * THE MESH BUDGET
 *
 * This is the part written specifically for a 4 GB card. An unbounded chunk
 * mesh cache is the standard way a voxel renderer dies: VRAM fills, the driver
 * starts thrashing or simply loses the context, and the failure presents as the
 * whole tab going black with no error anyone can act on.
 *
 * So mesh memory is tracked exactly and capped. When an upload would exceed the
 * cap, the chunks furthest from the camera are freed until it fits. The failure
 * mode becomes "distant chunks unload", which is visible, harmless, and
 * self-correcting when the player walks back.
 *
 * MESHING BUDGET
 *
 * Meshing is main-thread work, so it runs against a millisecond budget per
 * frame rather than draining the whole dirty queue at once. Nearest chunks are
 * meshed first, for the same reason they are generated first.
 */

import { CHUNK_SIZE, MIN_Y, MAX_Y, RENDER } from '../core/constants.js';
import { chunkKey, parseChunkKey } from '../core/math.js';
import { meshChunk } from './mesher.js';

// Build ceiling and vertex stride both come from constants.js now; this file
// had its own copy of each (WORLD_TOP, and a literal 8 duplicating
// RENDER.BYTES_PER_VERTEX).
const WORLD_TOP = MAX_Y;

class ChunkMesh {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.vao = null;
    this.vbo = null;
    this.opaqueQuads = 0;
    this.translucentQuads = 0;
    this.opaqueVertexCount = 0;
    this.bytes = 0;
    this.lastUsedFrame = 0;
  }
}

export class ChunkRenderer {
  constructor(gl, quadIndexBuffer) {
    this.gl = gl;
    this.quadIndexBuffer = quadIndexBuffer;

    /** @type {Map<string, ChunkMesh>} */
    this.meshes = new Map();
    this.usedBytes = 0;
    this.budgetBytes = RENDER.MESH_BUDGET_BYTES;

    this.frame = 0;
    this.stats = {
      meshedThisFrame: 0,
      drawn: 0,
      culled: 0,
      evictedTotal: 0,
      overCapacity: 0,
      meshTimeMs: 0,
    };
  }

  /**
   * Mesh dirty chunks until the time budget runs out.
   * @returns {number} how many chunks were meshed
   */
  update(world, cameraX, cameraZ, budgetMs = 6, frustum = null) {
    this.frame++;
    this.stats.meshedThisFrame = 0;
    this.stats.meshTimeMs = 0;
    if (world.dirtyMeshes.size === 0) return 0;

    const started = performance.now();

    // Nearest first: the chunk under the player matters more than one at the
    // edge of the render distance.
    const queue = [...world.dirtyMeshes]
      .map((key) => {
        const { cx, cz } = parseChunkKey(key);
        const dx = (cx + 0.5) * CHUNK_SIZE - cameraX;
        const dz = (cz + 0.5) * CHUNK_SIZE - cameraZ;
        // A generated chunk without a GPU mesh is a visible hole in terrain.
        // Build missing meshes before refreshing already-visible stale meshes.
        const missing = this.meshes.has(key) ? 0 : 1;
        const visible = frustum && frustum.containsBox(
          cx * CHUNK_SIZE, MIN_Y, cz * CHUNK_SIZE,
          (cx + 1) * CHUNK_SIZE, WORLD_TOP, (cz + 1) * CHUNK_SIZE,
        ) ? 1 : 0;
        return { key, cx, cz, missing, visible, distanceSq: dx * dx + dz * dz };
      })
      // Fill holes in the current view first, then prepare nearby surroundings.
      .sort((a, b) => b.visible - a.visible || b.missing - a.missing ||
        a.distanceSq - b.distanceSq);

    for (const entry of queue) {
      if (performance.now() - started > budgetMs) break;

      const chunk = world.getChunk(entry.cx, entry.cz);
      world.dirtyMeshes.delete(entry.key);
      if (!chunk) continue;

      const geometry = meshChunk(world.viewFor(chunk));
      this._upload(entry.cx, entry.cz, geometry, cameraX, cameraZ);
      this.stats.meshedThisFrame++;
    }

    this.stats.meshTimeMs = performance.now() - started;
    return this.stats.meshedThisFrame;
  }

  _upload(cx, cz, geometry, cameraX, cameraZ) {
    const gl = this.gl;
    const key = chunkKey(cx, cz);

    const totalVertices =
      geometry.opaqueQuads * 4 + geometry.translucentQuads * 4;

    let mesh = this.meshes.get(key);

    // An empty chunk (solid stone underground, or pure air) needs no buffer at
    // all. Keeping a zero-length VBO around for every one of those wastes both
    // memory and a draw call.
    if (totalVertices === 0) {
      if (mesh) this._free(key);
      return;
    }

    // The shared index buffer has a fixed capacity, and drawElements would
    // happily read past the end of it -- producing corrupt geometry or a lost
    // context rather than an error anyone could act on. Real chunks peak around
    // 7,500 quads against a 200,000 capacity, so this should never fire; it
    // exists because "should never" and "cannot" are different things, and the
    // Phase 2 block families will push the numbers up.
    const totalQuads = geometry.opaqueQuads + geometry.translucentQuads;
    if (totalQuads > this.quadIndexBuffer.maxQuads) {
      console.error(
        `[chunk_renderer] chunk ${cx},${cz} produced ${totalQuads} quads, over the ` +
        `shared index buffer capacity of ${this.quadIndexBuffer.maxQuads}. Skipping it ` +
        `rather than drawing past the end of the buffer.`,
      );
      if (mesh) this._free(key);
      this.stats.overCapacity++;
      return;
    }

    const bytes = totalVertices * RENDER.BYTES_PER_VERTEX;

    if (mesh) {
      this.usedBytes -= mesh.bytes;
    } else {
      mesh = new ChunkMesh(cx, cz);
      mesh.vao = gl.createVertexArray();
      mesh.vbo = gl.createBuffer();
      this.meshes.set(key, mesh);
    }

    this._evictUntilFits(bytes, cameraX, cameraZ, key);

    // Opaque geometry first, then translucent, so both passes draw from one
    // buffer at different offsets and the chunk needs only a single VAO.
    const combined = new Uint32Array(totalVertices * 2);
    combined.set(geometry.opaque, 0);
    combined.set(geometry.translucent, geometry.opaque.length);

    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, combined, gl.STATIC_DRAW);

    // One integer attribute carrying both packed words. vertexAttribIPointer,
    // not vertexAttribPointer: the values are bit fields and must not be
    // normalized or converted to float on the way in.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 2, gl.UNSIGNED_INT, RENDER.BYTES_PER_VERTEX, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndexBuffer.buffer);
    gl.bindVertexArray(null);

    mesh.opaqueQuads = geometry.opaqueQuads;
    mesh.translucentQuads = geometry.translucentQuads;
    mesh.opaqueVertexCount = geometry.opaqueQuads * 4;
    mesh.bytes = bytes;
    mesh.lastUsedFrame = this.frame;
    this.usedBytes += bytes;
  }

  /** Free the furthest meshes until `incoming` bytes fit within the budget. */
  _evictUntilFits(incoming, cameraX, cameraZ, protectedKey) {
    if (this.usedBytes + incoming <= this.budgetBytes) return;

    const candidates = [...this.meshes.entries()]
      .filter(([key]) => key !== protectedKey)
      .map(([key, mesh]) => {
        const dx = (mesh.cx + 0.5) * CHUNK_SIZE - cameraX;
        const dz = (mesh.cz + 0.5) * CHUNK_SIZE - cameraZ;
        return { key, distanceSq: dx * dx + dz * dz };
      })
      .sort((a, b) => b.distanceSq - a.distanceSq); // furthest first

    for (const { key } of candidates) {
      if (this.usedBytes + incoming <= this.budgetBytes) break;
      this._free(key);
      this.stats.evictedTotal++;
    }
  }

  _free(key) {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    if (mesh.vao) this.gl.deleteVertexArray(mesh.vao);
    if (mesh.vbo) this.gl.deleteBuffer(mesh.vbo);
    this.usedBytes -= mesh.bytes;
    this.meshes.delete(key);
  }

  /** Drop a chunk's geometry, e.g. when the chunk itself unloads. */
  remove(cx, cz) {
    this._free(chunkKey(cx, cz));
  }

  /**
   * Draw one pass.
   *
   * @param {'opaque'|'translucent'} pass
   * @param {import('../core/mat4.js').Frustum} frustum
   */
  draw(pass, frustum, uniforms, setChunkOrigin) {
    const gl = this.gl;
    let drawn = 0;
    let culled = 0;

    // Translucent geometry is drawn back-to-front across chunks. Within a chunk
    // faces are unsorted, which is acceptable because the only translucent
    // blocks in Phase 1 are water and ice -- large flat expanses where the
    // ordering error is invisible.
    let entries = [...this.meshes.values()];
    if (pass === 'translucent') {
      const camX = uniforms.cameraX;
      const camZ = uniforms.cameraZ;
      entries.sort((a, b) => {
        const da = (a.cx * CHUNK_SIZE - camX) ** 2 + (a.cz * CHUNK_SIZE - camZ) ** 2;
        const db = (b.cx * CHUNK_SIZE - camX) ** 2 + (b.cz * CHUNK_SIZE - camZ) ** 2;
        return db - da;
      });
    }

    for (const mesh of entries) {
      const quads = pass === 'opaque' ? mesh.opaqueQuads : mesh.translucentQuads;
      if (quads === 0) continue;

      const minX = mesh.cx * CHUNK_SIZE;
      const minZ = mesh.cz * CHUNK_SIZE;
      if (!frustum.containsBox(minX, MIN_Y, minZ, minX + CHUNK_SIZE, WORLD_TOP, minZ + CHUNK_SIZE)) {
        culled++;
        continue;
      }

      setChunkOrigin(minX, MIN_Y, minZ);

      gl.bindVertexArray(mesh.vao);
      const firstQuad = pass === 'opaque' ? 0 : mesh.opaqueQuads;
      gl.drawElements(
        gl.TRIANGLES,
        quads * 6,
        gl.UNSIGNED_INT,
        firstQuad * 6 * 4, // byte offset into the shared index buffer
      );

      mesh.lastUsedFrame = this.frame;
      drawn++;
    }

    if (pass === 'opaque') {
      this.stats.drawn = drawn;
      this.stats.culled = culled;
    }
    gl.bindVertexArray(null);
  }

  get meshCount() {
    return this.meshes.size;
  }

  get megabytesUsed() {
    return this.usedBytes / (1024 * 1024);
  }

  get budgetMegabytes() {
    return this.budgetBytes / (1024 * 1024);
  }

  dispose() {
    for (const key of [...this.meshes.keys()]) this._free(key);
  }
}
