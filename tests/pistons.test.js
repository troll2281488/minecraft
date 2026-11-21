import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes } from '../src/world/shapes.js';
import { planPistonMove, PISTON_MAX_PUSH, pistonBlocksStick } from '../src/game/pistons.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';
import { RECIPES } from '../src/game/recipes.js';
import { ITEMS } from '../src/world/item.js';
import { rollMobDrops } from '../src/entity/mobs.js';
import { blockEmissionForState } from '../src/world/lighting.js';
import { MAX_Y } from '../src/core/constants.js';
import { Player } from '../src/entity/player.js';

const AIR = BLOCKS.get('mc:air').defaultState;
const STONE = BLOCKS.get('mc:stone').defaultState;

function makeWorld(entries = []) {
  const blocks = new Map(entries);
  return {
    blocks,
    world: {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || AIR; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    },
  };
}

describe('piston and sticky piston', () => {
  it('registers both piston types, internal head, items and recipes', () => {
    for (const id of ['mc:piston', 'mc:sticky_piston', 'mc:piston_head', 'mc:slime_block']) {
      assert(BLOCKS.get(id), `${id} block missing`);
    }
    for (const id of ['mc:piston', 'mc:sticky_piston', 'mc:slime_block']) {
      assert(RECIPES.recipes.some((recipe) => recipe.result === id), `${id} recipe missing`);
    }
    assertEqual(BLOCKS.get('mc:piston').defaultState.get('extended'), false);
    assertEqual(BLOCKS.get('mc:piston_head').defaultState.get('sticky'), false);
    assert(ITEMS.get('mc:slime_ball'), 'slime ball item missing');
    assert(ITEMS.get('mc:slime_block'), 'slime block item missing');
  });

  it('renders the oriented head as two physical boxes', () => {
    const head = BLOCKS.get('mc:piston_head').defaultState.with('facing', 'east');
    assertEqual(shapeBoxes(head).length, 2);
    assertEqual(collisionBoxes(head).length, 2);
    assert(shapeBoxes(head).every((box) => box.length === 6));
  });

  it('plans a complete line and moves no more than twelve blocks', () => {
    const entries = [];
    for (let x = 1; x <= PISTON_MAX_PUSH; x++) entries.push([`${x},0,0`, STONE]);
    const { world } = makeWorld(entries);
    const plan = planPistonMove(world, 0, 0, 0, 'east');
    assertEqual(plan.length, PISTON_MAX_PUSH);
    assertEqual(plan[0].from.x, 1);
    assertEqual(plan[plan.length - 1].to.x, 13);
  });

  it('rejects a thirteenth block and immovable blocks without mutating the world', () => {
    const entries = [];
    for (let x = 1; x <= 13; x++) entries.push([`${x},0,0`, STONE]);
    let { world, blocks } = makeWorld(entries);
    assertEqual(planPistonMove(world, 0, 0, 0, 'east'), null);
    assertEqual(blocks.get('1,0,0'), STONE);

    ({ world, blocks } = makeWorld([['1,0,0', BLOCKS.get('mc:obsidian').defaultState]]));
    assertEqual(planPistonMove(world, 0, 0, 0, 'east'), null);
    assertEqual(blocks.get('1,0,0').block.id, 'mc:obsidian');
  });

  it('sticks slime blocks to ordinary blocks but not to unrelated ordinary blocks', () => {
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    assertEqual(pistonBlocksStick(slime, STONE), true);
    assertEqual(pistonBlocksStick(STONE, slime), true);
    assertEqual(pistonBlocksStick(STONE, STONE), false);
  });

  it('registers honey block with vanilla slipperiness and an inventory item', () => {
    const honey = BLOCKS.get('mc:honey_block');
    assert(honey, 'honey block missing');
    assert(ITEMS.get('mc:honey_block'), 'honey block item missing');
    assertEqual(honey.slipperiness, 0.4);
  });

  it('honey adheres to ordinary blocks but not slime blocks', () => {
    const honey = BLOCKS.get('mc:honey_block').defaultState;
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    assertEqual(pistonBlocksStick(honey, STONE), true);
    assertEqual(pistonBlocksStick(STONE, honey), true);
    assertEqual(pistonBlocksStick(honey, honey), true);
    assertEqual(pistonBlocksStick(honey, slime), false);
    assertEqual(pistonBlocksStick(slime, honey), false);
  });

  it('slides a falling player slowly down a honey wall and clears fall distance', () => {
    const player = new Player(0.7, 1, 0.5);
    player.vy = -0.42;
    player.fallDistance = 8;
    const world = {
      getBlock(x, y, z) {
        return x === 1 && y === 1 && z === 0
          ? BLOCKS.get('mc:honey_block').defaultState : AIR;
      },
    };
    assertEqual(player._applyHoneyBlockSlide(world), true);
    assertEqual(player.vy, -0.05);
    assertEqual(player.fallDistance, 0);
  });

  it('does not apply honey wall sliding when airborne without wall contact', () => {
    const player = new Player(0.5, 1, 0.5);
    player.vy = -0.4;
    const world = { getBlock() { return BLOCKS.get('mc:honey_block').defaultState; } };
    assertEqual(player._applyHoneyBlockSlide(world), false);
    assertEqual(player.vy, -0.4);
  });

  it('slime blocks pull adjacent ordinary blocks as one push group', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    const { world } = makeWorld([
      ['0,0,0', piston], ['1,0,0', slime], ['1,1,0', STONE],
    ]);
    const plan = planPistonMove(world, 0, 0, 0, 'east');
    assertEqual(plan.length, 2);
    assertEqual(plan.some((move) => move.from.x === 1 && move.from.y === 0), true);
    assertEqual(plan.some((move) => move.from.x === 1 && move.from.y === 1), true);
  });

  it('moves honey-attached ordinary blocks as one transactional group', () => {
    const honey = BLOCKS.get('mc:honey_block').defaultState;
    const { world } = makeWorld([['1,0,0', honey], ['1,1,0', STONE]]);
    const plan = planPistonMove(world, 0, 0, 0, 'east');
    assertEqual(plan.length, 2);
    assertEqual(plan.some((move) => move.from.x === 1 && move.from.y === 1), true);
  });

  it('does not pull a slime block attached to a honey block', () => {
    const honey = BLOCKS.get('mc:honey_block').defaultState;
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    const { world } = makeWorld([['1,0,0', honey], ['1,1,0', slime]]);
    const plan = planPistonMove(world, 0, 0, 0, 'east');
    assertEqual(plan.length, 1);
    assertEqual(plan[0].state.block.id, 'mc:honey_block');
  });

  it('counts side-attached blocks toward the twelve-block push cap', () => {
    const entries = [['1,0,0', BLOCKS.get('mc:slime_block').defaultState], ['1,1,0', STONE]];
    for (let x = 2; x <= 12; x++) entries.push([`${x},0,0`, STONE]);
    const { world, blocks } = makeWorld(entries);
    assertEqual(planPistonMove(world, 0, 0, 0, 'east'), null);
    assertEqual(blocks.get('1,0,0').block.id, 'mc:slime_block');
    assertEqual(blocks.get('1,1,0'), STONE);
  });

  it('commits a slime push with attached blocks without losing either block', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const source = BLOCKS.get('mc:redstone_block').defaultState;
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['0,0,-1', source],
      ['1,0,0', slime], ['1,1,0', STONE],
    ]);
    const game = { world, player: { x: 0, y: 0, z: 0 }, ...RedstoneDevicesMixin };
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('extended'), true);
    assertEqual(blocks.get('1,0,0').block.id, 'mc:piston_head');
    assertEqual(blocks.get('2,0,0'), slime);
    assertEqual(blocks.get('2,1,0'), STONE);
    assertEqual(blocks.get('1,1,0'), AIR);
  });

  it('rejects an entire slime push if any attached block is immovable', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const slime = BLOCKS.get('mc:slime_block').defaultState;
    const obsidian = BLOCKS.get('mc:obsidian').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['1,0,0', slime], ['1,1,0', obsidian],
    ]);
    assertEqual(planPistonMove(world, 0, 0, 0, 'east'), null);
    assertEqual(blocks.get('1,0,0'), slime);
    assertEqual(blocks.get('1,1,0'), obsidian);
  });

  it('refuses to push beyond build height or into an unloaded chunk', () => {
    const { world } = makeWorld();
    assertEqual(planPistonMove(world, 0, MAX_Y - 1, 0, 'up'), null);

    const blocks = new Map([['15,0,0', STONE]]);
    const chunkAwareWorld = {
      chunks: new Map([['0,0', {}]]),
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || AIR; },
    };
    assertEqual(planPistonMove(chunkAwareWorld, 14, 0, 0, 'east'), null);
  });

  it('extends on redstone power, moves blocks, then retracts a normal piston', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const source = BLOCKS.get('mc:redstone_block').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['0,0,-1', source], ['1,0,0', STONE],
    ]);
    const game = { world, player: { x: 0, y: 0, z: 0 }, ...RedstoneDevicesMixin };
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('extended'), true);
    assertEqual(blocks.get('1,0,0').block.id, 'mc:piston_head');
    assertEqual(blocks.get('2,0,0'), STONE);

    world.setBlock(0, 0, -1, AIR);
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('extended'), false);
    assertEqual(blocks.get('1,0,0'), AIR);
    assertEqual(blocks.get('2,0,0'), STONE);
  });

  it('sticky piston pulls one movable block back on retraction', () => {
    const piston = BLOCKS.get('mc:sticky_piston').defaultState.with('facing', 'east');
    const source = BLOCKS.get('mc:redstone_block').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['0,0,-1', source], ['1,0,0', STONE],
    ]);
    const game = { world, player: { x: 0, y: 0, z: 0 }, ...RedstoneDevicesMixin };
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('2,0,0'), STONE);
    world.setBlock(0, 0, -1, AIR);
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('1,0,0'), STONE);
    assertEqual(blocks.get('2,0,0'), AIR);
    assertEqual(blocks.get('0,0,0').get('extended'), false);
  });

  it('redstone ore lights up, emits level 9, and turns off after its timer', () => {
    const ore = BLOCKS.get('mc:redstone_ore').defaultState;
    const { world, blocks } = makeWorld([['0,0,0', ore]]);
    const game = { world, tickCount: 1, ...RedstoneDevicesMixin };
    assertEqual(blockEmissionForState(ore), 0);
    assertEqual(game._activateRedstoneOre(0, 0, 0), true);
    const lit = blocks.get('0,0,0');
    assertEqual(lit.get('lit'), true);
    assertEqual(blockEmissionForState(lit), 9);
    game.tickCount = 31;
    game._tickRedstoneOre(0, 0, 0, false);
    assertEqual(blocks.get('0,0,0').get('lit'), false);
    assertEqual(blockEmissionForState(blocks.get('0,0,0')), 0);
  });

  it('restores a finite expiry for saved glowing ore after load', () => {
    const litOre = BLOCKS.get('mc:redstone_ore').defaultState.with('lit', true);
    const { world, blocks } = makeWorld([['1,0,1', litOre]]);
    const game = {
      world, tickCount: 5,
      player: { x: 0, y: 0, z: 0, flying: true },
      ...RedstoneDevicesMixin,
    };
    game._tickRedstoneOre(0, 0, 0, true);
    assertEqual(game._redstoneOreTimers.get('1,0,1'), 35);
    game.tickCount = 35;
    game._tickRedstoneOre(0, 0, 0, true);
    assertEqual(blocks.get('1,0,1').get('lit'), false);
    assertEqual(game._redstoneOreTimers.has('1,0,1'), false);
  });

  it('slimes provide slime balls needed for sticky piston crafting', () => {
    const drops = rollMobDrops('slime', () => 0.99);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:slime_ball');
    assertEqual(drops[0].count, 2);
  });

  it('runs piston world mutations only on the multiplayer host', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const source = BLOCKS.get('mc:redstone_block').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['0,0,-1', source], ['1,0,0', STONE],
    ]);
    const game = {
      world, player: { x: 0, y: 0, z: 0 },
      multiplayer: { roomId: 'ABCDE', isHost: false },
      ...RedstoneDevicesMixin,
    };
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('extended'), false);
    assertEqual(blocks.get('1,0,0'), STONE);
  });

  it('does not extend into an immovable block', () => {
    const piston = BLOCKS.get('mc:piston').defaultState.with('facing', 'east');
    const source = BLOCKS.get('mc:redstone_block').defaultState;
    const obsidian = BLOCKS.get('mc:obsidian').defaultState;
    const { world, blocks } = makeWorld([
      ['0,0,0', piston], ['0,0,-1', source], ['1,0,0', obsidian],
    ]);
    const game = { world, player: { x: 0, y: 0, z: 0 }, ...RedstoneDevicesMixin };
    game._tickPistons(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('extended'), false);
    assertEqual(blocks.get('1,0,0'), obsidian);
  });
});
