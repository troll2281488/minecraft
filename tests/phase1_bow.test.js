import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { aimVector, createArrow, stepArrow, ARROW } from '../src/entity/arrows.js';
import { drawPower, canFire } from '../src/game/bow.js';

/** Bow and arrow flight (docs/TARGET_1_12_2.md, section 10). */
describe('aiming', () => {
  it('yaw 0 and pitch 0 aim along +Z', () => {
    const [x, y, z] = aimVector(0, 0);
    assert(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z - 1) < 1e-9, `got ${x},${y},${z}`);
  });
  it('positive pitch aims down', () => {
    assert(aimVector(0, 45)[1] < 0, 'y should be negative');
  });
});

describe('arrow flight', () => {
  const noSolid = () => false;
  it('a full-power arrow does 9 damage', () => {
    assertEqual(createArrow(0, 0, 0, [0, 0, 1], 1).damage, ARROW.FULL_DAMAGE);
  });
  it('an arrow flies forward and hits a block in its path', () => {
    const a = createArrow(0.5, 0.5, 0.5, [0, 0, 1], 1);
    const isSolid = (x, y, z) => z === 3;
    let hit = null;
    for (let i = 0; i < 40 && !hit; i++) hit = stepArrow(a, isSolid, []).hit;
    assertEqual(hit, 'block');
  });
  it('an arrow hits a mob in its path and reports it', () => {
    const a = createArrow(0.5, 1, 0.5, [0, 0, 1], 1);
    const mob = { x: 0.5, y: 0.5, z: 3, health: 10 };
    let result = { hit: null };
    for (let i = 0; i < 40 && !result.hit; i++) result = stepArrow(a, noSolid, [mob]);
    assertEqual(result.hit, 'mob');
    assertEqual(result.mob, mob);
  });
  it('an arrow despawns after its lifetime', () => {
    const a = createArrow(0, 200, 0, [0, 0, 0], 0.5);
    for (let i = 0; i <= ARROW.MAX_AGE + 1; i++) stepArrow(a, noSolid, []);
    assert(a.done, 'arrow should be done');
  });
  it('gravity pulls a flat arrow down', () => {
    const a = createArrow(0, 10, 0, [0, 0, 1], 1);
    const y0 = a.vy;
    stepArrow(a, noSolid, []);
    assert(a.vy < y0, 'vertical speed should drop');
  });
});

describe('bow draw', () => {
  it('a tap does not fire', () => assertEqual(canFire(1), false));
  it('a full draw fires at full power', () => assertEqual(drawPower(20), 1));
});
