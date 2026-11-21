import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { buildBlockTextureTable } from '../src/render/atlas.js';

const textureIndex = new Map([
  ['stone', 0], ['piston_side', 1], ['piston_bottom', 2], ['honey_block', 5],
  ['piston_top', 3], ['sticky_piston_top', 4],
]);

function faceLayers(state) {
  const table = buildBlockTextureTable(BLOCKS, textureIndex);
  return Array.from(table.slice(state.runtimeId * 6, state.runtimeId * 6 + 6));
}

describe('piston texture orientation', () => {
  it('assigns the dedicated honey texture to every honey block face', () => {
    const state = BLOCKS.get('mc:honey_block').defaultState;
    assertEqual(faceLayers(state).every((layer) => layer === 5), true);
  });

  it('places the piston top texture on the facing face for all six directions', () => {
    const faces = {
      down: 0, up: 1, north: 2, south: 3, west: 4, east: 5,
    };
    for (const [facing, index] of Object.entries(faces)) {
      const state = BLOCKS.get('mc:piston').defaultState.with('facing', facing);
      const layers = faceLayers(state);
      assertEqual(layers[index], 3, `piston front texture for ${facing}`);
      assertEqual(layers[0], facing === 'down' ? 3 : 2);
    }
  });

  it('uses the casing texture on the extended base contact face', () => {
    const state = BLOCKS.get('mc:piston').defaultState
      .with('facing', 'east').with('extended', true);
    assertEqual(faceLayers(state)[5], 1);
  });

  it('uses the green sticky texture on the sticky head contact face', () => {
    const state = BLOCKS.get('mc:piston_head').defaultState
      .with('facing', 'south').with('sticky', true);
    const layers = faceLayers(state);
    assertEqual(layers[3], 4);
    assertEqual(layers[2], 1);
  });
});
