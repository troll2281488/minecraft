import { describe, it, assert, assertEqual } from './framework.js';
import {
  deriveRailShape, refreshRailNetwork, railDirection, advanceMinecart,
  MinecartSystem, isRailBlock,
} from '../src/game/railways.js';

function state(id, values = {}) {
  return {
    block: { id },
    values: { shape: 'north_south', powered: false, ...values },
    get(key) { return this.values[key]; },
    with(key, value) { return state(id, { ...this.values, [key]: value }); },
  };
}

function worldWith(blocks = new Map()) {
  return {
    blocks,
    hasChunk: () => true,
    getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || state('mc:air'); },
    setBlock(x, y, z, next) { blocks.set(`${x},${y},${z}`, next); return true; },
  };
}

describe('Java rail topology', () => {
  it('recognizes rail families and derives straight and curved connections', () => {
    assertEqual(isRailBlock(state('mc:rail')), true);
    assertEqual(isRailBlock(state('mc:powered_rail')), true);
    assertEqual(isRailBlock(state('mc:detector_rail')), true);
    assertEqual(isRailBlock(state('mc:activator_rail')), true);
    const blocks = new Map([
      ['0,64,-1', state('mc:rail')],
      ['0,64,0', state('mc:rail', { shape: 'east_west' })],
      ['0,64,1', state('mc:rail', { shape: 'east_west' })],
    ]);
    assertEqual(deriveRailShape(worldWith(blocks), 0, 64, 0), 'north_south');
    blocks.delete('0,64,-1');
    blocks.set('1,64,0', state('mc:rail'));
    assertEqual(deriveRailShape(worldWith(blocks), 0, 64, 0), 'south_east');
  });

  it('derives slopes when an adjacent rail is one block higher', () => {
    const blocks = new Map([
      ['0,64,0', state('mc:rail')],
      ['1,65,0', state('mc:rail')],
    ]);
    assertEqual(deriveRailShape(worldWith(blocks), 0, 64, 0), 'ascending_east');
  });

  it('refreshes only changed nearby rail states', () => {
    const blocks = new Map([
      ['0,64,0', state('mc:rail')],
      ['0,64,1', state('mc:rail')],
    ]);
    const world = worldWith(blocks);
    const player = { x: 0.5, y: 64, z: 0.5 };
    assertEqual(refreshRailNetwork(world, player), 2);
    assertEqual(world.getBlock(0,64,0).get('shape'), 'north_south');
    assertEqual(refreshRailNetwork(world, player), 0);
  });
});

describe('Minecart movement and transport', () => {
  it('aligns a cart with its track and accelerates under forward input', () => {
    const rail = state('mc:rail', { shape: 'east_west' });
    const cart = { x: 0.5, y: 64.12, z: 0.5, speed: 0, yaw: Math.PI / 2 };
    const next = advanceMinecart(cart, rail, 1);
    assertEqual(next.speed > 0, true);
    assertEqual(Math.abs(next.vx) > 0, true);
    assertEqual(Math.abs(next.vz) < 1e-9, true);
    assertEqual(next.derailed, false);
  });

  it('accelerates on powered rails and brakes on unpowered powered rails', () => {
    const cart = { x: 0.5, y: 64.12, z: 0.5, speed: 0.1, yaw: 0 };
    const powered = advanceMinecart(cart, state('mc:powered_rail', { powered: true }), 0);
    const unpowered = advanceMinecart(cart, state('mc:powered_rail', { powered: false }), 0);
    assertEqual(powered.speed > cart.speed, true);
    assertEqual(unpowered.speed < cart.speed, true);
  });

  it('follows ascending rails and clamps speed to the vanilla-style cap', () => {
    const cart = { x: 0.5, y: 64.12, z: 0.5, speed: 0.39, yaw: Math.PI / 2 };
    const next = advanceMinecart(cart, state('mc:rail', { shape: 'ascending_east' }), 1);
    assertEqual(next.speed <= 0.4, true);
    assertEqual(next.y > cart.y, true);
  });

  it('places and mounts carts, then persists bounded cart state', () => {
    const blocks = new Map([['0,64,0', state('mc:rail')]]);
    const world = worldWith(blocks);
    const player = { x: 0.5, y: 64, z: 0.5, yaw: 0, input: { forward: 1, sneak: false }, onGround: true };
    const game = { world, player, multiplayer: null };
    const system = new MinecartSystem(game);
    const cart = system.placeAt({ x: 0, y: 64, z: 0, state: world.getBlock(0,64,0) });
    assert(cart);
    assertEqual(player.ridingMinecart, cart);
    system.tick();
    assertEqual(cart.speed > 0, true);
    const saved = system.toJSON();
    const restored = new MinecartSystem(game);
    restored.loadFrom(saved);
    assertEqual(restored.carts.length, 1);
    assertEqual(restored.carts[0].speed, cart.speed);
    restored.loadFrom([{ x: NaN, y: 64, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0 }]);
    assertEqual(restored.carts.length, 0);
  });

  it('powers a detector rail while a cart occupies it and clears it afterward', () => {
    const detector = state('mc:detector_rail', { powered: false });
    const blocks = new Map([['0,64,0', detector]]);
    const world = worldWith(blocks);
    const player = { x: 0.5, y: 64, z: 0.5, yaw: 0, input: { forward: 0, sneak: false }, onGround: true };
    const game = { world, player, multiplayer: null };
    const system = new MinecartSystem(game);
    const cart = system.placeAt({ x: 0, y: 64, z: 0, state: detector });
    assert(cart);
    system.tick();
    assertEqual(world.getBlock(0,64,0).get('powered'), true);
    system.carts.length = 0;
    system.tick();
    assertEqual(world.getBlock(0,64,0).get('powered'), false);
  });
});
