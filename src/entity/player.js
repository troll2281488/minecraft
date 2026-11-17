/**
 * The player: movement, collision, and camera state.
 *
 * The numbers here are Minecraft's actual movement constants, not
 * approximations. Gravity 0.08 blocks per tick squared, drag 0.98, jump
 * velocity 0.42, ground friction 0.6. They look arbitrary because they are --
 * they are the values the game shipped with, and anyone who has played a few
 * hundred hours can feel a 10% error in any of them immediately. Getting the
 * feel right is almost entirely a matter of not "improving" these.
 *
 * Physics runs on the fixed 20 TPS tick, which is why the constants transfer
 * verbatim rather than needing rescaling by frame time.
 */

import { PHYSICS, SPEED, SLIPPERINESS, TICKS_PER_SECOND, MAX_HEALTH, MIN_Y } from '../core/constants.js';
import { AABB } from '../core/math.js';
import { PlayerVitals } from './vitals.js';
import { collisionBoxes } from '../world/shapes.js';

/** Blocks per second converted to blocks per tick. */
const perTick = (blocksPerSecond) => blocksPerSecond / TICKS_PER_SECOND;

/**
 * Vanilla ground friction is the block's slipperiness times 0.91, applied to
 * horizontal velocity at the END of each tick. On normal ground that is
 * 0.6 * 0.91 = 0.546.
 */
const GROUND_FRICTION_MULT = 0.91;
const NORMAL_GROUND_FRICTION = SLIPPERINESS.DEFAULT * GROUND_FRICTION_MULT; // 0.546

export const GAMEMODE = {
  SURVIVAL: 'survival',
  CREATIVE: 'creative',
  SPECTATOR: 'spectator',
};

export class Player {
  constructor(x = 0, y = 80, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;

    this.yaw = 0;      // degrees; 0 faces +Z (south)
    this.pitch = 0;    // degrees; positive looks down

    this.onGround = false;
    this.sneaking = false;
    this.sprinting = false;
    this.flying = false;
    this.inWater = false;

    this.gamemode = GAMEMODE.SURVIVAL;
    this.health = MAX_HEALTH;
    this.vitals = new PlayerVitals();

    this.fallDistance = 0;

    /** Movement intent, set by input each tick. */
    this.input = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
  }

  get height() {
    return this.sneaking ? PHYSICS.PLAYER_CROUCH_HEIGHT : PHYSICS.PLAYER_HEIGHT;
  }

  get eyeHeight() {
    return this.sneaking ? PHYSICS.PLAYER_CROUCH_EYE_HEIGHT : PHYSICS.PLAYER_EYE_HEIGHT;
  }

  get eyeY() {
    return this.y + this.eyeHeight;
  }

  get reach() {
    return this.gamemode === GAMEMODE.CREATIVE ? PHYSICS.REACH_CREATIVE : PHYSICS.REACH_SURVIVAL;
  }

  boundingBox() {
    return AABB.fromCenter(this.x, this.y, this.z, PHYSICS.PLAYER_WIDTH, this.height);
  }

  /**
   * One physics step. Call at exactly 20 Hz.
   *
   * The order is vanilla's and it matters: apply the player's input to velocity,
   * MOVE by that velocity, THEN apply gravity and friction for the next tick.
   *
   * The old code decayed velocity before moving, which stole the first tick of
   * every jump -- the apex came out at 0.83 blocks instead of 1.25, low enough
   * that you could not get onto a single block. Moving before decaying gives
   * exactly the vanilla 1.2522-block apex. See _applyInput for the matching
   * horizontal-speed calibration this order requires.
   */
  tick(world) {
    this.sneaking = this.input.sneak && this.onGround && !this.flying;
    this.sprinting = this.input.sprint && this.input.forward > 0 && !this.sneaking;

    this.inWater = this._isInWater(world);

    const oldX = this.x, oldZ = this.z;
    const jumped = this.input.jump && this.onGround;

    if (this.flying) {
      this._tickFlying();
      this._move(world);
      this.vitals.tick(this, Math.hypot(this.x - oldX, this.z - oldZ), false, false);
      return;
    }

    // Slipperiness is read once, before the move, and used both for the input
    // acceleration and for the end-of-tick friction -- as vanilla does.
    const slipperiness = this.onGround
      ? this._slipperinessBelow(world)
      : PHYSICS.DEFAULT_SLIPPERINESS;

    this._applyInput(slipperiness);
    this._move(world);
    this._applyGravityAndFriction(slipperiness);
    this.vitals.tick(this, Math.hypot(this.x - oldX, this.z - oldZ), this.sprinting, jumped);
  }

  _tickFlying() {
    const speed = perTick(this.input.sprint ? SPEED.FLY_SPRINT : SPEED.FLY);
    const [ax, az] = this._wishDirection(speed);

    this.vx = ax;
    this.vz = az;
    this.vy = 0;
    if (this.input.jump) this.vy = speed;
    if (this.input.sneak) this.vy = -speed;

    this.fallDistance = 0;
  }

  /**
   * Apply movement input and jump to velocity. Runs BEFORE the move.
   *
   * The ground acceleration is calibrated so the steady-state speed matches the
   * target exactly. With the (input, move, friction) tick order, the speed a
   * player settles at is `acceleration / (1 - groundFriction)`. So to reach a
   * target of, say, 0.2159 blocks/tick (walk, 4.317 m/s), the acceleration must
   * be `target * (1 - groundFriction)`. Feeding the raw target as the
   * acceleration -- the old bug -- overshot the steady state by ~20%.
   *
   * The `(0.6 / slipperiness)^3` term is what gives ice its distinct feel: on a
   * slippery block acceleration drops, so you build speed slowly and keep
   * sliding, rather than simply moving faster.
   */
  _applyInput(slipperiness) {
    const target = perTick(
      this.inWater ? SPEED.SWIM
        : this.sneaking ? SPEED.SNEAK
        : this.sprinting ? SPEED.SPRINT
        : SPEED.WALK,
    );

    let acceleration;
    if (this.onGround) {
      acceleration = target * (1 - NORMAL_GROUND_FRICTION) * (0.6 / slipperiness) ** 3;
    } else {
      // Air control: a fraction of ground acceleration, so you can steer a jump
      // a little but not change direction freely mid-air.
      acceleration = target * (1 - NORMAL_GROUND_FRICTION) * 0.2;
    }

    const [ax, az] = this._wishDirection(acceleration);
    this.vx += ax;
    this.vz += az;

    if (this.input.jump) {
      if (this.inWater) {
        this.vy = perTick(SPEED.SWIM) * 3;
      } else if (this.onGround) {
        this.vy = PHYSICS.JUMP_VELOCITY;
        // Sprint-jumping gets a forward impulse, which is why it is the fastest
        // way to travel on foot in Minecraft.
        if (this.sprinting) {
          const yaw = (this.yaw * Math.PI) / 180;
          this.vx += -Math.sin(yaw) * 0.2;
          this.vz += Math.cos(yaw) * 0.2;
        }
        this.onGround = false;
      }
    }
  }

  /**
   * Apply gravity and friction. Runs AFTER the move, decaying velocity for the
   * next tick. Uses the same slipperiness the input step used.
   */
  _applyGravityAndFriction(slipperiness) {
    if (this.inWater) {
      this.vy -= 0.02;              // buoyant: much weaker than real gravity
      this.vx *= 0.8; this.vy *= 0.8; this.vz *= 0.8;
    } else {
      this.vy -= PHYSICS.GRAVITY;
      this.vy *= PHYSICS.DRAG_VERTICAL;
      const friction = this.onGround
        ? slipperiness * GROUND_FRICTION_MULT
        : PHYSICS.DRAG_HORIZONTAL_AIR;
      this.vx *= friction;
      this.vz *= friction;
    }

    if (this.vy < PHYSICS.TERMINAL_VELOCITY) this.vy = PHYSICS.TERMINAL_VELOCITY;
  }

  /**
   * Movement input rotated into world space.
   *
   * The strafe term is SUBTRACTED, not added -- pressing right (D, strafe = +1)
   * has to move you toward your right hand, which is `cross(forward, up)`. With
   * forward = [-sin, cos] in (x, z), that right vector is [-cos, -sin], so a
   * positive strafe contributes (-cos, -sin), i.e. the strafe terms carry a
   * minus sign. The old code added them, which sent "right" to your left --
   * every player noticed movement was mirrored.
   */
  _wishDirection(magnitude) {
    const forward = this.input.forward;
    const strafe = this.input.strafe;
    if (forward === 0 && strafe === 0) return [0, 0];

    // Normalizing means diagonal movement is not faster than cardinal, which is
    // the classic bug this avoids.
    const length = Math.hypot(forward, strafe);
    const f = forward / length;
    const s = strafe / length;

    const yaw = (this.yaw * Math.PI) / 180;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    return [
      (-sin * f - cos * s) * magnitude,
      (cos * f - sin * s) * magnitude,
    ];
  }

  _slipperinessBelow(world) {
    const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z));
    return below.block.slipperiness ?? SLIPPERINESS.DEFAULT;
  }

  _isInWater(world) {
    const block = world.getBlock(
      Math.floor(this.x), Math.floor(this.y + 0.4), Math.floor(this.z),
    ).block;
    return block.id === 'mc:water';
  }

  /**
   * Move by the current velocity, resolving collisions one axis at a time.
   *
   * Axis-separated resolution is what lets a player slide along a wall instead
   * of stopping dead against it: blocking X does not affect the Z component of
   * the same move. Doing it as a single swept test would require far more work
   * to get the same behaviour.
   */
  _move(world) {
    if (this.gamemode === GAMEMODE.SPECTATOR) {
      this.x += this.vx; this.y += this.vy; this.z += this.vz;
      return;
    }

    const wasOnGround = this.onGround;
    this.onGround = false;

    // Y first, so standing on ground is resolved before horizontal motion and
    // step-up has a correct notion of what "ground" means this tick.
    if (this.vy !== 0) {
      const moved = this._moveAxis(world, 'y', this.vy);
      if (!moved) {
        if (this.vy < 0) {
          this.onGround = true;
          this._land();
        }
        this.vy = 0;
      }
    }

    if (this.vx !== 0) {
      if (!this._moveAxis(world, 'x', this.vx)) {
        if (!this._tryStep(world, 'x', this.vx, wasOnGround)) this.vx = 0;
      }
    }

    if (this.vz !== 0) {
      if (!this._moveAxis(world, 'z', this.vz)) {
        if (!this._tryStep(world, 'z', this.vz, wasOnGround)) this.vz = 0;
      }
    }

    if (!this.onGround && this.vy < 0) this.fallDistance -= this.vy;

    // Sneaking must not walk off an edge. Checked after movement so it can be
    // undone, which is how vanilla does it too.
    if (this.sneaking && this.onGround) this._preventLedgeFall(world);

    if (this.y < MIN_Y - 64) this.y = MIN_Y - 64; // void floor, for now
  }

  /** @returns {boolean} true if the full move succeeded */
  _moveAxis(world, axis, amount) {
    const original = this[axis];
    this[axis] = original + amount;
    if (!this._collides(world)) return true;

    // Binary search the largest fraction of the move that does not collide.
    // Eight iterations resolves to under 1/256 of a block, which is far finer
    // than anything visible and much cheaper than a swept intersection test.
    let lo = 0;
    let hi = amount;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      this[axis] = original + mid;
      if (this._collides(world)) hi = mid;
      else lo = mid;
    }
    this[axis] = original + lo;
    return false;
  }

  /** Auto-step up a single block, as when walking onto a slab or stair. */
  _tryStep(world, axis, amount, wasOnGround) {
    if (!wasOnGround && !this.onGround) return false;

    const savedY = this.y;
    const savedAxis = this[axis];

    this.y += PHYSICS.STEP_HEIGHT;
    if (this._collides(world)) {
      this.y = savedY;
      return false;
    }

    this[axis] = savedAxis + amount;
    if (this._collides(world)) {
      this.y = savedY;
      this[axis] = savedAxis;
      return false;
    }

    // Settle back down onto whatever was stepped onto.
    this._moveAxis(world, 'y', -PHYSICS.STEP_HEIGHT);
    this.onGround = true;
    return true;
  }

  _preventLedgeFall(world) {
    const probe = this.boundingBox();
    probe.minY -= 0.5;
    probe.maxY = probe.minY + 0.1;
    if (this._boxIntersectsSolid(world, probe)) return;

    // Nothing underneath: back the move out. Tested per axis so sneaking along
    // an edge still works in the direction that is safe.
    const stepBack = 0.05;
    for (let i = 0; i < 20; i++) {
      const test = this.boundingBox();
      test.minY -= 0.5;
      test.maxY = test.minY + 0.1;
      if (this._boxIntersectsSolid(world, test)) return;
      this.x -= Math.sign(this.vx) * stepBack;
      this.z -= Math.sign(this.vz) * stepBack;
    }
  }

  _land() {
    this.fallDistance = 0;
  }

  _collides(world) {
    return this._boxIntersectsSolid(world, this.boundingBox());
  }

  _boxIntersectsSolid(world, box) {
    const minX = Math.floor(box.minX);
    const maxX = Math.floor(box.maxX - 1e-7);
    const minY = Math.floor(box.minY);
    const maxY = Math.floor(box.maxY - 1e-7);
    const minZ = Math.floor(box.minZ);
    const maxZ = Math.floor(box.maxZ - 1e-7);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const state = world.getBlock(x, y, z);
          // Per-shape boxes: a full cube returns one box, a slab a half box, a
          // stair two -- the same boxes the mesher draws, so what you see is
          // what you collide with. Non-solid blocks return none.
          const boxes = collisionBoxes(state);
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (box.intersects(new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]))) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  look(deltaYaw, deltaPitch) {
    this.yaw = (this.yaw + deltaYaw) % 360;
    if (this.yaw < 0) this.yaw += 360;
    // Clamping rather than wrapping: looking past straight up should stop, not
    // flip the world over.
    this.pitch = Math.max(-90, Math.min(90, this.pitch + deltaPitch));
  }

  teleport(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
  }

  toJSON() {
    return {
      pos: { x: this.x, y: this.y, z: this.z },
      rot: { yaw: this.yaw, pitch: this.pitch },
      health: this.health,
      vitals: this.vitals.toJSON(),
      gamemode: this.gamemode,
      flying: this.flying,
    };
  }

  loadFrom(json) {
    if (!json) return this;
    if (json.pos) { this.x = json.pos.x; this.y = json.pos.y; this.z = json.pos.z; }
    if (json.rot) { this.yaw = json.rot.yaw; this.pitch = json.rot.pitch; }
    this.health = json.health ?? MAX_HEALTH;
    this.vitals.loadFrom(json.vitals);
    this.gamemode = json.gamemode ?? GAMEMODE.SURVIVAL;
    this.flying = json.flying ?? false;
    return this;
  }
}
