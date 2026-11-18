/**
 * WebGL2 context, shaders, and the vertex format.
 *
 * THE VERTEX FORMAT -- 8 bytes, two uint32s
 *
 * Positions are in SIXTEENTHS of a block, not whole blocks. Cross-plants sit at
 * 0.1464 and torches at 0.4, and whole-block integers would collapse every one
 * of them to a zero-area quad. A sixteenth is the texture resolution, so nothing
 * is ever positioned more finely than this.
 *
 * word 0:  bits  0..8    x within chunk    (0..256, = 0..16 blocks)
 *          bits  9..21   y within chunk    (0..4096, = 0..256 blocks)
 *          bits 22..30   z within chunk    (0..256, = 0..16 blocks)
 *
 * word 1:  bits  0..11   texture layer     (0..4095)
 *          bits 12..14   face index        (0..5)
 *          bits 15..16   uv corner         (0..3)
 *          bits 17..18   tint kind         (0=none, 1=grass, 2=foliage, 3=water)
 *          bits 19..20   ambient occlusion (0..3)
 *          bits 21..24   sky light         (0..15)
 *          bits 25..28   block light       (0..15)
 *
 * A naive layout -- vec3 position, vec2 uv, vec3 normal, float ao, vec2 light --
 * is 44 bytes. At render distance 10 that difference is the better part of a
 * gigabyte of VRAM, on a card that has four. Packing is not premature
 * optimization here; it is the difference between running and not.
 *
 * Unpacking costs a handful of integer ops in the vertex shader, which is free
 * on any GPU that can run this at all.
 */

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,        // voxel edges should be crisp, and MSAA costs VRAM
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    throw new Error(
      'WebGL2 is not available in this browser.\n\n' +
      'This game needs WebGL2 for texture arrays and integer vertex attributes. ' +
      'If you are on hardware that supports it, check that hardware acceleration ' +
      'is enabled in your browser settings.',
    );
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  return gl;
}

// ---------------------------------------------------------------------------
// Shader compilation
// ---------------------------------------------------------------------------

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Failed to compile ${label}:\n${log}\n\n${numberLines(source)}`);
  }
  return shader;
}

export function createProgram(gl, vertexSource, fragmentSource, label = 'program') {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex shader`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment shader`);

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  // Shaders can be deleted immediately; the program holds its own reference.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Failed to link ${label}:\n${log}`);
  }

  // Cache uniform locations up front. Looking them up per draw call is a
  // surprisingly large cost when there are hundreds of chunks per frame.
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return { program, uniforms };
}

/** Line numbers make a driver's "ERROR: 0:47" message actually actionable. */
function numberLines(source) {
  return source.split('\n').map((line, i) => `${String(i + 1).padStart(3)} | ${line}`).join('\n');
}

// ---------------------------------------------------------------------------
// Texture array
// ---------------------------------------------------------------------------

/**
 * Upload the generated block textures as a TEXTURE_2D_ARRAY.
 *
 * NEAREST magnification keeps the pixel-art crisp when close up. Minification
 * uses NEAREST_MIPMAP_LINEAR so distant terrain does not shimmer -- and because
 * every tile is its own layer, mip generation cannot bleed one texture into
 * another the way it would in a packed atlas.
 */
export function createTextureArray(gl, { data, layers }, tileSize) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

  gl.texImage3D(
    gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8,
    tileSize, tileSize, layers, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data,
  );

  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // Pick one mip level instead of blending adjacent levels: linear mip
  // blending softens the deliberately hard-edged 16x16 pixel art.
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Anisotropic filtering, where available, dramatically improves ground
  // textures viewed at a shallow angle -- which is most of the ground.
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) {
    // Keep the texture's pixel grid crisp at grazing angles.
    const max = 1;
    gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
  }

  return texture;
}

// ---------------------------------------------------------------------------
// Shared quad index buffer
// ---------------------------------------------------------------------------

/**
 * One index buffer shared by every chunk mesh.
 *
 * All geometry here is quads emitted as 4 consecutive vertices, so the index
 * pattern (0,1,2, 0,2,3) repeats forever and never depends on the mesh. Sharing
 * one buffer removes per-chunk index memory entirely -- at render distance 10
 * that is hundreds of buffers that simply do not need to exist.
 */
export function createQuadIndexBuffer(gl, maxQuads) {
  const indices = new Uint32Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) {
    const v = q * 4;
    const i = q * 6;
    indices[i] = v;
    indices[i + 1] = v + 1;
    indices[i + 2] = v + 2;
    indices[i + 3] = v;
    indices[i + 4] = v + 2;
    indices[i + 5] = v + 3;
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { buffer, maxQuads, bytes: indices.byteLength };
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

export const TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in uvec2 aData;

uniform mat4 uViewProjection;
uniform vec3 uChunkOrigin;
uniform vec3 uCameraPos;      // passed in, NOT recovered by inverting uViewProjection
uniform float uDaylight;      // 0 at midnight, 1 at noon
uniform vec3 uGrassColor;
uniform vec3 uFoliageColor;
uniform vec3 uWaterColor;

out vec3 vTexCoord;           // xy within the tile, z is the array layer
out vec4 vColor;
out float vFogDistance;

// Fixed directional shading, matching Minecraft: the top face is fully lit,
// the bottom is darkest, and the two horizontal axes differ from each other.
// This is what gives an untextured voxel world its sense of form.
const float FACE_SHADE[6] = float[6](0.5, 1.0, 0.8, 0.8, 0.6, 0.6);

void main() {
  uint w0 = aData.x;
  uint w1 = aData.y;

  // Sixteenths of a block; see the format note in gl.js.
  vec3 localPos = vec3(
    float( w0        & 511u),
    float((w0 >>  9) & 8191u),
    float((w0 >> 22) & 511u)
  ) * (1.0 / 16.0);

  uint layer      =  w1        & 4095u;
  uint face       = (w1 >> 12) & 7u;
  uint corner     = (w1 >> 15) & 3u;
  uint tintKind   = (w1 >> 17) & 3u;
  uint ao         = (w1 >> 19) & 3u;
  uint skyLight   = (w1 >> 21) & 15u;
  uint blockLight = (w1 >> 25) & 15u;

  vec3 worldPos = uChunkOrigin + localPos;
  gl_Position = uViewProjection * vec4(worldPos, 1.0);

  vec2 uv = vec2(float(corner == 1u || corner == 2u), float(corner >= 2u));
  vTexCoord = vec3(uv, float(layer));

  // Sky light scales with time of day; block light does not.
  float sky = float(skyLight) / 15.0 * uDaylight;
  float block = float(blockLight) / 15.0;
  float light = max(sky, block);

  // Minecraft's light curve is not linear -- low levels stay visible rather
  // than crushing to black, which is why caves are dim rather than opaque.
  //
  // The curve must reach 1.0 at full light, or a surface in direct midday sun
  // renders visibly grey. An earlier version squared the value twice and left
  // open ground at roughly a third of its correct brightness.
  light = mix(0.07, 1.0, light * (0.35 + 0.65 * light));

  float aoFactor = mix(0.45, 1.0, float(ao) / 3.0);
  float shade = FACE_SHADE[min(face, 5u)];

  vec3 tint = vec3(1.0);
  if (tintKind == 1u) tint = uGrassColor;
  else if (tintKind == 2u) tint = uFoliageColor;
  else if (tintKind == 3u) tint = uWaterColor;

  vColor = vec4(tint * light * aoFactor * shade, 1.0);
  vFogDistance = length(worldPos - uCameraPos);
}
`;

export const TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec3 vTexCoord;
in vec4 vColor;
in float vFogDistance;

uniform sampler2DArray uTexture;
uniform vec3 uFogColor;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uAlphaCutoff;

out vec4 fragColor;

void main() {
  vec4 texel = texture(uTexture, vTexCoord);

  // Alpha-tested cutout for leaves, glass, and cross-plants. Discarding rather
  // than blending keeps them writing depth, so they sort correctly against each
  // other without any per-face ordering.
  if (texel.a < uAlphaCutoff) discard;

  vec4 color = texel * vColor;

  float fog = clamp((vFogDistance - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0);
  color.rgb = mix(color.rgb, uFogColor, fog);

  fragColor = color;
}
`;

export const SKY_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vScreen;
void main() {
  vScreen = aPos;
  gl_Position = vec4(aPos, 1.0, 1.0); // z = 1 puts it at the far plane
}
`;

export const SKY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vScreen;
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
out vec4 fragColor;
void main() {
  // Bias the gradient toward the horizon so the transition sits where the
  // player is actually looking rather than halfway up the sky.
  float t = clamp(vScreen.y * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(mix(uHorizonColor, uTopColor, pow(t, 0.65)), 1.0);
}
`;

/** Flat coloured lines, for the block selection outline. */
export const LINE_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProjection;
void main() {
  gl_Position = uViewProjection * vec4(aPos, 1.0);
}
`;

export const LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }
`;

/** Overlay quad for the block-breaking crack texture. */
export const CRACK_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
uniform mat4 uViewProjection;
uniform vec3 uBlockOrigin;
out vec2 vUv;
void main() {
  vUv = aUv;
  // The cube is inflated very slightly so the overlay sits in front of the
  // block face instead of z-fighting with it.
  vec3 world = uBlockOrigin + (aPos - 0.5) * 1.004 + 0.5;
  gl_Position = uViewProjection * vec4(world, 1.0);
}
`;

export const CRACK_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uStage;   // 0..9
out vec4 fragColor;

// The crack pattern is generated here rather than as a texture: it is a handful
// of lines, and generating it in the shader keeps ten more textures out of the
// array for something that is drawn a few hundred pixels at a time.
float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  return length(p - (a + ab * h));
}
float crackMask(vec2 uv, float stage) {
  vec2 p = uv * 16.0;
  vec2 center = vec2(8.0);
  float m = 0.0;
  // Every fracture starts near the centre and branches outward as mining advances.
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi > floor((stage + 1.0) * 0.8)) break;
    float angle = fi * 0.785398 + 0.13 * sin(fi * 4.7);
    vec2 dir = vec2(cos(angle), sin(angle));
    float reach = 2.0 + stage * 1.35;
    vec2 a = center + dir * 0.45;
    vec2 b = center + dir * reach;
    m = max(m, 1.0 - smoothstep(0.12, 0.62, segmentDistance(p, a, b)));
    if (stage > 2.0) {
      vec2 branch = b - dir * (1.0 + mod(fi, 2.0));
      float side = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;
      vec2 branchEnd = branch + vec2(-dir.y, dir.x) * side * (1.0 + stage * 0.22);
      m = max(m, 1.0 - smoothstep(0.12, 0.58, segmentDistance(p, branch, branchEnd)));
    }
  }
  return m;
}

void main() {
  float m = crackMask(vUv, uStage);
  if (m < 0.25) discard;
  fragColor = vec4(0.0, 0.0, 0.0, m * 0.55);
}
`;
