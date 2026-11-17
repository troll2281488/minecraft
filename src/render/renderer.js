/**
 * The render pass: GPU program and buffer setup, then the per-frame draw of sky,
 * terrain, the block-selection outline and the breaking overlay.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see the
 * note in main.js. The selection-outline scratch lives here rather than on Game
 * because only this module writes it; mat4.js's header explains why it is
 * preallocated at all.
 */

import { RENDER } from '../core/constants.js';
import { mat4 } from '../core/mat4.js';
import {
  createProgram, createQuadIndexBuffer,
  TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER,
  SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER,
  LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER,
  CRACK_VERTEX_SHADER, CRACK_FRAGMENT_SHADER,
} from './gl.js';
import { ChunkRenderer } from './chunk_renderer.js';

/**
 * A unit cube as 36 vertices of (x, y, z, u, v), two triangles per face.
 *
 * Non-indexed on purpose: it is 36 vertices drawn at most once per frame, and an
 * index buffer for it would be more code than it saves.
 */
function buildUnitCubeWithUvs() {
  // Each face: origin corner, then the two edge vectors spanning it.
  const faces = [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]], // -Z
    [[1, 0, 1], [-1, 0, 0], [0, 1, 0]], // +Z
    [[0, 0, 1], [0, 0, -1], [0, 1, 0]], // -X
    [[1, 0, 0], [0, 0, 1], [0, 1, 0]], // +X
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]], // +Y
    [[0, 0, 1], [1, 0, 0], [0, 0, -1]], // -Y
  ];

  const data = new Float32Array(36 * 5);
  let i = 0;
  const put = (o, u, v, su, sv) => {
    data[i++] = o[0] + u[0] * su + v[0] * sv;
    data[i++] = o[1] + u[1] * su + v[1] * sv;
    data[i++] = o[2] + u[2] * su + v[2] * sv;
    data[i++] = su;
    data[i++] = sv;
  };

  for (const [o, u, v] of faces) {
    put(o, u, v, 0, 0); put(o, u, v, 1, 0); put(o, u, v, 1, 1);
    put(o, u, v, 0, 0); put(o, u, v, 1, 1); put(o, u, v, 0, 1);
  }
  return data;
}

// Selection-outline geometry: the 12 cube edges as pairs of corner indices, and
// scratch corners written in place each frame. Module scope because they are constant
// (the indices) or reused (the corners) -- see _drawSelection.
export const SELECTION_EDGES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
];
const SELECTION_CORNERS = Array.from({ length: 8 }, () => [0, 0, 0]);

/** Unit cube triangles used by the low-poly player rig. */
function buildAvatarCube() {
  const faces = [
    [[0,0,0],[0,1,0],[1,1,0],[1,0,0]],
    [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
    [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
    [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
  ];
  const out = [];
  for (const [a,b,c,d] of faces) for (const v of [a,b,c,a,c,d]) out.push(...v);
  return new Float32Array(out);
}

export const RendererMixin = {
  _setupPrograms() {
    const gl = this.gl;
    this.terrainProgram = createProgram(gl, TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER, 'terrain');
    this.skyProgram = createProgram(gl, SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER, 'sky');
    this.lineProgram = createProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER, 'line');
    this.crackProgram = createProgram(gl, CRACK_VERTEX_SHADER, CRACK_FRAGMENT_SHADER, 'crack');
    this.avatarProgram = createProgram(gl, `#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nuniform mat4 uViewProjection; uniform vec3 uPlayerPos; uniform vec3 uPartOffset; uniform vec3 uPartScale; uniform float uYaw;\nvoid main(){ vec3 p=(aPos-0.5)*uPartScale+uPartOffset; float c=cos(uYaw), s=sin(uYaw); vec3 r=vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c); gl_Position=uViewProjection*vec4(uPlayerPos+r,1.0); }`, `#version 300 es\nprecision highp float;\nuniform vec4 uColor; out vec4 fragColor; void main(){fragColor=uColor;}`, 'player avatar');
  },

  _setupBuffers() {
    const gl = this.gl;

    // Sized for the largest plausible chunk mesh. Shared by every chunk, so
    // this one allocation replaces one index buffer per loaded chunk.
    this.quadIndex = createQuadIndexBuffer(gl, 200_000);
    this.chunkRenderer = new ChunkRenderer(gl, this.quadIndex);

    // Fullscreen triangle pair for the sky.
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const skyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, 1, 1,
      -1, -1, 1, 1, -1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Dynamic line buffer for the block selection outline.
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    this.lineBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(24 * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // Unit cube for the block-breaking overlay: six faces, two triangles each,
    // with UVs so the crack pattern maps across every face.
    this.crackVao = gl.createVertexArray();
    gl.bindVertexArray(this.crackVao);
    const crackBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, crackBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildUnitCubeWithUvs(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);

    this.avatarVao = gl.createVertexArray();
    gl.bindVertexArray(this.avatarVao);
    this.avatarBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.avatarBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildAvatarCube(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.viewProjection = mat4.create();
    this.projection = mat4.create();
    this.view = mat4.create();
  },

  _render() {
    const gl = this.gl;
    const player = this.player;
    if (!this.world || !player) {
      gl.clearColor(0.05, 0.05, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return;
    }

    const daylight = this.daylight;
    const fogColor = this._fogColor;   // reused; was a fresh array every frame
    fogColor[0] = 0.55 * daylight + 0.03;
    fogColor[1] = 0.68 * daylight + 0.03;
    fogColor[2] = 0.92 * daylight + 0.06;

    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const fov = (RENDER.DEFAULT_FOV + (player.sprinting ? RENDER.SPRINT_FOV_BONUS : 0)) * Math.PI / 180;
    const far = Math.max(64, this.renderDistance * 16 + 64);

    mat4.perspective(this.projection, fov, aspect, 0.05, far);
    let cameraX = player.x;
    let cameraY = player.eyeY;
    let cameraZ = player.z;
    let cameraYaw = player.yaw;
    let cameraPitch = player.pitch;
    if (this.thirdPerson) {
      const yaw = player.yaw * Math.PI / 180;
      const pitch = player.pitch * Math.PI / 180;
      const distance = 4.2;
      cameraX += Math.sin(yaw) * Math.cos(pitch) * distance;
      cameraY += Math.sin(pitch) * distance + 0.8;
      cameraZ -= Math.cos(yaw) * Math.cos(pitch) * distance;
    }
    mat4.fromCamera(this.view, cameraX, cameraY, cameraZ, cameraYaw, cameraPitch);
    mat4.multiply(this.viewProjection, this.projection, this.view);
    this.frustum.update(this.viewProjection);

    this._drawSky(daylight);

    this.chunkRenderer.update(this.world, player.x, player.z, 6);
    this._drawTerrain(daylight, fogColor, far);
    this._drawSelection();

    this.ui.updateHotbar(this.inventory);
    if (this.creativeOpen) this.ui.updateCreativeInventory(this.inventory);
    else if (this.inventoryOpen) this.ui.updateInventory(this.inventory, this.craftingGrid);
    if (this.showDebug) this._updateDebug();
  },

  _drawSky(daylight) {
    const gl = this.gl;
    const { program, uniforms } = this.skyProgram;
    gl.useProgram(program);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.uniform3f(uniforms.uTopColor, 0.25 * daylight, 0.45 * daylight, 0.95 * daylight);
    gl.uniform3f(uniforms.uHorizonColor, 0.62 * daylight, 0.76 * daylight, 0.95 * daylight);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  },

  _drawTerrain(daylight, fogColor, far) {
    const gl = this.gl;
    const { program, uniforms } = this.terrainProgram;
    const player = this.player;

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
    gl.uniform1i(uniforms.uTexture, 0);

    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.uniform3f(uniforms.uCameraPos, player.x, player.eyeY, player.z);
    gl.uniform1f(uniforms.uDaylight, daylight);
    gl.uniform3f(uniforms.uFogColor, fogColor[0], fogColor[1], fogColor[2]);
    gl.uniform1f(uniforms.uFogStart, far * 0.55);
    gl.uniform1f(uniforms.uFogEnd, far * 0.95);

    // Biome tint colours. Per-biome blending arrives in Phase 2; these are the
    // plains values, which is what most of a Phase 1 world is.
    gl.uniform3f(uniforms.uGrassColor, 0.57, 0.74, 0.35);
    gl.uniform3f(uniforms.uFoliageColor, 0.48, 0.71, 0.30);
    gl.uniform3f(uniforms.uWaterColor, 0.25, 0.46, 0.9);

    const setOrigin = (x, y, z) => gl.uniform3f(uniforms.uChunkOrigin, x, y, z);

    // Opaque and cutout share a pass: both write depth and use alpha testing,
    // so no sorting is needed between them.
    gl.uniform1f(uniforms.uAlphaCutoff, 0.5);
    gl.disable(gl.BLEND);
    this.chunkRenderer.draw('opaque', this.frustum,
      { cameraX: player.x, cameraZ: player.z }, setOrigin);

    // Translucent geometry blends and must not write depth, or nearer water
    // would hide the water behind it.
    gl.uniform1f(uniforms.uAlphaCutoff, 0.02);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.chunkRenderer.draw('translucent', this.frustum,
      { cameraX: player.x, cameraZ: player.z }, setOrigin);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  },

  _drawPlayers() {
    const gl = this.gl;
    const { program, uniforms } = this.avatarProgram;
    const parts = [
      // center offset, scale, colour
      [[0, 1.68, 0], [0.28, 0.32, 0.28], [0.78, 0.62, 0.46, 1]], // head
      [[0, 1.05, 0], [0.48, 0.78, 0.26], [0.16, 0.42, 0.78, 1]], // torso
      [[-0.34, 1.08, 0], [0.20, 0.72, 0.22], [0.78, 0.62, 0.46, 1]], // left arm
      [[0.34, 1.08, 0], [0.20, 0.72, 0.22], [0.78, 0.62, 0.46, 1]], // right arm
      [[-0.13, 0.36, 0], [0.24, 0.72, 0.25], [0.20, 0.24, 0.55, 1]], // left leg
      [[0.13, 0.36, 0], [0.24, 0.72, 0.25], [0.20, 0.24, 0.55, 1]], // right leg
    ];
    const draw = (x, y, z, yaw) => {
      gl.uniform3f(uniforms.uPlayerPos, x, y, z);
      gl.uniform1f(uniforms.uYaw, yaw * Math.PI / 180);
      for (const [offset, scale, color] of parts) {
        gl.uniform3f(uniforms.uPartOffset, offset[0], offset[1], offset[2]);
        gl.uniform3f(uniforms.uPartScale, scale[0], scale[1], scale[2]);
        gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3]);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
      }
    };

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.bindVertexArray(this.avatarVao);
    if (this.thirdPerson) draw(this.player.x, this.player.y, this.player.z, this.player.yaw);
    for (const remote of this.multiplayer?.remotePlayers?.values?.() ?? []) {
      draw(remote.x, remote.y, remote.z, remote.yaw);
    }
    gl.bindVertexArray(null);
  },

  _drawSelection() {
    if (!this.hit) return;
    const gl = this.gl;
    const { x, y, z } = this.hit;
    const e = 0.002; // nudge outward so the outline is not z-fighting the face

    // Written into preallocated scratch, not rebuilt per frame. This ran every
    // frame the player was looking at a block and allocated 8 corner arrays, a
    // 24-element index array, a Float32Array and a forEach closure each time --
    // exactly the sawtooth GC pattern mat4.js's header says the renderer avoids.
    const corners = SELECTION_CORNERS;
    corners[0][0] = x - e;         corners[0][1] = y - e;         corners[0][2] = z - e;
    corners[1][0] = x + 1 + e;     corners[1][1] = y - e;         corners[1][2] = z - e;
    corners[2][0] = x + 1 + e;     corners[2][1] = y - e;         corners[2][2] = z + 1 + e;
    corners[3][0] = x - e;         corners[3][1] = y - e;         corners[3][2] = z + 1 + e;
    corners[4][0] = x - e;         corners[4][1] = y + 1 + e;     corners[4][2] = z - e;
    corners[5][0] = x + 1 + e;     corners[5][1] = y + 1 + e;     corners[5][2] = z - e;
    corners[6][0] = x + 1 + e;     corners[6][1] = y + 1 + e;     corners[6][2] = z + 1 + e;
    corners[7][0] = x - e;         corners[7][1] = y + 1 + e;     corners[7][2] = z + 1 + e;

    const vertices = this._selectionVertices;
    for (let i = 0; i < SELECTION_EDGES.length; i++) {
      const c = corners[SELECTION_EDGES[i]];
      vertices[i * 3] = c[0];
      vertices[i * 3 + 1] = c[1];
      vertices[i * 3 + 2] = c[2];
    }

    const { program, uniforms } = this.lineProgram;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);

    // Darkens as the block breaks, giving mining feedback without a texture.
    const progress = this.mining.target ? this.mining.progress : 0;
    gl.uniform4f(uniforms.uColor, 0, 0, 0, 0.35 + progress * 0.5);

    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, SELECTION_EDGES.length);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    this._drawBreakingOverlay(x, y, z);
  },

  _drawBreakingOverlay(x, y, z) {
    const stage = this.mining.stage;
    if (stage < 0) return;

    const gl = this.gl;
    const { program, uniforms } = this.crackProgram;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.uniform3f(uniforms.uBlockOrigin, x, y, z);
    gl.uniform1f(uniforms.uStage, stage);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // No depth write: the overlay is decoration on top of a face that has
    // already been drawn, and writing depth would let it occlude anything
    // rendered afterwards.
    gl.depthMask(false);
    gl.bindVertexArray(this.crackVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  },
};
