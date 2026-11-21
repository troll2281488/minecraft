import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual, assertDeepEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes } from '../src/world/shapes.js';

const OAK = BLOCKS.get('mc:oak_stairs').defaultState;

function neighborAt(states) {
  return (dx, dy, dz) => states.get(`${dx},${dy},${dz}`) || null;
}

describe('Java stair corner geometry', () => {
  it('keeps the two-box straight profile without compatible neighbours', () => {
    const boxes = shapeBoxes(OAK, neighborAt(new Map()));
    assertEqual(boxes.length, 3);
    assertDeepEqual(boxes[1], [0, 0.5, 0, 0.5, 1, 0.5]);
    assertDeepEqual(boxes[2], [0.5, 0.5, 0, 1, 1, 0.5]);
  });

  it('forms outer-left and outer-right corners from a stair in front', () => {
    const left = OAK.with('facing', 'west');
    const right = OAK.with('facing', 'east');
    const outerLeft = shapeBoxes(OAK, neighborAt(new Map([['0,0,-1', left]])));
    const outerRight = shapeBoxes(OAK, neighborAt(new Map([['0,0,-1', right]])));
    assertEqual(outerLeft.length, 2);
    assertEqual(outerRight.length, 2);
    assertDeepEqual(outerLeft[1], [0, 0.5, 0, 0.5, 1, 0.5]);
    assertDeepEqual(outerRight[1], [0.5, 0.5, 0, 1, 1, 0.5]);
  });

  it('forms inner corners from a perpendicular stair behind', () => {
    const left = OAK.with('facing', 'west');
    const boxes = shapeBoxes(OAK, neighborAt(new Map([['0,0,1', left]])));
    assertEqual(boxes.length, 4);
    assertEqual(boxes[1][1], 0.5);
    assertEqual(boxes[2][1], 0.5);
    assertEqual(boxes[3][1], 0.5);
  });

  it('does not join a stair on the opposite half', () => {
    const upper = OAK.with('half', 'top').with('facing', 'west');
    const boxes = shapeBoxes(OAK, neighborAt(new Map([['0,0,-1', upper]])));
    assertEqual(boxes.length, 3);
  });

  it('uses the same neighbour-shaped boxes for collision as for rendering', () => {
    const neighbor = OAK.with('facing', 'west');
    const lookup = neighborAt(new Map([['0,0,-1', neighbor]]));
    assertDeepEqual(collisionBoxes(OAK, lookup), shapeBoxes(OAK, lookup));
  });
});
