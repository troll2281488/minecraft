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

  it('handles outer and inner corners in all four horizontal directions', () => {
    const vectors = {
      north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
    };
    const leftOf = { north: 'west', south: 'east', west: 'south', east: 'north' };
    for (const facing of Object.keys(vectors)) {
      const [dx, dz] = vectors[facing];
      const leftFacing = leftOf[facing];
      const leftVector = vectors[leftFacing];
      const stair = OAK.with('facing', facing);
      const leftNeighbor = OAK.with('facing', leftFacing);
      const outerLookup = neighborAt(new Map([[ `${dx},0,${dz}`, leftNeighbor ]]));
      const outer = shapeBoxes(stair, outerLookup);
      assertEqual(outer.length, 2, `outer corner facing ${facing}`);
      const inner = shapeBoxes(stair, neighborAt(new Map([
        [`${-dx},0,${-dz}`, leftNeighbor],
      ])));
      assertEqual(inner.length, 4, `inner corner facing ${facing}`);
      assertDeepEqual(collisionBoxes(stair, outerLookup), outer);
      const parallel = OAK.with('facing', facing);
      const straight = shapeBoxes(stair, neighborAt(new Map([
        [`${dx},0,${dz}`, parallel],
      ])));
      assertEqual(straight.length, 3, `parallel neighbor facing ${facing}`);
      const diagonal = shapeBoxes(stair, neighborAt(new Map([
        [`${dx + leftVector[0]},0,${dz + leftVector[1]}`, leftNeighbor],
      ])));
      assertEqual(diagonal.length, 3, `diagonal neighbor facing ${facing}`);
    }
  });

  it('keeps top-half corner collision and rendering aligned', () => {
    const top = OAK.with('half', 'top');
    const neighbor = OAK.with('half', 'top').with('facing', 'west');
    const lookup = neighborAt(new Map([['0,0,-1', neighbor]]));
    const rendered = shapeBoxes(top, lookup);
    assertDeepEqual(collisionBoxes(top, lookup), rendered);
    assertEqual(rendered[0][1], 0.5);
    assertEqual(rendered[0][4], 1);
  });

  it('does not connect to a non-stair neighbor', () => {
    const other = { block: { renderShape: 'cube' }, get: () => 'west' };
    const boxes = shapeBoxes(OAK, neighborAt(new Map([['0,0,-1', other]])));
    assertEqual(boxes.length, 3);
  });


  it('suppresses a corner when a same-facing stair continues the run at the side', () => {
    const frontCorner = OAK.with('facing', 'west');
    const sideRun = OAK.with('facing', 'north');
    const outer = shapeBoxes(OAK, neighborAt(new Map([
      ['0,0,-1', frontCorner],
      ['1,0,0', sideRun],
    ])));
    assertEqual(outer.length, 3, 'outer corner blocked by side continuation');

    const backCorner = OAK.with('facing', 'west');
    const inner = shapeBoxes(OAK, neighborAt(new Map([
      ['0,0,1', backCorner],
      ['-1,0,0', sideRun],
    ])));
    assertEqual(inner.length, 3, 'inner corner blocked by side continuation');
  });

});
