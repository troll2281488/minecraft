import { Player, GAMEMODE } from '../src/entity/player.js';

describe('survival fall damage', () => {
  it('takes no fall damage at or below three blocks', () => {
    const player = new Player();
    player.gamemode = GAMEMODE.SURVIVAL;
    player.fallDistance = 3;
    player._land();
    assertEqual(player.health, 20);
  });

  it('takes one health point per block beyond three', () => {
    const player = new Player();
    player.gamemode = GAMEMODE.SURVIVAL;
    player.fallDistance = 7;
    player._land();
    assertEqual(player.health, 16);
    assertEqual(player.fallDistance, 0);
  });

  it('does not take fall damage in creative mode', () => {
    const player = new Player();
    player.gamemode = GAMEMODE.CREATIVE;
    player.fallDistance = 20;
    player._land();
    assertEqual(player.health, 20);
  });
});

import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Player, GAMEMODE } from '../src/entity/player.js';
import { BLOCKS } from '../src/world/block.js';
import { AABB } from '../src/core/math.js';
import { forwardVector } from '../src/core/mat4.js';

/**
 * Player physics regression tests.
 *
 * These pin the two bugs the playtest found: jumps that were too low to clear a
 * single block, and horizontal speeds ~20% too fast. Both came from the same
 * root cause -- the physics tick decayed velocity before moving instead of
 * after -- and both are checked here against the exact vanilla figures.
 *
 * The world is a minimal stub: a solid floor below `floorY`, air above, with an
 * optional raised ledge. That is all Player.tick reads (getBlock().block for
 * solidity, slipperiness, and the water check), so no chunks or renderer are
 * needed and the tests run headless.
 */

const STONE = BLOCKS.get('mc:stone').defaultState;
const AIR = BLOCKS.get('mc:air').defaultState;

function flatWorld(floorY, ledge = null) {
  return {
    getBlock(x, y, z) {
      if (ledge && x >= ledge.x0 && x <= ledge.x1 && z >= ledge.z0 && z <= ledge.z1 &&
          y > floorY && y <= ledge.top) {
        return STONE;
      }
      return y <= floorY ? STONE : AIR;
    },
  };
}

function newPlayer(world, floorY) {
  const p = new Player(0.5, floorY + 1, 0.5);
  p.gamemode = GAMEMODE.SURVIVAL;
  resetInput(p);
  for (let i = 0; i < 20; i++) p.tick(world); // settle
  return p;
}

function resetInput(p, o = {}) {
  Object.assign(p.input, { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false }, o);
}

/**
 * Steady-state horizontal speed in blocks/second, measured by real displacement
 * (not velocity -- with the correct tick order, the stored velocity is the
 * post-friction value, which is smaller than the distance actually moved).
 */
function measureSpeed(world, floorY, input) {
  const p = newPlayer(world, floorY);
  p.yaw = 0; // face +Z
  resetInput(p, input);
  for (let i = 0; i < 40; i++) p.tick(world); // reach terminal speed
  const z0 = p.z;
  const ticks = 10;
  for (let i = 0; i < ticks; i++) p.tick(world);
  return (Math.abs(p.z - z0) / ticks) * 20;
}

describe('physics: horizontal speed matches vanilla exactly', () => {
  const world = flatWorld(64);

  it('walk is 4.317 m/s', () => {
    const s = measureSpeed(world, 64, { forward: 1 });
    assert(Math.abs(s - 4.317) < 0.01, `walk = ${s.toFixed(3)}, expected 4.317`);
  });

  it('sprint is 5.612 m/s', () => {
    const s = measureSpeed(world, 64, { forward: 1, sprint: true });
    assert(Math.abs(s - 5.612) < 0.01, `sprint = ${s.toFixed(3)}, expected 5.612`);
  });

  it('sneak is 1.295 m/s', () => {
    const s = measureSpeed(world, 64, { forward: 1, sneak: true });
    assert(Math.abs(s - 1.295) < 0.01, `sneak = ${s.toFixed(3)}, expected 1.295`);
  });

  it('diagonal movement is not faster than straight', () => {
    const straight = measureSpeed(world, 64, { forward: 1 });
    // Move at 45 degrees: forward + strafe. Should normalize to the same speed.
    const p = newPlayer(world, 64);
    p.yaw = 0;
    resetInput(p, { forward: 1, strafe: 1 });
    for (let i = 0; i < 40; i++) p.tick(world);
    const x0 = p.x, z0 = p.z;
    for (let i = 0; i < 10; i++) p.tick(world);
    const diagonal = (Math.hypot(p.x - x0, p.z - z0) / 10) * 20;
    assert(Math.abs(diagonal - straight) < 0.02, `diagonal ${diagonal.toFixed(3)} != straight ${straight.toFixed(3)}`);
  });
});

describe('physics: strafe moves toward your true right (not mirrored)', () => {
  const world = flatWorld(64);

  // The right-hand direction is cross(forward, worldUp). The horizontal part of
  // forward is [-sin(yaw), cos(yaw)], so right = [-forward.z, forward.x] in
  // (x, z). Pressing D (strafe +1) must move that way.
  function rightOf(yaw) {
    const f = forwardVector(yaw, 0);
    return [-f[2], f[0]]; // (x, z) of cross(forward, up)
  }

  for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
    it(`D at yaw ${yaw} moves toward the right-hand direction`, () => {
      const p = newPlayer(world, 64);
      p.yaw = yaw;
      resetInput(p, {});
      for (let i = 0; i < 8; i++) p.tick(world);
      const x0 = p.x, z0 = p.z;
      resetInput(p, { strafe: 1 }); // press D
      for (let i = 0; i < 15; i++) p.tick(world);
      const moved = [p.x - x0, p.z - z0];
      const right = rightOf(yaw);
      // Dot product with the expected right vector must be clearly positive.
      const dot = moved[0] * right[0] + moved[1] * right[1];
      const len = Math.hypot(moved[0], moved[1]);
      assert(len > 0.5, `barely moved at yaw ${yaw}`);
      assert(dot > 0.9 * len, `yaw ${yaw}: moved ${moved.map((v) => v.toFixed(2))} not toward right ${right.map((v) => v.toFixed(2))}`);
    });
  }

  it('A and D move in opposite directions', () => {
    const rightMove = () => {
      const p = newPlayer(world, 64); p.yaw = 0;
      resetInput(p, { strafe: 1 });
      const x0 = p.x; for (let i = 0; i < 15; i++) p.tick(world);
      return p.x - x0;
    };
    const leftMove = () => {
      const p = newPlayer(world, 64); p.yaw = 0;
      resetInput(p, { strafe: -1 });
      const x0 = p.x; for (let i = 0; i < 15; i++) p.tick(world);
      return p.x - x0;
    };
    assert(Math.sign(rightMove()) === -Math.sign(leftMove()), 'A and D did not oppose each other');
  });

  it('W moves forward, along the facing direction', () => {
    const p = newPlayer(world, 64);
    p.yaw = 0; // facing +Z
    resetInput(p, { forward: 1 });
    const z0 = p.z;
    for (let i = 0; i < 15; i++) p.tick(world);
    assert(p.z - z0 > 0.5, `W did not move forward (+Z); dz=${(p.z - z0).toFixed(2)}`);
  });
});

describe('physics: jump clears a full block', () => {
  const world = flatWorld(64);

  it('jump apex is the vanilla 1.252 blocks', () => {
    const p = newPlayer(world, 64);
    const base = p.y;
    resetInput(p, { jump: true });
    p.tick(world);
    resetInput(p);
    let peak = p.y;
    for (let i = 0; i < 40; i++) { p.tick(world); peak = Math.max(peak, p.y); if (p.onGround && i > 3) break; }
    const apex = peak - base;
    assert(Math.abs(apex - 1.252) < 0.02, `apex = ${apex.toFixed(3)}, expected 1.252`);
  });

  it('apex exceeds 1.0 -- the whole point: you can get onto a block', () => {
    // This is the regression that made the game barely playable. The old apex
    // was 0.83, below a full block, so with step height 0.6 there was no way
    // onto a single ledge at all.
    const p = newPlayer(world, 64);
    const base = p.y;
    resetInput(p, { jump: true });
    p.tick(world); resetInput(p);
    let peak = p.y;
    for (let i = 0; i < 40; i++) { p.tick(world); peak = Math.max(peak, p.y); if (p.onGround && i > 3) break; }
    assert(peak - base >= 1.0, `apex ${(peak - base).toFixed(3)} cannot clear a 1-block ledge`);
  });

  it('can actually jump onto a 1-block ledge', () => {
    // End to end: a real ledge, approach and jump, confirm the player ends up
    // standing on top of it.
    const world = flatWorld(64, { x0: -2, x1: 2, z0: 3, z1: 8, top: 65 });
    const p = newPlayer(world, 64);
    p.yaw = 0; // toward +Z, into the ledge
    let mounted = false;
    for (let attempt = 0; attempt < 8 && !mounted; attempt++) {
      resetInput(p, { forward: 1, jump: true });
      for (let i = 0; i < 25; i++) {
        p.tick(world);
        if (p.z > 3 && p.y >= 65.9) { mounted = true; break; }
      }
    }
    assert(mounted, `never got onto the ledge (ended at y=${p.y.toFixed(2)}, z=${p.z.toFixed(2)})`);
  });
});

describe('physics: gravity and falling', () => {
  it('settles onto the ground and stays there', () => {
    const world = flatWorld(64);
    const p = newPlayer(world, 64);
    assert(p.onGround, 'player did not settle onto the ground');
    assertEqual(Math.round(p.y), 65);
    // Idle for a while; must not sink or drift.
    const y = p.y;
    for (let i = 0; i < 40; i++) p.tick(world);
    assert(Math.abs(p.y - y) < 1e-6, `player drifted from ${y} to ${p.y}`);
  });

  it('falls and does not pass through the floor', () => {
    const world = flatWorld(64);
    const p = new Player(0.5, 90, 0.5);
    p.gamemode = GAMEMODE.SURVIVAL;
    resetInput(p);
    for (let i = 0; i < 120; i++) p.tick(world);
    assert(p.onGround, 'never landed');
    assert(p.y >= 65 - 1e-6, `fell through the floor to y=${p.y}`);
    assertEqual(Math.round(p.y), 65);
  });

  it('respects terminal velocity', () => {
    const world = { getBlock: () => AIR }; // endless void
    const p = new Player(0.5, 300, 0.5);
    p.gamemode = GAMEMODE.SURVIVAL;
    resetInput(p);
    for (let i = 0; i < 200; i++) p.tick(world);
    assert(p.vy >= -3.92 - 1e-6, `vy ${p.vy} exceeded terminal velocity -3.92`);
  });
});

describe('physics: collision', () => {
  it('a wall stops horizontal movement instead of passing through', () => {
    // Floor plus a wall filling z >= 3.
    const world = {
      getBlock(x, y, z) {
        if (y <= 64) return STONE;
        if (z >= 3 && y <= 67) return STONE;
        return AIR;
      },
    };
    const p = new Player(0.5, 65, 0.5);
    p.gamemode = GAMEMODE.SURVIVAL;
    resetInput(p); for (let i = 0; i < 10; i++) p.tick(world);
    p.yaw = 0;
    resetInput(p, { forward: 1 });
    for (let i = 0; i < 60; i++) p.tick(world);
    // Player half-width 0.3, wall face at z=3, so center cannot pass z=2.7.
    assert(p.z <= 2.7 + 1e-3, `player passed into the wall: z=${p.z.toFixed(3)}`);
  });

  it('flying holds altitude with no gravity', () => {
    const world = flatWorld(64);
    const p = new Player(0.5, 120, 0.5);
    p.gamemode = GAMEMODE.CREATIVE;
    p.flying = true;
    resetInput(p);
    const y0 = p.y;
    for (let i = 0; i < 40; i++) p.tick(world);
    assert(Math.abs(p.y - y0) < 1e-6, `flying player drifted from ${y0} to ${p.y}`);
  });
});
