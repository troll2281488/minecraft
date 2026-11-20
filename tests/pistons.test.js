import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes } from '../src/world/shapes.js';
import { planPistonMove, PISTON_MAX_PUSH } from '../src/game/pistons.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';
import { RECIPES } from '../src/game/recipes.js';
import { ITEMS } from '../src/world/item.js';
import { rollMobDrops } from '../src/entity/mobs.js';

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
    for (const id of ['mc:piston', 'mc:sticky_piston', 'mc:piston_head']) {
      assert(BLOCKS.get(id), `${id} block missing`);
    }
    for (const id of ['mc:piston', 'mc:sticky_piston']) {
      assert(RECIPES.recipes.some((recipe) => recipe.result === id), `${id} recipe missing`);
    }
    assertEqual(BLOCKS.get('mc:piston').defaultState.get('extended'), false);
    assertEqual(BLOCKS.get('mc:piston_head').defaultState.get('sticky'), false);
    assert(ITEMS.get('mc:slime_ball'), 'slime ball item missing');
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

  it('slimes provide slime balls needed for sticky piston crafting', () => {
    const drops = rollMobDrops('slime', () => 0.99);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:slime_ball');
    assertEqual(drops[0].count, 2);
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
