/**
 * The render pass: GPU program and buffer setup, then the per-frame draw of sky,
 * terrain, the block-selection outline and the breaking overlay.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see the
 * note in main.js. The selection-outline scratch lives here rather than on Game
 * because only this module writes it; mat4.js's header explains why it is
 * preallocated at all.
 */

import { RENDER, MS_PER_TICK } from '../core/constants.js';
import { mat4 } from '../core/mat4.js';
import {
  createProgram, createQuadIndexBuffer,
  TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER,
  SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER,
  LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER,
  CRACK_VERTEX_SHADER, CRACK_FRAGMENT_SHADER,
} from './gl.js';
import { ChunkRenderer } from './chunk_renderer.js';
import { raycast } from '../game/interaction.js';
import { renderBar } from '../ui/hud_bars.js';
import { bedrockItemPose, bedrockChargeProgress, bedrockHumanoidPose } from './bedrock_animation_curves.js';

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
  const normals = [
    [0,0,-1], [0,0,1], [-1,0,0], [1,0,0], [0,1,0], [0,-1,0],
  ];
  for (let f = 0; f < faces.length; f++) {
    const [a,b,c,d] = faces[f];
    for (const v of [a,b,c,a,c,d]) out.push(...v, ...normals[f]);
  }
  return new Float32Array(out);
}


function rotateModelPoint(point, rotation) {
  let [x, y, z] = point;
  let c = Math.cos(rotation[0]), sn = Math.sin(rotation[0]);
  [y, z] = [y * c - z * sn, y * sn + z * c];
  c = Math.cos(rotation[1]); sn = Math.sin(rotation[1]);
  [x, z] = [x * c + z * sn, -x * sn + z * c];
  c = Math.cos(rotation[2]); sn = Math.sin(rotation[2]);
  [x, y] = [x * c - y * sn, x * sn + y * c];
  return [x, y, z];
}
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vanillaLayerParts(model, layerName = 'main') {
  const layer = model?.layers?.[layerName];
  if (!layer?.root) return null;
  const result = [];
  const visit = (bone, parentOffset = [0, 0, 0], parentRotation = [0, 0, 0], name = 'root') => {
    const pose = bone.pose ?? {};
    const pivot = add3(parentOffset, rotateModelPoint(pose.offset ?? [0, 0, 0], parentRotation));
    const local = pose.rotation ?? [0, 0, 0];
    const rotation = [parentRotation[0] + local[0], parentRotation[1] + local[1], parentRotation[2] + local[2]];
    for (const cube of bone.cubes ?? []) {
      if (!Array.isArray(cube.uv) || !Array.isArray(cube.origin) || !Array.isArray(cube.size)) continue;
      const size = cube.size;
      const center = [cube.origin[0] + size[0] / 2, cube.origin[1] + size[1] / 2, cube.origin[2] + size[2] / 2];
      const modelCenter = add3(pivot, rotateModelPoint(center, rotation));
      const grow = cube.grow ?? [0, 0, 0];
      const expanded = size.map((v, i) => v + 2 * (grow[i] ?? 0));
      result.push([
        [modelCenter[0] / 16, (24 - modelCenter[1]) / 16, -modelCenter[2] / 16],
        expanded.map(v => v / 16), [1, 1, 1, 1], cube.uv, size,
        [rotation[0], -rotation[1], -rotation[2]], name, (24 - pivot[1]) / 16,
      ]);
    }
    for (const [childName, child] of Object.entries(bone.children ?? {})) visit(child, pivot, rotation, childName);
  };
  visit(layer.root);
  return result.length ? result : null;
}

const MOB_TEXTURE_FILES = Object.freeze({
  cow:'cow.png', goat:'cow.png', pig:'pig.png', sheep:'sheep.png', sheep_fur:'sheep_fur.png', chicken:'chicken.png', wolf:'wolf.png', horse:'horse.png', rabbit:'rabbit.png', polar_bear:'polar_bear.png', mooshroom:'mooshroom.png',
  zombie:'zombie.png', skeleton:'skeleton.png', stray:'stray.png',
  bat:'bat.png', blaze:'blaze.png', ghast:'ghast.png', guardian:'guardian.png',
  elder_guardian:'guardian_elder.png', endermite:'endermite.png', magma_cube:'magmacube.png',
  ocelot:'ocelot.png', parrot:'parrot.png', shulker:'shulker.png', silverfish:'silverfish.png',
  slime:'slime.png', snow_golem:'snow_golem.png', squid:'squid.png', vex:'vex.png',
  witch:'witch.png', wither:'wither.png', wither_skeleton:'wither_skeleton.png',
  zombie_villager:'zombie_villager.png', husk:'husk.png', donkey:'donkey.png', mule:'mule.png',
  skeleton_horse:'skeleton_horse.png', zombie_horse:'zombie_horse.png', llama:'llama.png',
  creeper:'creeper.png', enderman:'enderman.png', spider:'spider.png', cave_spider:'cave_spider.png',
});

const SNOWY_LEAF_BIOMES = new Set([
  'mc:snowy_plains', 'mc:snowy_taiga', 'mc:snowy_taiga_hills', 'mc:ice_spikes',
]);

const VILLAGER_CAREER_TEXTURES = Object.freeze([
  'farmer','fisherman','shepherd','librarian','cleric',
  'armorer','toolsmith','butcher','leatherworker','fletcher','nitwit',
]);
const MOB_UV = Object.freeze({
  cow:[[18,4,12,18,10],[0,0,8,8,6],null,null,null,null,[0,0,8,8,6],[0,0,8,8,6]],
  pig:[[28,8,10,16,8],[0,0,8,8,8],[16,16,4,3,1],[0,16,4,6,4],[0,16,4,6,4],[0,16,4,6,4],[0,16,4,6,4]],
  sheep:[[28,8,8,16,6],[0,0,6,6,8],[0,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4]],
  chicken:[[0,9,6,8,6],[0,0,4,6,3],[14,0,4,2,2],[14,4,2,2,2],[26,0,3,5,3],[26,0,3,5,3]],
  wolf:[[18,14,6,9,6],[0,0,6,6,6]],
  zombie:[[0,0,8,8,8],[16,16,8,12,4],[40,16,4,12,4],[40,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4]],
  skeleton:[[0,0,8,8,8],[16,16,8,12,4],[40,16,4,12,4],[40,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4]],
  stray:[[0,0,8,8,8],[16,16,8,12,4],[40,16,4,12,4],[40,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4]],
  creeper:[[16,16,8,12,4],[0,0,8,8,8],[0,16,4,6,4],[0,16,4,6,4],[0,16,4,6,4],[0,16,4,6,4]],
  enderman:[[0,0,8,8,8],[0,16,8,12,4],[32,16,4,12,4],[32,16,4,12,4],[0,16,4,12,4],[0,16,4,12,4]],
  spider:[[0,12,10,8,12],[32,4,8,8,8],[18,0,16,2,2],[18,0,16,2,2],[18,0,16,2,2],[18,0,16,2,2]],
  cave_spider:[[0,12,10,8,12],[32,4,8,8,8],[18,0,16,2,2],[18,0,16,2,2],[18,0,16,2,2],[18,0,16,2,2]],
});
const PLAYER_SKIN_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAGiklEQVR4Xu2by29VVRTGGRoTB5qYGAeO0AE+Q9uofUNvC4V6SylFSqEgUKqEhtgIlLZqKQ9bedVIagg40cSB0TgQcWDqUP4SJw78F7b57fbbrrt7Tu+t3nrvxbOSL3udtfc5Z3/fWXvf5qzTTZuK2IvPPeFA3eYnfStfxxf731wT4UK1aiLctuXpQB4/FuDc7roCPFICWMJxuzDYtoq8QF+tPvhgMWlBx/8LASArwvFSQIC0JfBIZIB94iJOC3kgolrzArFbw621vwT0pEVcgghnOl9yYx1bAvHJfJ27NNDkgR/WUq2aJa0nLx/UvAAiYklufuaxQFBxpbxgRbDn2OsI9tiOo614YiRNEIiI9S35uNV5ug4x6zMuvj6xigvAZEQinrBiD+ZPu6Wb4+63xRm3dG3cLd38wH137qCrf/6pVWNBLIqgfhurCgE0OSatiWuy33540t2/PObb72fG3L3xQ+6X+XF3770eD0tK58ckBduntuICMBFNTC0/YXePd/sJQh7b2zLvfpoa9eTxMURhDGM5J+laIg+IARuruACalCbNpCAE/lj8wePHqWPu59lxd6r9NY9f5067r07tCP0aL5K6lnyRtffQccUF0ERo9eT5A4bf9NtHW93CcIdbPNLuzm9vKIAdQ8uxMsFeMxYgPq64APqrzZK3IhT7nec8e45EADoHvPDs4wVQvOICxPb7Nw+dxVDzy2649VUP/DAwxc6+1ejPu3Kgw+EDfGL4fz54uCbChVLs06FOB668vd1d3r8tYDRX7z7e1170/KIWCwDxE9u2euCHgSl2Pt8UBBhuecWjnALcOZl3t4/tXiUAqAoBbAZAPs4ACZuGwDTF0gTYsAwo9xKIrx8jXCjFyr4E4gmsF+fyTW60Y6sH/nRfi48zyY/62zzwidEXj/9iJO/7WDoWxOjjXJ46wL872us+f2eX9yf3tBSAGH2MuXaoy312tLu4IAtHdrokiGAaNM4SYuJfvrvH9zMZC2JMjDFWgK/H9qWOpw/fCgBBCYCgE73N7kJvs29tPwKAQDTNZvdvdxaQgsRaIoj87EB7qgC0PAFgYxJgrKuhIAPOdL8eyOMTUwYsHu/xwOcaYKa/zQPiLAFajtXPuSAQTbOrgx1OuHF4p7u1IgAITzhXHzDV1+rjFwfaPWIBJBLQErAxK0A8PgmQZk4Af36o02cG87u0QhwBpvtafUx9tKUJcCAXbiABFk/0eCDK2QQBrg7mfB8CxBMuNyB9/XCXhwTQA5rIN3riVgDAElD2BKJpZgWYH1q+iY5ROBaAGyljlAE8zaQMuJBv9LCx9WYAu70FAkCYecYCELtxeIfH8kPKlSYAKQ1hSHERgTVVTICJSIA7I3lPmon6zWsk731i+LEA9AHWvXZzxQDkLBSjtQKwRzBfjVuXACKUJIAlLwGUIYy3ApANpCoT0/oXiNEXCxATjo9JaZHCJyYBFAcIoDHaNLlfIJpm7Pwij19MACYoAQACQCgWgPPtz5cEiDdNEU5rLVGtcfyyCcCN9BOIf/3Q8j6wlgCIlSQAhLgp6R5nADGbAVaAuRXCSS1ERVx+LEySANyrZAEs5g7mPHlajmMBWKvKGC0BEcLnppPaA0b+3gOI0ReP5x6frBBOai1RCSARRNzCxkoS4HRXg7PgryvI06YJYDeseNcuN2IB5AtpApScAZlllllmmWWWWWaZZZZZZplllllm/9biFxrrLa7ykoXX37yVsi8+9EImDKxWiwVY7/cFEoASuBWAyu8/qv7+17ZRAtRsBpRrCVRtBsRPfL3Qy1ULyKvOj6/6gsriGlNS8XOjLSYkqISeBo2jumvB22gJIMKxABpTtQJAkHf3FE5UdBGoJ1oR9HGDWooxQO//IapX3hyrn3hJtb+NNlszoOwl8hKAkrstpOi7AsZRaoc4wEcAKtKseWUAvn3nDxjD06fiFCZSKbMCUEmGpL4vkAAqo1GIhfyyGLlVAoigFQAhbQYA+hGAAk2leAeLBeDpiDBpyjcHSnlB2UCleS0BRDhJAASsSgG0PoUC4gUZUFwAWiuARKhaAciCWACR9Vj5FkEZIgEgHwsgohJASwKfOG3VZUCSAOz8EgBf5AG/55CJBVD6WyFqUgC+NYCkfgLxRR5B1hLAihALAMim6b1V8H+JdhMEkIq/MbAIy2Gww6cwZCAvYpC0hNMEUIk+7MaVsiQB7DcG8fcHEgICEsCiVAHe3/VGWQT4C369yqGkS2S+AAAAAElFTkSuQmCC';

export const RendererMixin = {
  _setupPrograms() {
    const gl = this.gl;
    this.terrainProgram = createProgram(gl, TERRAIN_VERTEX_SHADER, TERRAIN_FRAGMENT_SHADER, 'terrain');
    this.skyProgram = createProgram(gl, SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER, 'sky');
    this.lineProgram = createProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER, 'line');
    this.crackProgram = createProgram(gl, CRACK_VERTEX_SHADER, CRACK_FRAGMENT_SHADER, 'crack');
    this.avatarProgram = createProgram(gl, `#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;\nuniform mat4 uViewProjection; uniform vec3 uPlayerPos; uniform vec3 uPartOffset; uniform vec3 uPartScale; uniform float uYaw; uniform float uPartSwing; uniform float uPartPivotY; uniform float uSkinPart; uniform vec2 uMobUV; uniform vec3 uMobBox; uniform float uMobEnabled; uniform vec3 uPartRotation;\nout vec3 vLocalPos; out vec3 vNormal; out float vLight;\nvoid main(){ vec3 p=(aPos-0.5)*uPartScale; float cx=cos(uPartRotation.x),sx=sin(uPartRotation.x),cy=cos(uPartRotation.y),sy=sin(uPartRotation.y),cz=cos(uPartRotation.z),sz=sin(uPartRotation.z); p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx); p=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy); p=vec3(p.x*cz-p.y*sz,p.x*sz+p.y*cz,p.z); p.y+=uPartOffset.y-uPartPivotY; float ca=cos(uPartSwing),sa=sin(uPartSwing); p=vec3(p.x,p.y*ca-p.z*sa,p.y*sa+p.z*ca); p.y-=uPartOffset.y-uPartPivotY; p+=uPartOffset; float c=cos(uYaw), s=sin(uYaw); vec3 r=vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c); vec3 n=vec3(aNormal.x*c-aNormal.z*s,aNormal.y,aNormal.x*s+aNormal.z*c); vLocalPos=aPos; vNormal=aNormal; vLight=0.72+0.28*max(0.0,dot(normalize(n),normalize(vec3(-0.4,0.8,0.5)))); gl_Position=uViewProjection*vec4(uPlayerPos+r,1.0); }`, `#version 300 es\nprecision highp float;\nuniform vec4 uColor; uniform float uSkinPart; uniform float uSkinLayer; uniform sampler2D uSkinTexture; uniform sampler2D uMobTexture; uniform vec2 uMobUV; uniform vec3 uMobBox; uniform vec2 uMobTextureSize; uniform float uMobEnabled; uniform float uItemSprite; uniform vec3 uPartRotation; in vec3 vLocalPos; in vec3 vNormal; in float vLight; out vec4 fragColor;
vec4 skinSample(){
  float x=0.0,y=0.0,w=0.0,h=0.0; vec2 p=vec2(0.0);
  bool front=vNormal.z>0.5, back=vNormal.z< -0.5, right=vNormal.x>0.5, left=vNormal.x< -0.5, top=vNormal.y>0.5;
  // Base skin UVs and the transparent outer clothing layer use the official
  // 64x64 Java skin layout. Part ids: head, body, left arm, right arm,
  // left leg, right leg.
  if(uSkinPart==0.0){
    if(uSkinLayer<0.5){
      if(front){x=8.0;y=8.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,1.0-vLocalPos.y);}
      else if(back){x=24.0;y=8.0;w=8.0;h=8.0;p=vec2(1.0-vLocalPos.x,1.0-vLocalPos.y);}
      else if(right){x=0.0;y=8.0;w=8.0;h=8.0;p=vec2(1.0-vLocalPos.z,1.0-vLocalPos.y);}
      else if(left){x=16.0;y=8.0;w=8.0;h=8.0;p=vec2(vLocalPos.z,1.0-vLocalPos.y);}
      else if(top){x=8.0;y=0.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,vLocalPos.z);}
      else{x=16.0;y=0.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,1.0-vLocalPos.z);}
    } else {
      if(front){x=40.0;y=8.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,1.0-vLocalPos.y);}
      else if(back){x=56.0;y=8.0;w=8.0;h=8.0;p=vec2(1.0-vLocalPos.x,1.0-vLocalPos.y);}
      else if(right){x=32.0;y=8.0;w=8.0;h=8.0;p=vec2(1.0-vLocalPos.z,1.0-vLocalPos.y);}
      else if(left){x=48.0;y=8.0;w=8.0;h=8.0;p=vec2(vLocalPos.z,1.0-vLocalPos.y);}
      else if(top){x=40.0;y=0.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,vLocalPos.z);}
      else{x=48.0;y=0.0;w=8.0;h=8.0;p=vec2(vLocalPos.x,1.0-vLocalPos.z);}
    }
  } else {
    float bx=20.0,by=20.0,bw=8.0;
    if(uSkinPart==1.0){bx=20.0;by=uSkinLayer<0.5?20.0:36.0;bw=8.0;}
    else if(uSkinPart==2.0){bx=uSkinLayer<0.5?36.0:52.0;by=52.0;bw=4.0;}
    else if(uSkinPart==3.0){bx=44.0;by=uSkinLayer<0.5?20.0:36.0;bw=4.0;}
    else if(uSkinPart==4.0){bx=uSkinLayer<0.5?20.0:4.0;by=52.0;bw=4.0;}
    else {bx=4.0;by=uSkinLayer<0.5?20.0:36.0;bw=4.0;}
    if(front){x=bx;y=by;w=bw;h=12.0;p=vec2(vLocalPos.x,1.0-vLocalPos.y);}
    else if(back){x=bx+bw+4.0;y=by;w=bw;h=12.0;p=vec2(1.0-vLocalPos.x,1.0-vLocalPos.y);}
    else if(right){x=bx-4.0;y=by;w=4.0;h=12.0;p=vec2(1.0-vLocalPos.z,1.0-vLocalPos.y);}
    else if(left){x=bx+bw;y=by;w=4.0;h=12.0;p=vec2(vLocalPos.z,1.0-vLocalPos.y);}
    else if(top){x=bx;y=by-4.0;w=bw;h=4.0;p=vec2(vLocalPos.x,vLocalPos.z);}
    else{x=bx+bw;y=by-4.0;w=bw;h=4.0;p=vec2(vLocalPos.x,1.0-vLocalPos.z);}
  }
  vec2 uv=(vec2(x,y)+p*vec2(w,h))/64.0;
  return texture(uSkinTexture,uv);
}
vec4 mobSample(){
  float u=uMobUV.x,v=uMobUV.y,dx=uMobBox.x,dy=uMobBox.y,dz=uMobBox.z;
  float x=0.0,y=0.0,w=0.0,h=0.0; vec2 p=vec2(0.0);
  bool front=vNormal.z>0.5, back=vNormal.z< -0.5, right=vNormal.x>0.5, left=vNormal.x< -0.5, top=vNormal.y>0.5;
  if(front){x=u+dz;y=v+dz;w=dx;h=dy;p=vec2(vLocalPos.x,1.0-vLocalPos.y);}
  else if(back){x=u+dz+dx+dz;y=v+dz;w=dx;h=dy;p=vec2(1.0-vLocalPos.x,1.0-vLocalPos.y);}
  else if(right){x=u;y=v+dz;w=dz;h=dy;p=vec2(1.0-vLocalPos.z,1.0-vLocalPos.y);}
  else if(left){x=u+dz+dx;y=v+dz;w=dz;h=dy;p=vec2(vLocalPos.z,1.0-vLocalPos.y);}
  else if(top){x=u+dz;y=v;w=dx;h=dz;p=vec2(vLocalPos.x,vLocalPos.z);}
  else{x=u+dz+dx;y=v;w=dx;h=dz;p=vec2(vLocalPos.x,1.0-vLocalPos.z);}
  vec2 pixel=vec2(x,y)+p*vec2(w,h);
  return texture(uMobTexture,vec2(pixel.x/uMobTextureSize.x,pixel.y/uMobTextureSize.y));
}
vec4 itemSample(){ vec2 uv; bool front=vNormal.z>0.5, back=vNormal.z< -0.5, right=vNormal.x>0.5, left=vNormal.x< -0.5, top=vNormal.y>0.5; if(front) uv=vec2(vLocalPos.x,1.0-vLocalPos.y); else if(back) uv=vec2(1.0-vLocalPos.x,1.0-vLocalPos.y); else if(right) uv=vec2(1.0-vLocalPos.z,1.0-vLocalPos.y); else if(left) uv=vec2(vLocalPos.z,1.0-vLocalPos.y); else if(top) uv=vec2(vLocalPos.x,vLocalPos.z); else uv=vec2(vLocalPos.x,1.0-vLocalPos.z); return texture(uMobTexture,uv);}
void main(){ vec3 color=uColor.rgb; vec3 cell=floor(vLocalPos*8.0);
  if(uSkinPart>=0.0){ vec4 texel=skinSample(); color=texel.rgb; if(texel.a<0.1) discard; }
  else if(uItemSprite>0.5){ if(abs(vNormal.z)<0.5) discard; vec4 texel=itemSample(); color=texel.rgb; if(texel.a<0.1) discard; }
  else if(uMobEnabled>0.5){ vec4 texel=mobSample(); color=texel.rgb*uColor.rgb; if(texel.a<0.1) discard; }
  else { float patchValue=mod(cell.x*3.0+cell.y*5.0+cell.z*7.0,11.0); color*=mix(0.80,1.08,step(3.0,patchValue)); }
  float pixel=0.94+mod(cell.x+cell.y+cell.z,2.0)*0.06; fragColor=vec4(color*vLight*pixel,uColor.a);
}`, 'player avatar');
    this.avatarSkinTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.avatarSkinTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const skinImage = new Image();
    skinImage.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, this.avatarSkinTexture);
      // Skin UV coordinates are authored from the PNG's top-left origin.
      // Keep the browser image rows unflipped so those 64x64 atlas regions
      // sample the intended head/body/limb pixels.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skinImage);
    };
    skinImage.src = PLAYER_SKIN_DATA_URL;
    this.droppedItemTextures = new Map();
    this.heldItemTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.heldItemTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.heldItemTextureId = null;
    this.heldItemTextureReady = false;
    this.mobTextures = new Map();
    this.mobFallbackTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mobFallbackTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    for (const [type,file] of Object.entries(MOB_TEXTURE_FILES)) {
      const texture=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      this.mobTextures.set(type,{texture,width:64,height:32,ready:false});
      const image=new Image();
      image.onload=()=>{
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.mobTextures.set(type,{texture,width:image.naturalWidth,height:image.naturalHeight,ready:true});
      };
      image.src=new URL('../../assets/mob-textures/'+file,import.meta.url).href;
    }

    // Compose the vanilla villager base skin with its profession overlay. This
    // keeps career clothing distinct without downloading a whole duplicate skin
    // for every career.
    const baseVillager = new Image();
    baseVillager.onload = () => {
      for (const career of VILLAGER_CAREER_TEXTURES) {
        const overlay = new Image();
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        this.mobTextures.set('villager_' + career, { texture, width: 64, height: 64, ready: false });
        overlay.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = baseVillager.naturalWidth;
          canvas.height = baseVillager.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) return;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(baseVillager, 0, 0);
          context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
          this.mobTextures.set('villager_' + career, { texture, width: canvas.width, height: canvas.height, ready: true });
        };
        overlay.onerror = () => this.mobTextures.delete('villager_' + career);
        overlay.src = new URL('../../assets/mob-textures/villager_' + career + '.png', import.meta.url).href;
      }
    };
    baseVillager.src = new URL('../../assets/mob-textures/villager.png', import.meta.url).href;
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(256 * 3), gl.DYNAMIC_DRAW);
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
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);

    this.viewProjection = mat4.create();
    this.projection = mat4.create();
    this.view = mat4.create();
  },

  _render() {
    const gl = this.gl;
    const player = this.player;
    const feedback = this.damageFeedback || 0;
    if (this.canvas?.style) {
      this.canvas.style.boxShadow = feedback > 0.015
        ? `inset 0 0 ${Math.round(34 * feedback)}px rgba(210, 24, 24, ${0.13 * feedback})`
        : '';
      const shake = feedback > 0.04 ? Math.sin(feedback * 92) * feedback * 0.55 : 0;
      this.canvas.style.transform = shake ? `translate3d(${shake.toFixed(2)}px, 0, 0)` : '';
    }
    if (feedback > 0) this.damageFeedback = Math.max(0, feedback - 0.055);
    if (!this.world || !player) {
      gl.clearColor(0.05, 0.05, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return;
    }

    // Interpolate the camera between fixed 20 TPS physics states. Without
    // this, a 60/120 Hz display still shows only 20 distinct movement steps.
    const alpha = Math.max(0, Math.min(1, this.accumulator / MS_PER_TICK));
    const px = Number.isFinite(player.prevX) ? player.prevX : player.x;
    const py = Number.isFinite(player.prevY) ? player.prevY : player.y;
    const pz = Number.isFinite(player.prevZ) ? player.prevZ : player.z;
    this.renderPosition ||= { x: player.x, y: player.y, z: player.z };
    this.renderPosition.x = px + (player.x - px) * alpha;
    this.renderPosition.y = py + (player.y - py) * alpha;
    this.renderPosition.z = pz + (player.z - pz) * alpha;

    const daylight = this.daylight;
    const fogColor = this._fogColor;   // reused; was a fresh array every frame
    if (this.world.dimension === 'nether') {
      // Nether fog and the distant sky keep the characteristic warm crimson haze.
      fogColor[0] = 0.34;
      fogColor[1] = 0.055;
      fogColor[2] = 0.035;
    } else {
      fogColor[0] = 0.55 * daylight + 0.03;
      fogColor[1] = 0.68 * daylight + 0.03;
      fogColor[2] = 0.92 * daylight + 0.06;
    }

    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const fov = ((this.fieldOfView ?? RENDER.DEFAULT_FOV) + (player.sprinting ? RENDER.SPRINT_FOV_BONUS : 0)) * Math.PI / 180;
    const far = Math.max(64, this.renderDistance * 16 + 64);

    // Keep the near plane away from the camera to preserve depth-buffer precision.
    // A 0.05 plane wastes precision at normal block distances and can amplify z-fighting.
    mat4.perspective(this.projection, fov, aspect, 0.2, far);
    let cameraX = this.renderPosition.x;
    let cameraY = this.renderPosition.y + player.eyeHeight + (player.ridingHorse ? 1.15 : 0);
    let cameraZ = this.renderPosition.z;
    let cameraYaw = player.yaw;
    let cameraPitch = player.pitch;
    if (this.thirdPerson) {
      const yaw = player.yaw * Math.PI / 180;
      const pitch = player.pitch * Math.PI / 180;
      let distance = 4.2;
      const obstruction = raycast(this.world, this.renderPosition.x, this.renderPosition.y + player.eyeHeight + 0.8, this.renderPosition.z,
        (player.yaw + 180) % 360, -player.pitch, distance);
      if (obstruction) {
        const hitDistance = Math.hypot(obstruction.x + 0.5 - this.renderPosition.x,
          obstruction.y + 0.5 - (this.renderPosition.y + player.eyeHeight + 0.8), obstruction.z + 0.5 - this.renderPosition.z);
        distance = Math.max(0.35, Math.min(distance, hitDistance - 0.8));
      }
      const frontView = !!this.frontThirdPerson;
      const cameraSide = frontView ? -1 : 1;
      cameraX += cameraSide * Math.sin(yaw) * Math.cos(pitch) * distance;
      cameraY += (frontView ? -Math.sin(pitch) : Math.sin(pitch)) * distance + 0.8;
      cameraZ -= cameraSide * Math.cos(yaw) * Math.cos(pitch) * distance;
      if (frontView) {
        cameraYaw = (player.yaw + 180) % 360;
        cameraPitch = -player.pitch;
      }
    }
    mat4.fromCamera(this.view, cameraX, cameraY, cameraZ, cameraYaw, cameraPitch);
    mat4.multiply(this.viewProjection, this.projection, this.view);
    this.frustum.update(this.viewProjection);

    this._drawSky(daylight);

    this.chunkRenderer.update(this.world, this.renderPosition.x, this.renderPosition.z, 6, this.frustum);
    this._drawTerrain(daylight, fogColor, far);
    this._drawPlayers();
    this._updateRemotePlayerTags();
    this._drawSelection();
    this._drawFishing();

    const creativeHud = this.player?.gamemode !== 'survival';
    document.getElementById('health')?.classList.toggle('hidden', creativeHud);
    document.getElementById('food')?.classList.toggle('hidden', creativeHud);
    document.getElementById('armor')?.classList.toggle('hidden', creativeHud);
    document.getElementById('xpbar')?.classList.toggle('hidden', creativeHud);
    document.getElementById('xp-level')?.classList.toggle('hidden', creativeHud);
    const xpFill = document.getElementById('xpbar-fill');
    if (xpFill) xpFill.style.width = `${Math.max(0, Math.min(1, this.player.experience?.progress ?? 0)) * 100}%`;
    const xpLevel = document.getElementById('xp-level');
    if (xpLevel) xpLevel.textContent = (this.player.experience?.level ?? 0) > 0 ? String(this.player.experience.level) : '';

    const health = document.getElementById('health');
    if (health) renderBar(health, this.player.health, 'heart');
    const armor = document.getElementById('armor');
    if (armor) {
      let points = 0;
      for (let slot = 36; slot <= 39; slot++) {
        const stack = this.inventory.get(slot);
        if (!stack.isEmpty) points += stack.item.armorPoints || 0;
      }
      armor.textContent = points > 0 ? '◆'.repeat(Math.ceil(points / 2)) : '';
      armor.title = `Armour ${points}/20`;
    }
    const food = document.getElementById('food');
    if (food) {
      renderBar(food, this.player.vitals.food, 'food');
      food.title = `Food ${this.player.vitals.food}/20 · saturation ${this.player.vitals.saturation.toFixed(1)}`;
    }
    const air = document.getElementById('air');
    if (air) {
      const bubbles = Math.ceil(Math.max(0, Math.min(300, this.player.air ?? 300)) / 30);
      air.textContent = bubbles < 10 ? '◉'.repeat(bubbles) + '·'.repeat(10 - bubbles) : '';
      air.classList.toggle('hidden', !this.player.underwater);
      air.title = `Air ${this.player.air ?? 300}/300`;
    }
    document.getElementById('underwater-overlay')?.classList.toggle('hidden', !this.player.underwater);
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
    // Keep a readable deep-blue night and warm dawn/dusk rather than
    // multiplying the entire sky to black whenever daylight approaches zero.
    const nether = this.world?.dimension === 'nether';
    const nightTop = nether ? [0.20, 0.018, 0.025] : [0.012, 0.022, 0.060];
    const dayTop = nether ? [0.48, 0.045, 0.035] : [0.24, 0.46, 0.88];
    const nightHorizon = nether ? [0.34, 0.035, 0.025] : [0.035, 0.045, 0.085];
    const dayHorizon = nether ? [0.72, 0.12, 0.055] : [0.68, 0.79, 0.94];
    const blend = (a, b) => a.map((value, i) => value + (b[i] - value) * daylight);
    const top = blend(nightTop, dayTop), horizon = blend(nightHorizon, dayHorizon);
    const dusk = Math.max(0, 1 - Math.abs(daylight - 0.22) / 0.22);
    horizon[0] += dusk * 0.12; horizon[1] += dusk * 0.035;
    gl.uniform3f(uniforms.uTopColor, ...top);
    gl.uniform3f(uniforms.uHorizonColor, ...horizon);
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
    gl.uniform3f(uniforms.uCameraPos, this.renderPosition.x, this.renderPosition.y + player.eyeHeight, this.renderPosition.z);
    gl.uniform1f(uniforms.uDaylight, daylight);
    gl.uniform3f(uniforms.uFogColor, fogColor[0], fogColor[1], fogColor[2]);
    gl.uniform1f(uniforms.uFogStart, far * 0.55);
    gl.uniform1f(uniforms.uFogEnd, far * 0.95);

    // Water tint is stable; grass and leaves follow the chunk's surface biome.
    gl.uniform3f(uniforms.uWaterColor, 0.25, 0.46, 0.9);
    // Multipliers are applied only to green pixels of the grass texture.
    // The brown dirt pixels on grass-block sides are left untouched in the shader.
    const tintByBiome = {
      'mc:swampland': [[0.32, 0.60, 0.22], [0.34, 0.45, 0.19]],
      'mc:jungle': [[0.30, 0.74, 0.22], [0.34, 0.63, 0.22]],
      'mc:sparse_jungle': [[0.34, 0.72, 0.24], [0.38, 0.62, 0.24]],
      'mc:bamboo_jungle': [[0.30, 0.72, 0.20], [0.32, 0.60, 0.20]],
      // Savanna alone gets a subtle warm yellow-green, never pale or grey.
      'mc:savanna': [[0.48, 0.70, 0.25], [0.62, 0.64, 0.27]],
      'mc:savanna_plateau': [[0.48, 0.70, 0.25], [0.60, 0.62, 0.26]],
      'mc:shattered_savanna': [[0.50, 0.68, 0.24], [0.65, 0.62, 0.25]],
      'mc:birch_forest': [[0.38, 0.70, 0.26], [0.49, 0.66, 0.30]],
      'mc:tall_birch_forest': [[0.38, 0.70, 0.26], [0.49, 0.66, 0.30]],
      'mc:birch_forest_hills': [[0.38, 0.70, 0.26], [0.49, 0.66, 0.30]],
      'mc:taiga': [[0.28, 0.54, 0.19], [0.24, 0.39, 0.17]],
      'mc:taiga_hills': [[0.28, 0.54, 0.19], [0.24, 0.39, 0.17]],
      'mc:cold_taiga': [[0.32, 0.59, 0.22], [0.38, 0.49, 0.30]],
      'mc:cold_taiga_hills': [[0.32, 0.59, 0.22], [0.38, 0.49, 0.30]],
      'mc:snowy_taiga': [[0.35, 0.61, 0.24], [0.43, 0.54, 0.34]],
      'mc:mega_taiga': [[0.26, 0.50, 0.18], [0.25, 0.36, 0.16]],
      'mc:giant_spruce_taiga': [[0.26, 0.50, 0.18], [0.25, 0.36, 0.16]],
      'mc:roofed_forest': [[0.30, 0.58, 0.20], [0.28, 0.39, 0.17]],
    };
    // Plains and all ordinary biomes use a full, natural Minecraft grass green.
    // Only savanna receives a slight warm/yellow shift.
    const defaultTint = [[0.34, 0.72, 0.22], [0.34, 0.72, 0.22]];
    const grassColorFor = (biome) => (tintByBiome[biome] || defaultTint)[0];
    const setOrigin = (x, y, z, biome, grassBiomes = null) => {
      gl.uniform3f(uniforms.uChunkOrigin, x, y, z);
      const corners = grassBiomes || [biome, biome, biome, biome];
      const colors = corners.map(grassColorFor);
      gl.uniform3f(uniforms.uGrassColor00, ...colors[0]);
      gl.uniform3f(uniforms.uGrassColor10, ...colors[1]);
      gl.uniform3f(uniforms.uGrassColor01, ...colors[2]);
      gl.uniform3f(uniforms.uGrassColor11, ...colors[3]);
      const [, foliage] = tintByBiome[biome] || defaultTint;
      gl.uniform3f(uniforms.uFoliageColor, foliage[0], foliage[1], foliage[2]);
      const leaves = SNOWY_LEAF_BIOMES.has(biome) ? [0.96, 0.98, 1.0] : foliage;
      gl.uniform3f(uniforms.uLeavesColor, leaves[0], leaves[1], leaves[2]);
    };

    // Opaque and cutout share a pass: both write depth and use alpha testing,
    // so no sorting is needed between them.
    gl.uniform1f(uniforms.uAlphaCutoff, 0.5);
    gl.disable(gl.BLEND);
    this.chunkRenderer.draw('opaque', this.frustum,
      { cameraX: this.renderPosition.x, cameraZ: this.renderPosition.z }, setOrigin);

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
    // The title panorama is a world preview, not a gameplay camera. Never
    // render the saved first/third-person avatar or multiplayer avatars here.
    if (this._titlePreviewActive || this.titlePreviewActive) {
      const heldView = document.getElementById('held-item-view');
      heldView?.classList.add('hidden');
      if (heldView) heldView.removeAttribute('src');
      return;
    }
    const gl = this.gl;
    const { program, uniforms } = this.avatarProgram;
    const human = [
      [[0, 1.55, 0], [0.50, 0.50, 0.50], [0.72, 0.48, 0.32, 1]],
      [[0, 1.00, 0], [0.50, 0.75, 0.25], [0.12, 0.48, 0.72, 1]],
      [[-0.375, 1.00, 0], [0.25, 0.75, 0.25], [0.12, 0.48, 0.72, 1]],
      [[0.375, 1.00, 0], [0.25, 0.75, 0.25], [0.12, 0.48, 0.72, 1]],
      [[-0.125, 0.375, 0], [0.25, 0.75, 0.25], [0.16, 0.24, 0.48, 1]],
      [[0.125, 0.375, 0], [0.25, 0.75, 0.25], [0.16, 0.24, 0.48, 1]],
    ];
    const zombie = human.map(([o, size, color], i) => [
      o, size, i === 0 || i === 2 || i === 3 ? [0.28, 0.62, 0.25, 1] :
        i === 1 ? [0.12, 0.34, 0.20, 1] : [0.12, 0.22, 0.58, 1],
    ]);
    const sheep = [
      [[0, 0.83, 0], [0.82, 0.72, 1.05], [0.88, 0.86, 0.78, 1]],
      [[0, 1.13, 0.58], [0.42, 0.42, 0.42], [0.82, 0.72, 0.62, 1]],
      [[-0.25, 0.28, -0.32], [0.18, 0.56, 0.18], [0.38, 0.34, 0.30, 1]],
      [[0.25, 0.28, -0.32], [0.18, 0.56, 0.18], [0.38, 0.34, 0.30, 1]],
      [[-0.25, 0.28, 0.32], [0.18, 0.56, 0.18], [0.38, 0.34, 0.30, 1]],
      [[0.25, 0.28, 0.32], [0.18, 0.56, 0.18], [0.38, 0.34, 0.30, 1]],
      [[-0.11, 1.20, 0.79], [0.045, 0.055, 0.025], [0.08, 0.06, 0.05, 1]],
      [[0.11, 1.20, 0.79], [0.045, 0.055, 0.025], [0.08, 0.06, 0.05, 1]],
      [[0, 1.02, 0.80], [0.16, 0.10, 0.035], [0.72, 0.42, 0.40, 1]],
    ];
    const pig = [
      [[0, 0.72, 0], [0.72, 0.58, 1.0], [0.88, 0.48, 0.55, 1]],
      [[0, 0.94, 0.53], [0.44, 0.42, 0.42], [0.90, 0.57, 0.62, 1]],
      [[0, 0.88, 0.78], [0.24, 0.20, 0.12], [0.68, 0.30, 0.38, 1]],
      [[-0.23, 0.25, -0.32], [0.18, 0.48, 0.18], [0.48, 0.32, 0.36, 1]],
      [[0.23, 0.25, -0.32], [0.18, 0.48, 0.18], [0.48, 0.32, 0.36, 1]],
      [[-0.23, 0.25, 0.32], [0.18, 0.48, 0.18], [0.48, 0.32, 0.36, 1]],
      [[0.23, 0.25, 0.32], [0.18, 0.48, 0.18], [0.48, 0.32, 0.36, 1]],
      [[-0.11, 1.04, 0.735], [0.05, 0.055, 0.025], [0.08, 0.04, 0.04, 1]],
      [[0.11, 1.04, 0.735], [0.05, 0.055, 0.025], [0.08, 0.04, 0.04, 1]],
      [[-0.055, 0.89, 0.845], [0.035, 0.045, 0.018], [0.22, 0.08, 0.10, 1]],
      [[0.055, 0.89, 0.845], [0.035, 0.045, 0.018], [0.22, 0.08, 0.10, 1]],
    ];
    const cow = [
      [[0, 0.78, 0], [0.86, 0.82, 1.12], [0.42, 0.28, 0.18, 1]],
      [[0, 1.08, 0.62], [0.48, 0.48, 0.46], [0.48, 0.32, 0.22, 1]],
      [[-0.26, 0.30, -0.34], [0.18, 0.58, 0.18], [0.30, 0.22, 0.14, 1]],
      [[0.26, 0.30, -0.34], [0.18, 0.58, 0.18], [0.30, 0.22, 0.14, 1]],
      [[-0.26, 0.30, 0.34], [0.18, 0.58, 0.18], [0.30, 0.22, 0.14, 1]],
      [[0.26, 0.30, 0.34], [0.18, 0.58, 0.18], [0.30, 0.22, 0.14, 1]],
      [[-0.29, 1.22, 0.57], [0.12, 0.12, 0.22], [0.82, 0.78, 0.68, 1]],
      [[0.29, 1.22, 0.57], [0.12, 0.12, 0.22], [0.82, 0.78, 0.68, 1]],
    ];
    const creeper = [
      [[0, 0.82, 0], [0.58, 1.02, 0.58], [0.20, 0.62, 0.18, 1]],
      [[0, 1.55, 0.02], [0.62, 0.62, 0.62], [0.22, 0.66, 0.20, 1]],
      [[-0.19, 0.24, -0.18], [0.22, 0.48, 0.22], [0.16, 0.52, 0.15, 1]],
      [[0.19, 0.24, -0.18], [0.22, 0.48, 0.22], [0.16, 0.52, 0.15, 1]],
      [[-0.19, 0.24, 0.18], [0.22, 0.48, 0.22], [0.16, 0.52, 0.15, 1]],
      [[0.19, 0.24, 0.18], [0.22, 0.48, 0.22], [0.16, 0.52, 0.15, 1]],
      [[-0.15, 1.65, 0.34], [0.12, 0.12, 0.035], [0.04, 0.08, 0.04, 1]],
      [[0.15, 1.65, 0.34], [0.12, 0.12, 0.035], [0.04, 0.08, 0.04, 1]],
      [[0, 1.42, 0.35], [0.12, 0.22, 0.035], [0.04, 0.08, 0.04, 1]],
    ];
    const skeleton = human.map(([o, size], i) => [
      o, size, i === 0 ? [0.82, 0.82, 0.76, 1] : i === 1 ? [0.78, 0.78, 0.72, 1] : [0.88, 0.87, 0.80, 1],
    ]);
    const enderman = [
      [[0, 2.42, 0], [0.30, 0.48, 0.30], [0.08, 0.07, 0.12, 1]],
      [[0, 1.52, 0], [0.38, 1.30, 0.25], [0.09, 0.08, 0.13, 1]],
      [[-0.30, 1.55, 0], [0.14, 1.28, 0.14], [0.08, 0.07, 0.12, 1]],
      [[0.30, 1.55, 0], [0.14, 1.28, 0.14], [0.08, 0.07, 0.12, 1]],
      [[-0.11, 0.38, 0], [0.15, 0.76, 0.16], [0.07, 0.06, 0.11, 1]],
      [[0.11, 0.38, 0], [0.15, 0.76, 0.16], [0.07, 0.06, 0.11, 1]],
      [[-0.105, 2.44, 0.16], [0.08, 0.045, 0.035], [0.92, 0.12, 0.30, 1]],
      [[0.105, 2.44, 0.16], [0.08, 0.045, 0.035], [0.92, 0.12, 0.30, 1]],
    ];
    const spider = [
      [[0, 0.52, 0], [0.72, 0.42, 0.82], [0.12, 0.10, 0.09, 1]],
      [[0, 0.68, 0.48], [0.48, 0.40, 0.48], [0.16, 0.12, 0.10, 1]],
      [[-0.13, 0.76, 0.73], [0.07, 0.07, 0.035], [0.88, 0.12, 0.08, 1]],
      [[0.13, 0.76, 0.73], [0.07, 0.07, 0.035], [0.88, 0.12, 0.08, 1]],
      ...[-1, 1].flatMap(side => [-1, 1, 2, 3].map((n) => [
        [side * (0.32 + (n % 2) * 0.08), 0.43, (n - 1.5) * 0.23],
        [0.52, 0.09, 0.09], [0.10, 0.08, 0.07, 1],
      ])),
    ];
    const chicken = [
      [[0, 0.62, 0], [0.52, 0.62, 0.58], [0.91, 0.90, 0.82, 1]],
      [[0, 1.00, 0.28], [0.34, 0.34, 0.34], [0.94, 0.92, 0.86, 1]],
      [[0, 0.95, 0.49], [0.24, 0.12, 0.18], [0.88, 0.24, 0.12, 1]],
      [[0, 0.77, 0.55], [0.12, 0.08, 0.12], [0.96, 0.65, 0.12, 1]],
      [[-0.16, 0.20, -0.12], [0.10, 0.38, 0.10], [0.91, 0.72, 0.22, 1]],
      [[0.16, 0.20, -0.12], [0.10, 0.38, 0.10], [0.91, 0.72, 0.22, 1]],
    ];
    const draw = (x, y, z, yaw, parts, walkPhase = 0, legStart = -1, legEnd = -1, pulse = 1, pose = {}, skin = false) => {
      gl.uniform3f(uniforms.uPlayerPos, x, y, z);
      gl.uniform1f(uniforms.uYaw, yaw);
      const mobTexture = pose.itemSprite ? { texture: pose.itemTexture ?? this.heldItemTexture, width: 16, height: 16, ready: pose.itemReady ?? this.heldItemTextureReady } : !skin && pose.mobTextureKey ? this.mobTextures?.get(pose.mobTextureKey) : !skin && pose.mobType ? this.mobTextures?.get(pose.mobType) : null;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, mobTexture?.texture ?? this.mobFallbackTexture);
      gl.uniform1i(uniforms.uMobTexture, 2);
      gl.uniform2f(uniforms.uMobTextureSize, mobTexture?.width ?? 64, mobTexture?.height ?? 32);
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const [offset, scale, color, partUv, partBox, partRotation, partName, partPivotY] = parts[partIndex];
        const isArm = skin && (partIndex === 2 || partIndex === 3);
        const isLeg = skin && (partIndex === 4 || partIndex === 5);
        // Steve's opposite arm/leg pairs swing against each other, as in
        // the classic Minecraft walk cycle.
        const phase = /left/i.test(partName ?? '') ? 0 : /right/i.test(partName ?? '') ? Math.PI : (partIndex === 2 || partIndex === 5) ? Math.PI : 0;
        let swing = pose.itemModel ? (pose.itemSwing ?? 0) : 0;
        const partOffset = offset.slice();
        if (skin && !pose.firstPerson) {
          const moving = pose.walking ? 1 : 0;
          const stride = Math.sin(walkPhase);
          const bob = Math.abs(Math.cos(walkPhase * 2)) * 0.035 * moving;
          if (partIndex === 0) {
            partOffset[1] += bob + Math.sin(walkPhase * 0.5) * 0.008;
          } else if (partIndex === 1) {
            partOffset[1] += bob * 0.65;
            partOffset[2] += stride * 0.012 * moving;
          }
        }
        if (pose.sneaking && !pose.firstPerson) {
          if (partIndex === 0 || partIndex === 1) partOffset[1] -= 0.09;
          else if (isArm) partOffset[1] -= 0.06;
        }
        let pivotY = Number.isFinite(partPivotY) ? partPivotY : partOffset[1];
        if (isArm || isLeg) {
          // First-person arm rotates around the shoulder (top of the cuboid),
          // not its centre/wrist; this sends the fist forward instead of down.
          pivotY = pose.firstPerson ? offset[1] + scale[1] * 0.5 : isArm ? (pose.sneaking ? 1.30 : 1.375) : (pose.sneaking ? 0.70 : 0.75);
          if (pose.firstPerson) {
            // Blend from the resting pose into a forward punch and back. attackTime
            // counts down from 8 ticks; the previous fixed -2.5 rad pose flipped
            // the arm past 180 degrees, exposing its back face to the camera.
            const attackProgress = Math.max(0, Math.min(1, (8 - (pose.attackTime ?? 0)) / 8));
            // Port of ambient's Java 1.7 first-person attack curve:
            // sin(pow(attack_time, 0.45) * 180 degrees) * -56 degrees.
            // The Bedrock expression is translated to this renderer's radians
            // and its 8-tick countdown is normalised to the pack's 0..1 timer.
            const attackPhase = Math.pow(attackProgress, 0.45) * Math.PI;
            const attackSwing = Math.sin(attackPhase) * (-56 * Math.PI / 180);
            swing = pose.attack ? attackSwing
              : pose.bowDraw ? -1.18
              : pose.crossbowLoad ? -0.82
              : pose.tridentCharge ? -1.42
              : pose.swimming ? Math.sin(walkPhase * 1.7) * 0.68
              : pose.airborne ? (pose.jumping ? -0.42 : -0.10)
              : pose.sneaking ? -0.30
              : -0.42;
          }
          else if (pose.attack && isArm && partIndex === 3) {
            const attackProgress = Math.max(0, Math.min(1, (8 - (pose.attackTime ?? 0)) / 8));
            swing = -1.45 * Math.sin(attackProgress * Math.PI);
          }
          // Swimming must be resolved before the generic airborne pose:
          // a player in water is usually not grounded, but should use the
          // alternating swim stroke rather than the jump/fall limb pose.
          else if (pose.swimming) {
            const swimPose = bedrockHumanoidPose(pose, walkPhase);
            if (isArm) swing = partIndex === 2 ? swimPose.leftArm : swimPose.rightArm;
            else swing = partIndex === 4 ? swimPose.leftLeg : swimPose.rightLeg;
          }
          else if (pose.airborne) swing = isArm ? (pose.jumping ? -0.72 : -0.18) : (pose.jumping ? 0.58 : 0.22);
          else {
            const humanoid = bedrockHumanoidPose(pose, walkPhase);
            if (isArm) swing = partIndex === 2 ? humanoid.leftArm : humanoid.rightArm;
            else swing = partIndex === 4 ? humanoid.leftLeg : humanoid.rightLeg;
          }
          // First-person attack swing is already applied above; do not add a second rotation.
        } else if (!skin && pose.vanillaModel && /head/i.test(partName ?? '')) {
          swing = Math.sin(pose.idle ?? 0) * 0.045 + (pose.walking ? Math.sin(walkPhase * 0.5) * 0.025 : 0);
        } else if (!skin && pose.humanoid && (pose.vanillaModel ? /arm/i.test(partName ?? '') : (pose.mobType === 'villager' ? partIndex === 3 : (partIndex === 2 || partIndex === 3)))) {
          // Fallback humanoid arrays follow head/body/left-arm/right-arm/legs.
          // The old 3/4 test animated the right arm and left leg as if both were arms.
          const left = /left/i.test(partName ?? '') || (!/right/i.test(partName ?? '') && partIndex === 2);
          const gait = Math.sin(walkPhase) * (pose.sprinting ? 0.92 : 0.58);
          swing = pose.walking ? gait * (left ? 1 : -1) : 0;
          if (pose.attack && !left) swing -= 0.9;
          if (pose.riding) swing = -0.35;
        } else if (!skin && pose.vanillaModel && /leg|foot/i.test(partName ?? '')) {
          const left = /left/i.test(partName ?? '') || (!/right/i.test(partName ?? '') && partIndex % 2 === 0);
          const gait = Math.sin(walkPhase) * (pose.sprinting ? 0.72 : 0.48);
          swing = pose.walking ? gait * (left ? 1 : -1) : 0;
          if (pose.riding) swing = -0.82;
          if (pose.swimming) swing = Math.sin(walkPhase * 1.7 + (left ? Math.PI : 0)) * 0.42;
        } else if (!skin && pose.vanillaModel && /wing/i.test(partName ?? '')) {
          const flying = ['bee','bat','parrot','chicken','phantom','ender_dragon'].includes(pose.mobType);
          swing = flying ? Math.sin((pose.idle ?? 0) * (pose.mobType === 'bee' ? 3.2 : 2.4)) * (pose.mobType === 'bee' ? 0.48 : 0.34) : 0;
        } else if (!skin && (pose.mobType === 'spider' || pose.mobType === 'cave_spider')) {
          if (partIndex >= 4) {
            const leg = partIndex - 4;
            const side = leg % 2 === 0 ? 1 : -1;
            const pair = Math.floor(leg / 2);
            swing = pose.walking ? Math.sin(walkPhase + (pair % 2 ? Math.PI : 0)) * 0.34 * side : Math.sin((pose.idle ?? 0) * 0.8 + pair) * 0.025;
          }
        } else if (!skin && pose.mobType === 'bee' && !pose.vanillaModel && (partIndex === 2 || partIndex === 3)) {
          swing = Math.sin((pose.idle ?? 0) * 3.2 + (partIndex === 2 ? 0 : Math.PI)) * 0.48;
          partOffset[1] += Math.sin((pose.idle ?? 0) * 3.2) * 0.025;
        } else if (!skin && pose.animal && partIndex === 0) {
          // Body bob only follows actual movement; breathing remains subtle at rest.
          const stride = pose.walking ? Math.abs(Math.sin(walkPhase * 2)) : 0;
          partOffset[1] += stride * 0.025 + Math.sin(pose.idle ?? 0) * 0.003;
          swing = pose.walking ? Math.sin(walkPhase * 2) * 0.025 : 0;
        } else if (!skin && pose.animal && partIndex === 1) {
          // Gentle head look while idle; slight counter-motion while walking.
          swing = Math.sin(pose.idle ?? 0) * 0.075 + (pose.walking ? Math.sin(walkPhase * 0.5) * 0.035 : 0);
          partOffset[2] += Math.sin((pose.idle ?? 0) * 0.7) * 0.012;
        } else if (!skin && pose.humanoid && (partIndex === 2 || partIndex === 3)) {
          swing = Math.sin(walkPhase + phase) * 0.34;
        } else if (!skin && partIndex >= legStart && partIndex <= legEnd) {
          swing = pose.walking ? Math.sin(walkPhase + phase) * (pose.animal ? 0.34 : 0.24) : 0;
        }
        gl.uniform3f(uniforms.uPartOffset, partOffset[0], partOffset[1], partOffset[2]);
        gl.uniform3f(uniforms.uPartScale, scale[0] * pulse, scale[1] * pulse, scale[2] * pulse);
        gl.uniform1f(uniforms.uPartSwing, swing);
        gl.uniform3f(uniforms.uPartRotation, partRotation?.[0] ?? 0, partRotation?.[1] ?? 0, partRotation?.[2] ?? 0);
        gl.uniform1f(uniforms.uPartPivotY, pivotY);
        gl.uniform1f(uniforms.uSkinPart, skin ? partIndex : -1);
        gl.uniform1f(uniforms.uSkinLayer, pose.skinLayer ? 1 : 0);
        // The old cuboid rig is not a vanilla geometry match. Apply the
        // real mob skin only to its corresponding torso/head (and pig snout)
        // UV islands; never project a face onto the legs.
        const mobUv = mobTexture?.ready && partUv ? [partUv[0], partUv[1], ...(partBox ?? [1, 1, 1])] : mobTexture?.ready && !pose.vanillaModel ? MOB_UV[pose.mobType]?.[partIndex] : null;
        gl.uniform1f(uniforms.uMobEnabled, mobUv && !pose.itemSprite ? 1.0 : 0.0);
        gl.uniform1f(uniforms.uItemSprite, pose.itemSprite && mobTexture?.ready ? 1.0 : 0.0);
        gl.uniform2f(uniforms.uMobUV, mobUv?.[0] ?? 0, mobUv?.[1] ?? 0);
        gl.uniform3f(uniforms.uMobBox, mobUv?.[2] ?? 1, mobUv?.[3] ?? 1, mobUv?.[4] ?? 1);
        if (pose.hurt) {
          const flash = 0.42;
          gl.uniform4f(uniforms.uColor,
            color[0] + (1 - color[0]) * flash,
            color[1] * (1 - flash * 0.45),
            color[2] * (1 - flash * 0.45), color[3]);
        } else {
          gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3]);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 36);
      }
    };

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.avatarSkinTexture);
    gl.uniform1i(uniforms.uSkinTexture, 1);
    gl.bindVertexArray(this.avatarVao);
    // Shared geometry for the transparent second skin layer.
    const outerHuman = human.map(([offset, size, color], index) => [
      offset,
      size.map((value) => value + (index === 0 ? 0.035 : 0.025)),
      color,
    ]);
    // Clouds and the sun are intentionally disabled. Keep the world clock
    // only for the moon's night/day visibility.
    const skyTime = ((this.world?.time ?? 0) % 24000 + 24000) % 24000;
    const skyAngle = skyTime / 24000 * Math.PI * 2;
    const sunX = Math.sin(skyAngle) * 118;
    const moonX = -sunX, moonY = 48 - Math.sin(skyAngle) * 76, moonZ = Math.cos(skyAngle) * 118;
    if (moonY > 0) {
      const moonRows = ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'];
      const moonParts = [];
      for (let row = 0; row < moonRows.length; row++) {
        for (let col = 0; col < moonRows[row].length; col++) {
          if (moonRows[row][col] !== '#') continue;
          if (col >= 4 && row >= 1 && row <= 6) continue;
          moonParts.push([[col - 4, 3.5 - row, 0], [0.95, 0.95, 0.42], [0.78, 0.84, 0.96, 1]]);
        }
      }
      draw(this.renderPosition.x + moonX, moonY, this.renderPosition.z + moonZ, 0,
        moonParts, 0, -1, -1, 1, {});
    }

    // Dropped stacks use the exact inventory icon for their item, not a generic cube.
    for (const drop of this.entities?.droppedItems ?? []) {
      const id = drop.stack?.item?.id;
      const icon = id ? this.ui.icons.get(id) : null;
      if (!icon) continue;
      let entry = this.droppedItemTextures.get(id);
      if (!entry) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        entry = { texture, ready: false };
        this.droppedItemTextures.set(id, entry);
        const image = new Image();
        image.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          entry.ready = true;
        };
        image.src = icon;
      }
      if (!entry.ready) continue;
      const isBlock = !!drop.stack.item.block;
      const size = isBlock ? [0.46,0.46,0.012] : /sword|pickaxe|axe|shovel|hoe/.test(id) ? [0.24,0.56,0.012] : [0.40,0.40,0.012];
      const phase = drop.spin ?? (drop.age || 0) * 0.08;
      draw(drop.x, drop.y + 0.08, drop.z, phase, [
        [[0,0,0],size,[1,1,1,1]],
      ], 0, -1, -1, 1, { itemModel: true, itemSprite: true, itemTexture: entry.texture, itemReady: true, itemSwing: 0 });
    }
    // Minecarts are compact block-built entities; their world state is saved locally.
    for (const cart of this.minecarts?.carts ?? []) {
      const wheel = [0.16, 0.16, 0.16];
      const parts = [
        [[0,0.30,0],[0.92,0.22,0.92],[0.30,0.31,0.34,1]],
        [[0,0.48,0],[0.78,0.18,0.78],[0.48,0.50,0.53,1]],
        [[-0.34,0.13,-0.32],wheel,[0.10,0.10,0.11,1]],
        [[0.34,0.13,-0.32],wheel,[0.10,0.10,0.11,1]],
        [[-0.34,0.13,0.32],wheel,[0.10,0.10,0.11,1]],
        [[0.34,0.13,0.32],wheel,[0.10,0.10,0.11,1]],
      ];
      draw(cart.x, cart.y - 0.08, cart.z, cart.yaw || 0, parts, 0, -1, -1, 1, {});
    }
    // XP orbs use small bright voxel sprites; larger-value orbs have a warm core.
    for (const orb of this.entities?.experienceOrbs ?? []) {
      const phase = (orb.age || 0) * 0.075;
      const green = 0.58 + (Math.sin(phase) + 1) * 0.10;
      const body = [[0, 0, 0], [0.16, 0.16, 0.16], [0.30, green, 0.10, 1]];
      const parts = [body];
      if (orb.value >= 17) parts.push([[0, 0, 0.075], [0.07, 0.07, 0.035], [0.96, 0.48, 0.10, 1]]);
      draw(orb.x, orb.y + Math.sin(phase) * 0.035, orb.z, phase, parts, 0, -1, -1, 1, {});
    }
    if (this.thirdPerson) {
      document.getElementById('held-item-view')?.classList.add('hidden');
      draw(this.renderPosition.x, this.renderPosition.y + (this.player.ridingHorse ? 1.15 : this.player.ridingMinecart ? 0.42 : 0), this.renderPosition.z, this.player.yaw * Math.PI / 180, human, this.player.walkPhase, 4, 5, 1, { swimming: this.player.inWater && Math.hypot(this.player.vx ?? 0, this.player.vy ?? 0, this.player.vz ?? 0) > 0.025, airborne: !this.player.ridingHorse && !this.player.ridingMinecart && !this.player.onGround, sprinting: !!this.player.sprinting, jumping: !this.player.ridingHorse && !this.player.ridingMinecart && !this.player.onGround && this.player.vy > 0.05, sneaking: this.player.sneaking || !!this.player.ridingHorse || !!this.player.ridingMinecart, riding: !!this.player.ridingHorse || !!this.player.ridingMinecart, walking: !this.player.ridingHorse && !this.player.ridingMinecart && this.player.onGround && Math.hypot(this.player.vx ?? 0, this.player.vz ?? 0) > 0.035, attack: this.player.attackTime > 0, attackTime: this.player.attackTime }, true);
      draw(this.renderPosition.x, this.renderPosition.y + (this.player.ridingHorse ? 1.15 : 0), this.renderPosition.z, this.player.yaw * Math.PI / 180, outerHuman, this.player.walkPhase, 4, 5, 1, { swimming: this.player.inWater && Math.hypot(this.player.vx ?? 0, this.player.vy ?? 0, this.player.vz ?? 0) > 0.025, airborne: !this.player.ridingHorse && !this.player.onGround, sneaking: this.player.sneaking || !!this.player.ridingHorse, riding: !!this.player.ridingHorse, skinLayer: true }, true);
      const armorColors = ['#b8b8b8','#8f8f9b','#b17a45','#6c778a'];
      const armorParts = [];
      for (let slot = 36; slot <= 39; slot++) {
        const stack = this.inventory?.get(slot);
        if (!stack || stack.isEmpty) continue;
        const color = stack.item.id.includes('diamond') ? [0.20,0.82,0.78,1]
          : stack.item.id.includes('iron') ? [0.72,0.76,0.80,1]
          : stack.item.id.includes('gold') ? [0.95,0.72,0.18,1]
          : stack.item.id.includes('leather') ? [0.48,0.28,0.14,1]
          : stack.item.id.includes('chainmail') ? [0.52,0.58,0.62,1] : [0.48,0.52,0.58,1];
        if (stack.item.armorSlot === 'helmet') armorParts.push([[0,1.55,0],[0.55,0.55,0.55],color]);
        if (stack.item.armorSlot === 'chestplate') {
          armorParts.push([[0,1.00,0],[0.56,0.78,0.30],color]);
          armorParts.push([[-0.375,1.00,0],[0.29,0.78,0.29],color]);
          armorParts.push([[0.375,1.00,0],[0.29,0.78,0.29],color]);
        }
        if (stack.item.armorSlot === 'leggings') {
          armorParts.push([[-0.125,0.39,0],[0.28,0.78,0.28],color]);
          armorParts.push([[0.125,0.39,0],[0.28,0.78,0.28],color]);
        }
        if (stack.item.armorSlot === 'boots') {
          armorParts.push([[-0.125,0.08,0.035],[0.27,0.18,0.30],color]);
          armorParts.push([[0.125,0.08,0.035],[0.27,0.18,0.30],color]);
        }
      }
      if (armorParts.length) draw(this.renderPosition.x, this.renderPosition.y, this.renderPosition.z, this.player.yaw * Math.PI / 180, armorParts, 0, -1, -1, 1, {});
    }
    for (const remote of this.multiplayer?.remotePlayers?.values?.() ?? []) {
      draw(remote.x, remote.y, remote.z, remote.yaw * Math.PI / 180, human, remote.walkPhase || 0, 4, 5, 1, { swimming: !!remote.inWater, airborne: !!remote.airborne, jumping: !!remote.jumping, sneaking: !!remote.sneaking, walking: !!remote.walking, attack: !!remote.attacking, attackTime: remote.attackTime ?? 0 }, true);
      draw(remote.x, remote.y, remote.z, remote.yaw * Math.PI / 180, outerHuman, remote.walkPhase || 0, 4, 5, 1, { swimming: !!remote.inWater, airborne: !!remote.airborne, sneaking: !!remote.sneaking, skinLayer: true }, true);
      const remoteArmorParts = [];
      for (const id of remote.armor ?? []) {
        if (!id) continue;
        const color = id.includes('diamond') ? [0.20,0.82,0.78,1]
          : id.includes('iron') ? [0.72,0.76,0.80,1]
          : id.includes('gold') ? [0.95,0.72,0.18,1]
          : id.includes('leather') ? [0.48,0.28,0.14,1]
          : id.includes('chainmail') ? [0.52,0.58,0.62,1] : [0.48,0.52,0.58,1];
        if (id.endsWith('_helmet')) remoteArmorParts.push([[0,1.55,0],[0.55,0.55,0.55],color]);
        if (id.endsWith('_chestplate')) remoteArmorParts.push(
          [[0,1.00,0],[0.56,0.78,0.30],color],
          [[-0.375,1.00,0],[0.29,0.78,0.29],color],
          [[0.375,1.00,0],[0.29,0.78,0.29],color],
        );
        if (id.endsWith('_leggings')) remoteArmorParts.push(
          [[-0.125,0.39,0],[0.28,0.78,0.28],color],
          [[0.125,0.39,0],[0.28,0.78,0.28],color],
        );
        if (id.endsWith('_boots')) remoteArmorParts.push(
          [[-0.125,0.08,0.035],[0.27,0.18,0.30],color],
          [[0.125,0.08,0.035],[0.27,0.18,0.30],color],
        );
      }
      if (remoteArmorParts.length) draw(remote.x, remote.y, remote.z, remote.yaw * Math.PI / 180, remoteArmorParts, 0, -1, -1, 1, {});
      const equipmentPart = (id, side) => {
        if (!id) return;
        const color = id.includes('diamond') ? [0.20,0.82,0.78,1]
          : id.includes('iron') ? [0.72,0.76,0.80,1]
          : id.includes('gold') ? [0.95,0.72,0.18,1]
          : id.includes('wooden') ? [0.48,0.30,0.16,1]
          : id.includes('stone') ? [0.48,0.50,0.52,1]
          : id.includes('shield') ? [0.42,0.28,0.16,1] : [0.62,0.62,0.62,1];
        const tool = /sword|pickaxe|axe|shovel|hoe|trident/.test(id);
        const parts = tool
          ? [[[side * 0.36,1.02,0.30],[0.10,0.34,0.10],[0.42,0.27,0.14,1]],[[side * 0.36,1.31,0.30],[0.15,0.30,0.055],color]]
          : [[[side * 0.36,1.12,0.30],[id.includes('shield') ? 0.34 : 0.22,id.includes('shield') ? 0.42 : 0.22,0.10],color]];
        draw(remote.x, remote.y, remote.z, remote.yaw * Math.PI / 180, parts, 0, -1, -1, 1, {});
      };
      equipmentPart(remote.heldItem, 1);
      equipmentPart(remote.offhandItem, -1);
    }
    for (const particle of (this.particlesMode === 'off' ? [] : this.entities?.blockParticles ?? [])) {
      const size = 0.045 + Math.min(1, particle.life / 28) * 0.025;
      draw(particle.x, particle.y, particle.z, 0, [
        [[0,0,0],[size,size,size],particle.color],
      ], 0, -1, -1, 1, {});
    }
    for (const arrow of this.entities?.arrows ?? []) {
      const yaw = arrow.stuckYaw ?? Math.atan2(-arrow.vx, arrow.vz);
      const pitch = arrow.stuckPitch ?? Math.atan2(-arrow.vy, Math.hypot(arrow.vx, arrow.vz));
      draw(arrow.x, arrow.y, arrow.z, yaw, [
        [[0,0,0],[0.045,0.045,0.62],[0.46,0.34,0.18,1]],
        [[0,0.025,-0.24],[0.16,0.012,0.16],[0.82,0.82,0.82,1]],
      ], pitch, -1, -1, 1, {});
    }
    for (const mob of this.entities?.mobs ?? []) {
      const vanillaModel = this.entityModels?.getModel?.('minecraft:' + mob.type);
      const vanillaParts = vanillaLayerParts(vanillaModel, 'main');
      const beeFallback = [
        [[0,1.05,0],[0.48,0.42,0.58],[0.93,0.68,0.12,1]],
        [[0,1.10,0.29],[0.28,0.28,0.20],[0.18,0.14,0.08,1]],
        [[-0.23,1.30,0],[0.42,0.035,0.42],[0.86,0.91,0.94,0.72]],
        [[0.23,1.30,0],[0.42,0.035,0.42],[0.86,0.91,0.94,0.72]],
        [[-0.18,0.76,0.08],[0.035,0.22,0.035],[0.16,0.12,0.07,1]],
        [[0.18,0.76,0.08],[0.035,0.22,0.035],[0.16,0.12,0.07,1]],
      ];
      const villagerFallback = [
        [[0,0.98,0],[0.43,0.72,0.34],[0.48,0.30,0.18,1]],
        [[0,1.62,0],[0.48,0.48,0.42],[0.67,0.50,0.36,1]],
        [[0,1.57,0.25],[0.12,0.22,0.18],[0.42,0.25,0.17,1]],
        [[-0.19,1.12,0.02],[0.18,0.58,0.22],[0.48,0.30,0.18,1]],
        [[-0.13,0.39,0],[0.20,0.70,0.22],[0.34,0.25,0.18,1]],
        [[0.13,0.39,0],[0.20,0.70,0.22],[0.34,0.25,0.18,1]],
      ];
      const parts = vanillaParts ?? (mob.type === 'bee' ? beeFallback : mob.type === 'villager' ? villagerFallback
        : mob.type === 'zombie' ? zombie
        : mob.type === 'skeleton' || mob.type === 'stray' ? skeleton
        : mob.type === 'creeper' ? creeper
        : mob.type === 'enderman' ? enderman
        : mob.type === 'spider' || mob.type === 'cave_spider' ? spider
        : mob.type === 'pig' || mob.type === 'rabbit' ? pig : mob.type === 'cow' || mob.type === 'goat' || mob.type === 'mooshroom' || mob.type === 'polar_bear' ? cow
        : mob.type === 'chicken' ? chicken : sheep);
      const pulse = mob.type === 'creeper' && mob.anim?.fuse > 0
        ? 1 + Math.sin(mob.anim.fuse * Math.PI * 12) * 0.10 * mob.anim.fuse : 1;
      const legs = mob.type === 'bee' ? [-1, -1]
        : mob.type === 'spider' || mob.type === 'cave_spider' ? [4, 11]
        : mob.type === 'creeper' ? [2, 5]
        : ['zombie','skeleton','stray','villager','enderman'].includes(mob.type) ? [4, 5]
        : mob.type === 'pig' || mob.type === 'rabbit' ? [3, 6]
        : mob.type === 'cow' || mob.type === 'sheep' || mob.type === 'goat' || mob.type === 'mooshroom' || mob.type === 'polar_bear' || mob.type === 'horse' ? [2, 5]
        : mob.type === 'chicken' ? [4, 5] : [2, 5];
      const babyScale = mob.ageTicks < 0 ? 0.55 : 1;
      const animal = ['sheep', 'pig', 'cow', 'goat', 'chicken', 'mooshroom', 'rabbit', 'wolf', 'polar_bear', 'bee'].includes(mob.type);
      const humanoid = ['zombie', 'skeleton', 'stray', 'villager'].includes(mob.type);
      // Mob movement advances along +sin(yaw), +cos(yaw); render the model on that same forward axis.
      draw(mob.x, mob.y, mob.z, mob.yaw, parts, mob.walkPhase, legs[0], legs[1], pulse * babyScale, {
        hurt: (mob.hurtTicks || 0) > 0, animal, humanoid, vanillaModel: !!vanillaParts,
        mobType: mob.type, mobTextureKey: mob.type === 'villager' ? 'villager_' + (mob.villagerCareer === 'archer' ? 'fletcher' : (mob.villagerCareer || 'farmer')) : mob.type,
        idle: mob.anim?.idle ?? 0, walking: !!mob.anim?.walking, sprinting: !!mob.sprinting, attack: (mob.anim?.attack ?? 0) > 0, attackTime: mob.anim?.attack ?? 0, airborne: !!mob.airborne, jumping: !!mob.jumping, swimming: !!mob.inWater, riding: !!mob.riding, humanoid,
      });
      if (mob.type === 'goat' && !vanillaParts) {
        draw(mob.x, mob.y, mob.z, mob.yaw, [
          [[-0.27,1.30,0.68],[0.075,0.24,0.075],[0.78,0.72,0.58,1]],
          [[0.27,1.30,0.68],[0.075,0.24,0.075],[0.78,0.72,0.58,1]],
        ], mob.walkPhase, -1, -1, pulse * babyScale, {});
      }
      if (mob.type === 'horse' && mob.horseArmor) {
        const armorColor = mob.horseArmor === 'diamond' ? [0.18,0.78,0.78,1]
          : mob.horseArmor === 'golden' ? [0.92,0.70,0.18,1] : [0.68,0.72,0.76,1];
        draw(mob.x, mob.y, mob.z, mob.yaw, [
          [[0,0.92,0],[0.88,0.78,1.32],armorColor],
          [[0,1.28,0.48],[0.48,0.62,0.48],armorColor],
        ], mob.walkPhase, -1, -1, 1, {});
      }
      if (mob.type === 'sheep' && !mob.sheared && vanillaModel?.layers?.fur) {
        const furParts = vanillaLayerParts(vanillaModel, 'fur');
        if (furParts) draw(mob.x, mob.y, mob.z, mob.yaw + Math.PI, furParts, mob.walkPhase, legs[0], legs[1], pulse * babyScale, {
          hurt: (mob.hurtTicks || 0) > 0, animal: true, vanillaModel: true,
          mobType: mob.type, mobTextureKey: 'sheep_fur', idle: mob.anim?.idle ?? 0,
          walking: !!mob.anim?.walking,
        });
      }
    }
    if (!this.thirdPerson) {
      // First-person right arm and held item, positioned relative to the
      // interpolated camera so they remain stable while the world moves.
      const yaw = this.player.yaw * Math.PI / 180;
      const pitch = this.player.pitch * Math.PI / 180;
      // Build the arm in camera-relative axes: looking up/down must move the
      // hand with the view instead of leaving it floating at the crosshair.
      const forwardX = -Math.sin(yaw) * Math.cos(pitch);
      const forwardY = -Math.sin(pitch);
      const forwardZ = Math.cos(yaw) * Math.cos(pitch);
      const rightX = -Math.cos(yaw), rightZ = -Math.sin(yaw);
      const attackProgress = Math.max(0, Math.min(1, (8 - (this.player.attackTime ?? 0)) / 8));
      const attackThrust = this.player.attackTime > 0 ? Math.sin(attackProgress * Math.PI) : 0;
      // Keep the resting hand lower in the bottom-right of the view.
      // During an attack lift it vertically; do not thrust it toward the camera.
      const handDistance = 0.48;
      const handX = this.renderPosition.x + forwardX * handDistance + rightX * 0.34;
      const handY = this.renderPosition.y + this.player.eyeHeight + (this.player.ridingHorse ? 1.15 : 0) + forwardY * handDistance - 0.43;
      const handZ = this.renderPosition.z + forwardZ * handDistance + rightZ * 0.34;
      const moving = this.player.onGround && Math.hypot(this.player.vx ?? 0, this.player.vz ?? 0) > 0.035;
      const moveBlend = moving ? 1 : 0;
      const handBob = Math.sin(this.player.walkPhase * 2) * (0.018 * moveBlend) + Math.sin((this.tickCount || 0) * 0.045) * (0.004 + (this.player.sneaking ? 0.002 : 0));
      const armParts = [
        [[0, 0, 0], [0.001, 0.001, 0.001], [0, 0, 0, 0]],
        [[0, 0, 0], [0.001, 0.001, 0.001], [0, 0, 0, 0]],
        [[0, 0, 0], [0.001, 0.001, 0.001], [0, 0, 0, 0]],
        [[0.015, -0.10 - handBob, 0.015], [0.20, 0.54, 0.20], [0.12, 0.48, 0.72, 1]],
      ];
      const bowDrawing = this.entities?.bowDrawStart != null;
      const crossbowLoading = this.entities?.crossbowLoadStart != null;
      const tridentCharging = this.entities?.tridentThrowStart != null;
      const firstPersonArmPose = {
        firstPerson: true, attack: this.player.attackTime > 0, attackTime: this.player.attackTime,
        bowDraw: bowDrawing, crossbowLoad: crossbowLoading, tridentCharge: tridentCharging,
        sneaking: this.player.sneaking, swimming: this.player.inWater && Math.hypot(this.player.vx ?? 0, this.player.vy ?? 0, this.player.vz ?? 0) > 0.025, airborne: !this.player.onGround,
        walking: this.player.onGround && Math.hypot(this.player.vx ?? 0, this.player.vz ?? 0) > 0.035,
      };
      draw(handX, handY, handZ, yaw, armParts, this.player.walkPhase, -1, -1, 1, firstPersonArmPose, true);
      // Draw the matching transparent sleeve over the first-person arm too.
      const outerArmParts = armParts.map(([offset, size, color]) => [offset, size.map((value) => value * 1.045), color]);
      draw(handX, handY, handZ, yaw, outerArmParts, this.player.walkPhase, -1, -1, 1,
        { firstPerson: true, skinLayer: true, attack: this.player.attackTime > 0, attackTime: this.player.attackTime, sneaking: this.player.sneaking, swimming: this.player.inWater && Math.hypot(this.player.vx ?? 0, this.player.vy ?? 0, this.player.vz ?? 0) > 0.025, airborne: !this.player.onGround, walking: this.player.onGround && Math.hypot(this.player.vx ?? 0, this.player.vz ?? 0) > 0.035 }, true);

      // Actual vanilla item PNGs are displayed on a thin 3D-oriented sprite;
      // block items are rendered as volumetric cubes using that same source art.
      const held = this.inventory?.held;
      const itemView = document.getElementById('held-item-view');
      // The hotbar icon is not the held object. Keep the DOM overlay hidden;
      // the item is drawn below as a camera-space 3D sprite/cube.
      itemView?.classList.add('hidden');
      if (itemView) itemView.removeAttribute('src');
      if (held && !held.isEmpty && held.item) {
        const id = held.item.id;
        const icon = this.ui.icons.get(id);
        if (icon && this.heldItemTextureId !== id) {
          this.heldItemTextureId = id;
          this.heldItemTextureReady = false;
          const image = new Image();
          image.onload = () => {
            if (this.heldItemTextureId !== id) return;
            gl.bindTexture(gl.TEXTURE_2D, this.heldItemTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            this.heldItemTextureReady = true;
          };
          image.src = icon;
        }
        if (this.heldItemTextureReady) {
          const isBlock = !!held.item.block;
          const isFishingRod = id.includes('fishing_rod');
          const itemKind = id.includes('crossbow') ? 'crossbow'
            : id.includes('bow') ? 'bow'
            : id.includes('shield') ? 'shield'
            : id.includes('trident') ? 'trident' : 'item';
          const isTool = /sword|pickaxe|axe|shovel|hoe/.test(id);
          const size = isBlock ? [0.19, 0.19, 0.19]
            : isFishingRod ? [0.16, 0.58, 0.035]
            : itemKind === 'bow' ? [0.34, 0.56, 0.035]
            : itemKind === 'crossbow' ? [0.38, 0.48, 0.045]
            : itemKind === 'shield' ? [0.48, 0.58, 0.045]
            : itemKind === 'trident' ? [0.18, 0.62, 0.035]
            : isTool ? [0.27, 0.56, 0.035] : [0.24, 0.38, 0.035];
          const nowTick = this.tickCount || 0;
          const chargeStart = itemKind === 'bow' ? this.entities?.bowDrawStart
            : itemKind === 'crossbow' ? this.entities?.crossbowLoadStart
            : itemKind === 'trident' ? this.entities?.tridentThrowStart : null;
          const chargeDuration = itemKind === 'trident' ? 10 : itemKind === 'crossbow' ? 25 : 20;
          const charge = bedrockChargeProgress(chargeStart, nowTick, chargeDuration);
          const attackProgress = Math.max(0, Math.min(1, (8 - (this.player.attackTime ?? 0)) / 8));
          const itemPose = bedrockItemPose(this.player.attackTime > 0 ? attackProgress : 0, itemKind, charge);
          const itemSize = [size[0], size[1] * itemPose.scaleY, size[2]];
          const itemRotation = [0.12 + itemPose.rotation[0], itemPose.rotation[1], -0.18 + itemPose.rotation[2]];
          const itemParts = [[[0, 0, 0], itemSize, [1, 1, 1, 1], null, null, itemRotation]];
          // Translate the Bedrock pack's 1/16-block keyframe offsets into the
          // camera-relative item anchor used by this renderer.
          const walkSway = Math.sin(this.player.walkPhase) * 0.018 * moveBlend;
          const itemX = handX + rightX * (0.018 + itemPose.offset[0] + walkSway) + forwardX * itemPose.offset[2];
          const itemY = handY - 0.24 + itemPose.offset[1] + handBob;
          const itemZ = handZ + forwardZ * (0.025 + itemPose.offset[2]) + rightZ * (0.018 + itemPose.offset[0] + walkSway * 0.35);
          const itemSwing = this.player.attackTime > 0 ? 0 : -0.12;
          draw(itemX, itemY, itemZ, yaw, itemParts, 0, -1, -1, 1,
            { itemModel: true, itemSprite: true, itemSwing });
        }
      }
    }
  },



  _drawFishing() {
    const fishing = this.entities?.fishing;
    if (!fishing || !this.player || !this.world) return;
    const gl = this.gl;
    const { program, uniforms } = this.lineProgram;
    const player = this.player;
    const yaw = player.yaw * Math.PI / 180;
    const pitch = player.pitch * Math.PI / 180;
    const forwardX = -Math.sin(yaw) * Math.cos(pitch);
    const forwardY = -Math.sin(pitch);
    const forwardZ = Math.cos(yaw) * Math.cos(pitch);
    const rightX = -Math.cos(yaw), rightZ = -Math.sin(yaw);
    const hand = {
      x: this.renderPosition.x + forwardX * 0.48 + rightX * 0.34,
      y: this.renderPosition.y + player.eyeHeight + forwardY * 0.48 - 0.39,
      z: this.renderPosition.z + forwardZ * 0.48 + rightZ * 0.34,
    };
    const time = fishing.elapsed ?? 0;
    const bob = Math.sin(time * 0.19) * 0.035 + Math.sin(time * 0.071) * 0.018;
    const dip = fishing.bite ? Math.sin(Math.min(1, fishing.biteAnim ?? 0) * Math.PI * 0.5) * 0.48 : 0;
    const castProgress = Math.max(0, Math.min(1, fishing.castProgress ?? 1));
    const flightArc = Math.sin(castProgress * Math.PI) * 0.72;
    const bobber = {
      x: hand.x + (fishing.x - hand.x) * castProgress,
      y: hand.y + (fishing.y - hand.y) * castProgress + flightArc + bob * castProgress - dip,
      z: hand.z + (fishing.z - hand.z) * castProgress,
    };

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const drawSegments = (points, color) => {
      if (!points.length) return;
      const vertices = new Float32Array(points);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3] ?? 1);
      gl.drawArrays(gl.LINES, 0, vertices.length / 3);
    };
    const line = [];
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const sag0 = Math.sin(t0 * Math.PI) * 0.11;
      const sag1 = Math.sin(t1 * Math.PI) * 0.11;
      line.push(
        hand.x + (bobber.x - hand.x) * t0, hand.y + (bobber.y - hand.y) * t0 - sag0, hand.z + (bobber.z - hand.z) * t0,
        hand.x + (bobber.x - hand.x) * t1, hand.y + (bobber.y - hand.y) * t1 - sag1, hand.z + (bobber.z - hand.z) * t1,
      );
    }
    drawSegments(line, [0.10, 0.09, 0.07, 1]);

    // Tiny red-and-white float, deliberately above the water plane and with a
    // slight rocking motion so it reads clearly even at normal view distance.
    const floatTop = bobber.y + 0.095;
    drawSegments([
      bobber.x, bobber.y - 0.055, bobber.z, bobber.x, floatTop, bobber.z,
      bobber.x - 0.045, bobber.y + 0.005, bobber.z, bobber.x + 0.045, bobber.y + 0.005, bobber.z,
      bobber.x, bobber.y + 0.005, bobber.z - 0.045, bobber.x, bobber.y + 0.005, bobber.z + 0.045,
    ], [0.94, 0.92, 0.82, 1]);
    drawSegments([
      bobber.x, bobber.y + 0.035, bobber.z, bobber.x, floatTop, bobber.z,
    ], [0.92, 0.12, 0.08, 1]);

    const drawRing = (cx, cy, cz, radius, phase = 0) => {
      const points = [];
      const segments = 18;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2 + phase;
        const a1 = ((i + 1) / segments) * Math.PI * 2 + phase;
        points.push(cx + Math.cos(a0) * radius, cy, cz + Math.sin(a0) * radius,
          cx + Math.cos(a1) * radius, cy, cz + Math.sin(a1) * radius);
      }
      return points;
    };
    const ripplePhase = time * 0.085;
    const rippleRadius = 0.12 + (Math.sin(time * 0.12) + 1) * 0.045;
    drawSegments(drawRing(bobber.x, fishing.y - 0.012, bobber.z, rippleRadius, ripplePhase), [0.58, 0.82, 0.96, 0.72]);

    // A small fish silhouette swims in from the side during the final seconds
    // before the bite. Its approach is visible before the bobber plunges.
    if (!fishing.bite && (fishing.approach ?? 0) > 0.02) {
      const amount = Math.min(1, fishing.approach);
      const fishX = fishing.fishX + (fishing.x - fishing.fishX) * amount;
      const fishZ = fishing.fishZ + (fishing.z - fishing.fishZ) * amount;
      const fishY = fishing.y - 0.22 + Math.sin(time * 0.24 + (fishing.fishSeed ?? 0)) * 0.035;
      const dx = fishing.x - fishX, dz = fishing.z - fishZ;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const sideX = -dz / length * 0.13, sideZ = dx / length * 0.13;
      const tailX = -dx / length * 0.18, tailZ = -dz / length * 0.18;
      const nose = [fishX + dx / length * 0.22, fishY, fishZ + dz / length * 0.22];
      const left = [fishX + sideX, fishY, fishZ + sideZ];
      const right = [fishX - sideX, fishY, fishZ - sideZ];
      const tail = [fishX + tailX, fishY, fishZ + tailZ];
      const fin = [fishX + tailX * 0.7, fishY + 0.08, fishZ + tailZ * 0.7];
      drawSegments([
        ...nose, ...left, ...left, ...tail, ...tail, ...right, ...right, ...nose,
        ...tail, ...fin, ...fin, ...nose,
      ], [0.28, 0.82, 0.96, 0.95]);
      const fishRipple = drawRing(fishX, fishing.y - 0.018, fishZ, 0.16 + Math.sin(time * 0.18) * 0.025, time * 0.11);
      drawSegments(fishRipple, [0.45, 0.78, 0.94, 0.65]);
    }

    if (fishing.bite) {
      const splash = drawRing(bobber.x, fishing.y + 0.015, bobber.z, 0.24 + (fishing.biteAnim ?? 0) * 0.18, time * 0.2);
      drawSegments(splash, [0.82, 0.94, 1, 0.95]);
    }
    gl.bindVertexArray(null);
  },

  _updateRemotePlayerTags() {
    const container = document.getElementById('remote-player-tags');
    if (!container) return;
    const remotes = [...(this.multiplayer?.remotePlayers?.values?.() ?? [])];
    if (!this._remoteTagNodes) this._remoteTagNodes = new Map();
    const active = new Set();
    const m = this.viewProjection;
    for (const player of remotes) {
      active.add(player.id);
      let tag = this._remoteTagNodes.get(player.id);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'remote-player-tag';
        container.appendChild(tag);
        this._remoteTagNodes.set(player.id, tag);
      }
      tag.textContent = player.name || 'Игрок';
      const x = player.x, y = player.y + 2.15, z = player.z;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      const visible = cw > 0.05 && cz / cw >= -1 && cz / cw <= 1;
      if (!visible) { tag.hidden = true; continue; }
      tag.hidden = false;
      tag.style.left = `${(cx / cw * 0.5 + 0.5) * 100}%`;
      tag.style.top = `${(1 - (cy / cw * 0.5 + 0.5)) * 100}%`;
    }
    for (const [id, tag] of this._remoteTagNodes) {
      if (!active.has(id)) { tag.remove(); this._remoteTagNodes.delete(id); }
    }
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
    const progress = this.mining.progress;
    if (!this.mining.target || progress <= 0) return;

    const gl = this.gl;
    const { program, uniforms } = this.crackProgram;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, this.viewProjection);
    gl.uniform3f(uniforms.uBlockOrigin, x, y, z);
    gl.uniform1f(uniforms.uProgress, progress);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // No depth write: the overlay is decoration on top of a face that has
    // already been drawn, and writing depth would let it occlude anything
    // rendered afterwards.
    gl.depthMask(false);
    // Pull the crack faces slightly toward the camera to avoid z-fighting
    // with the block surface (the old exact-coplanar overlay was invisible).
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -1);
    gl.bindVertexArray(this.crackVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  },
};
