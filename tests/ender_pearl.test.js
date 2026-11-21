import { describe, it, assertEqual } from './framework.js';
import { findEnderPearlLanding } from '../src/game/ender_pearl.js';

function testWorld(blocks) {
  return {
    hasChunk: () => true,
    getBlock(x, y, z) {
      return { block: blocks.get(`${x},${y},${z}`) || { id: 'mc:air', solid: false, liquid: false } };
    },
  };
}

describe('Java ender pearl landing', () => {
  it('lands on the adjacent top surface when two clear blocks are available', () => {
    const blocks = new Map([['3,63,4', { id: 'mc:stone', solid: true }]]);
    const landing = findEnderPearlLanding(testWorld(blocks), {
      x: 3, y: 63, z: 4, face: { dx: 0, dy: 1, dz: 0 },
    });
    assertEqual(landing.x, 3.5);
    assertEqual(landing.y, 64);
    assertEqual(landing.z, 4.5);
  });

  it('rejects blocked headroom, missing floor and unloaded destination chunks', () => {
    const blocked = new Map();
    for (let y = 63; y <= 68; y++) blocked.set(`3,${y},4`, { id: 'mc:stone', solid: true });
    assertEqual(findEnderPearlLanding(testWorld(blocked), {
      x: 3, y: 63, z: 4, face: { dx: 0, dy: 1, dz: 0 },
    }), null);
    assertEqual(findEnderPearlLanding(testWorld(new Map()), {
      x: 3, y: 63, z: 4, face: { dx: 0, dy: 1, dz: 0 },
    }), null);
    const unloaded = { ...testWorld(new Map([['3,63,4', { id: 'mc:stone', solid: true }]])), hasChunk: () => false };
    assertEqual(findEnderPearlLanding(unloaded, {
      x: 3, y: 63, z: 4, face: { dx: 0, dy: 1, dz: 0 },
    }), null);
  });

  it('uses the clicked face to resolve a side landing', () => {
    const blocks = new Map([['4,63,4', { id: 'mc:stone', solid: true }]]);
    const landing = findEnderPearlLanding(testWorld(blocks), {
      x: 3, y: 64, z: 4, face: { dx: 1, dy: 0, dz: 0 },
    });
    assertEqual(landing.x, 4.5);
    assertEqual(landing.y, 64);
    assertEqual(landing.z, 4.5);
  });
});
