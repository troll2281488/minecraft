import { readSignal } from './redstone_devices.js';

export const RAIL_BLOCK_IDS = Object.freeze([
  'mc:rail', 'mc:powered_rail', 'mc:detector_rail', 'mc:activator_rail',
]);
const RAIL_IDS = new Set(RAIL_BLOCK_IDS);
const DIRECTIONS = Object.freeze([
  { name: 'north', dx: 0, dz: -1 },
  { name: 'south', dx: 0, dz: 1 },
  { name: 'east', dx: 1, dz: 0 },
  { name: 'west', dx: -1, dz: 0 },
]);
const OPPOSITE = Object.freeze({ north: 'south', south: 'north', east: 'west', west: 'east' });
const CURVES = Object.freeze({
  south_east: ['south', 'east'], south_west: ['south', 'west'],
  north_east: ['north', 'east'], north_west: ['north', 'west'],
});
const SLOPES = Object.freeze({
  ascending_east: [1, 0], ascending_west: [-1, 0],
  ascending_north: [0, -1], ascending_south: [0, 1],
});

export function isRailBlock(state) {
  return !!state?.block && RAIL_IDS.has(state.block.id);
}

function railAt(world, x, y, z) {
  if (world.hasChunk && !world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return null;
  const state = world.getBlock(x, y, z);
  return isRailBlock(state) ? state : null;
}

export function deriveRailShape(world, x, y, z) {
  const current = railAt(world, x, y, z);
  if (!current) return null;
  const connected = [];
  let slope = null;
  for (const dir of DIRECTIONS) {
    const same = railAt(world, x + dir.dx, y, z + dir.dz);
    const above = railAt(world, x + dir.dx, y + 1, z + dir.dz);
    const below = railAt(world, x + dir.dx, y - 1, z + dir.dz);
    if (above) {
      connected.push(dir.name);
      slope ||= 'ascending_' + dir.name;
    } else if (same) {
      connected.push(dir.name);
    } else if (below) {
      connected.push(dir.name);
      slope ||= 'ascending_' + OPPOSITE[dir.name];
    }
  }
  if (slope) return slope;
  if (connected.length >= 2) {
    const has = (name) => connected.includes(name);
    if (has('north') && has('south')) return 'north_south';
    if (has('east') && has('west')) return 'east_west';
    if (has('south') && has('east')) return 'south_east';
    if (has('south') && has('west')) return 'south_west';
    if (has('north') && has('east')) return 'north_east';
    if (has('north') && has('west')) return 'north_west';
  }
  if (connected.length === 1) {
    const direction = connected[0];
    return direction === 'north' || direction === 'south' ? 'north_south' : 'east_west';
  }
  return current.get('shape') || 'north_south';
}

export function refreshRailNetwork(world, player, multiplayer = null, radius = 8) {
  if (!world || !player) return 0;
  let changed = 0;
  const baseX = Math.floor(player.x), baseY = Math.floor(player.y), baseZ = Math.floor(player.z);
  const minX = baseX - radius, maxX = baseX + radius;
  const minZ = baseZ - radius, maxZ = baseZ + radius;
  for (let y = baseY - 3; y <= baseY + 3; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const state = world.getBlock(x, y, z);
        if (!isRailBlock(state)) continue;
        const shape = deriveRailShape(world, x, y, z);
        if (!shape || shape === state.get('shape')) continue;
        const next = state.with('shape', shape);
        if (world.setBlock(x, y, z, next)) {
          multiplayer?.pushBlockChange(x, y, z, next);
          changed++;
        }
      }
    }
  }
  return changed;
}

function sourceSignal(world, x, y, z, targetX, targetY, targetZ) {
  const state = world.getBlock(x, y, z);
  if (state.block.id === 'mc:redstone_block') return 15;
  if (state.block.id === 'mc:detector_rail' && state.get('powered')) return 15;
  if (state.block.id === 'mc:lightning_rod' && state.get('powered')) return 15;
  if (state.block.renderShape === 'redstone_wire') return state.get('power') || 0;
  if (state.block.id === 'mc:redstone_torch' && state.get('lit') !== false) return 15;
  if (state.block.renderShape === 'lever' || state.block.renderShape === 'button' ||
      state.block.renderShape === 'pressure_plate' || state.block.renderShape === 'weighted_pressure_plate') {
    return state.get('powered') ? 15 : state.get('power') || 0;
  }
  return readSignal(world, x, y, z, targetX, targetY, targetZ);
}

export function railHasRedstonePower(world, x, y, z) {
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    if (sourceSignal(world, x + dx, y + dy, z + dz, x, y, z) > 0) return true;
  }
  return false;
}

export function tickRailNetwork(world, player, tick, multiplayer = null) {
  if (!world || !player || tick % 10 !== 0) return 0;
  let changed = refreshRailNetwork(world, player, multiplayer, 8);
  const bx = Math.floor(player.x), by = Math.floor(player.y), bz = Math.floor(player.z);
  for (let y = by - 3; y <= by + 3; y++) {
    for (let z = bz - 8; z <= bz + 8; z++) for (let x = bx - 8; x <= bx + 8; x++) {
      const state = world.getBlock(x, y, z);
      if (state.block.id !== 'mc:powered_rail' && state.block.id !== 'mc:activator_rail') continue;
      const powered = railHasRedstonePower(world, x, y, z);
      if (state.get('powered') === powered) continue;
      const next = state.with('powered', powered);
      if (world.setBlock(x, y, z, next)) {
        multiplayer?.pushBlockChange(x, y, z, next);
        changed++;
      }
    }
  }
  return changed;
}

export function railDirection(shape, yaw = 0) {
  const forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };
  let candidates;
  if (shape === 'north_south') candidates = [[0, -1], [0, 1]];
  else if (shape === 'east_west') candidates = [[-1, 0], [1, 0]];
  else if (SLOPES[shape]) {
    const [x, z] = SLOPES[shape];
    candidates = [[x, z], [-x, -z]];
  } else candidates = (CURVES[shape] || ['north', 'south']).flatMap((name) => {
    const d = DIRECTIONS.find((entry) => entry.name === name);
    return [[d.dx, d.dz], [-d.dx, -d.dz]];
  });
  let best = candidates[0], score = -Infinity;
  for (const candidate of candidates) {
    const dot = candidate[0] * forward.x + candidate[1] * forward.z;
    if (dot > score) { score = dot; best = candidate; }
  }
  return { x: best[0], z: best[1] };
}

export function advanceMinecart(cart, railState, input = 0) {
  if (!cart || !isRailBlock(railState)) return { ...cart, speed: 0, vx: 0, vz: 0, derailed: true };
  const shape = railState.get('shape') || 'north_south';
  const direction = railDirection(shape, cart.yaw || 0);
  let speed = Math.max(0, Math.min(0.4, Number(cart.speed) || 0));
  if (input > 0) speed += 0.006;
  else if (input < 0) speed = Math.max(0, speed - 0.018);
  else speed *= 0.997;
  if (railState.block.id === 'mc:powered_rail') {
    if (railState.get('powered')) speed = Math.min(0.4, speed + (speed < 0.02 ? 0.04 : 0.012));
    else speed *= 0.5;
  }
  speed = Math.max(0, Math.min(0.4, speed));
  const slope = SLOPES[shape];
  const slopeRise = slope ? (direction.x * slope[0] + direction.z * slope[1]) : 0;
  const next = {
    ...cart,
    x: cart.x + direction.x * speed,
    y: cart.y + speed * slopeRise,
    z: cart.z + direction.z * speed,
    vx: direction.x * speed,
    vz: direction.z * speed,
    speed,
    yaw: Math.atan2(direction.x, direction.z),
    derailed: false,
  };
  return next;
}

export class MinecartSystem {
  constructor(game) {
    this.game = game;
    this.carts = [];
    this.nextId = 1;
    this.detectorRails = new Set();
  }

  reset() {
    this.carts.length = 0;
    this.detectorRails.clear();
    this.nextId = 1;
    if (this.game.player) this.game.player.ridingMinecart = null;
  }

  placeAt(hit) {
    if (!hit || !isRailBlock(hit.state) || this.game.multiplayer?.roomId) return null;
    if (this.carts.length >= 64) return null;
    const x = hit.x + 0.5, z = hit.z + 0.5, y = hit.y + 0.12;
    if (this.carts.some((cart) => Math.hypot(cart.x - x, cart.z - z) < 0.65)) return null;
    const direction = railDirection(hit.state.get('shape') || 'north_south', this.game.player?.yaw * Math.PI / 180 || 0);
    const cart = { id: this.nextId++, x, y, z, vx: 0, vz: 0, speed: 0, yaw: Math.atan2(direction.x, direction.z), age: 0, derailed: false };
    this.carts.push(cart);
    this.mount(cart);
    return cart;
  }

  mount(cart) {
    const player = this.game.player;
    if (!player || !cart || player.ridingHorse || player.ridingMinecart) return false;
    player.ridingMinecart = cart;
    player.x = cart.x; player.y = cart.y + 0.28; player.z = cart.z;
    player.vx = player.vy = player.vz = 0;
    player.onGround = true;
    return true;
  }

  mountNearest() {
    const player = this.game.player;
    if (!player || player.ridingHorse || player.ridingMinecart) return false;
    const cart = this.carts
      .filter((entry) => Math.hypot(entry.x - player.x, entry.z - player.z) < 1.5 && Math.abs(entry.y - player.y) < 1.4)
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    return cart ? this.mount(cart) : false;
  }

  dismount() {
    const player = this.game.player, cart = player?.ridingMinecart;
    if (!player || !cart) return false;
    player.ridingMinecart = null;
    player.x = cart.x; player.y = cart.y + 0.35; player.z = cart.z;
    player.vx = cart.vx * 0.5; player.vz = cart.vz * 0.5; player.vy = 0;
    player.onGround = false;
    return true;
  }

  tick() {
    const game = this.game, world = game.world, player = game.player;
    if (!world || !player) return;
    const online = !!game.multiplayer?.roomId;
    if (online) {
      if (player.ridingMinecart) player.ridingMinecart = null;
      return;
    }
    const detectorNow = new Set();
    for (let i = this.carts.length - 1; i >= 0; i--) {
      const cart = this.carts[i];
      cart.age++;
      const x = Math.floor(cart.x), z = Math.floor(cart.z);
      let railY = Math.floor(cart.y - 0.05), rail = world.getBlock(x, railY, z);
      if (!isRailBlock(rail)) {
        for (const candidateY of [railY - 1, railY + 1]) {
          const candidate = world.getBlock(x, candidateY, z);
          if (isRailBlock(candidate)) { railY = candidateY; rail = candidate; break; }
        }
      }
      if (!isRailBlock(rail)) {
        cart.speed *= 0.8; cart.vx *= 0.8; cart.vz *= 0.8;
        cart.x += cart.vx; cart.z += cart.vz;
        cart.derailed = true;
        if (player.ridingMinecart === cart) this.dismount();
        if (cart.speed < 0.001) this.carts.splice(i, 1);
        continue;
      }
      cart.y = Math.max(cart.y, railY + 0.12);
      if (rail.block.id === 'mc:detector_rail') detectorNow.add(`${x},${railY},${z}`);
      if (player.ridingMinecart === cart && player.input.sneak) {
        this.dismount();
      } else if (player.ridingMinecart === cart && rail.block.id === 'mc:activator_rail' && rail.get('powered')) {
        this.dismount();
      } else {
        const input = player.ridingMinecart === cart ? player.input.forward : 0;
        const next = advanceMinecart(cart, rail, input);
        Object.assign(cart, next);
        const bx = Math.floor(cart.x), bz = Math.floor(cart.z);
        const nextRailY = Math.floor(cart.y - 0.05);
        const nextRail = world.getBlock(bx, nextRailY, bz);
        if (isRailBlock(nextRail)) cart.y = nextRailY + 0.12;
      }
      if (player.ridingMinecart === cart) {
        player.x = cart.x; player.y = cart.y + 0.28; player.z = cart.z;
        player.vx = cart.vx; player.vy = 0; player.vz = cart.vz;
        player.onGround = true; player.fallDistance = 0;
      }
    }
    for (const key of this.detectorRails) {
      if (detectorNow.has(key)) continue;
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.id === 'mc:detector_rail' && state.get('powered')) {
        const next = state.with('powered', false);
        world.setBlock(x, y, z, next);
        game.multiplayer?.pushBlockChange(x, y, z, next);
      }
    }
    for (const key of detectorNow) {
      if (this.detectorRails.has(key)) continue;
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.id === 'mc:detector_rail' && !state.get('powered')) {
        const next = state.with('powered', true);
        world.setBlock(x, y, z, next);
        game.multiplayer?.pushBlockChange(x, y, z, next);
      }
    }
    this.detectorRails = detectorNow;
  }

  toJSON() {
    return this.carts.slice(0, 64).map((cart) => ({
      id: cart.id, x: cart.x, y: cart.y, z: cart.z,
      vx: cart.vx, vz: cart.vz, speed: cart.speed, yaw: cart.yaw, age: cart.age,
    }));
  }

  loadFrom(entries) {
    this.carts.length = 0;
    this.detectorRails.clear();
    if (!Array.isArray(entries)) { this.nextId = 1; return; }
    for (const entry of entries.slice(0, 64)) {
      if (!entry || !['x','y','z','vx','vz','speed','yaw'].every((key) => Number.isFinite(entry[key])) ||
          entry.y < -64 || entry.y > 320 || Math.abs(entry.x) > 30_000_000 || Math.abs(entry.z) > 30_000_000) continue;
      this.carts.push({
        id: Number.isSafeInteger(entry.id) && entry.id > 0 ? entry.id : this.carts.length + 1,
        x: entry.x, y: entry.y, z: entry.z,
        vx: Math.max(-0.4, Math.min(0.4, entry.vx)), vz: Math.max(-0.4, Math.min(0.4, entry.vz)),
        speed: Math.max(0, Math.min(0.4, entry.speed)), yaw: entry.yaw,
        age: Number.isSafeInteger(entry.age) ? Math.max(0, Math.min(6000, entry.age)) : 0,
        derailed: false,
      });
    }
    this.nextId = this.carts.reduce((next, cart) => Math.max(next, cart.id + 1), 1);
  }
}
