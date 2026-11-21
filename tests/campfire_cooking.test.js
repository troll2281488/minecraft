import { describe, it, assertEqual } from './framework.js';
import {
  CAMPFIRE_COOK_TICKS,
  planCampfireFoodInteraction,
  tickCampfireCooking,
} from '../src/game/campfire_cooking.js';

function campfire(values = {}) {
  const state = {
    block: { id: 'mc:campfire' },
    values: { lit: true, food: 'none', cook_time: 0, ...values },
    get(key) { return this.values[key]; },
    with(key, value) { return campfire({ ...this.values, [key]: value }); },
  };
  return state;
}

function worldWithCampfire(initial) {
  const blocks = new Map([['0,64,0', initial]]);
  return {
    blocks,
    hasChunk: () => true,
    getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || { block: { id: 'mc:air' } }; },
    setBlock(x, y, z, next) { blocks.set(`${x},${y},${z}`, next); return true; },
  };
}

describe('Java campfire cooking', () => {
  it('accepts supported raw food only into an empty campfire', () => {
    const empty = campfire();
    const plan = planCampfireFoodInteraction(empty, 'mc:raw_beef');
    assertEqual(plan.type, 'insert');
    assertEqual(plan.state.get('food'), 'raw_beef');
    assertEqual(plan.state.get('cook_time'), 0);
    assertEqual(planCampfireFoodInteraction(plan.state, 'mc:raw_porkchop'), null);
    assertEqual(planCampfireFoodInteraction(empty, 'mc:apple'), null);
  });

  it('cooks food over thirty scheduled steps and pauses when unlit', () => {
    const initial = campfire({ food: 'raw_beef', cook_time: 0 });
    const world = worldWithCampfire(initial);
    const player = { x: 0, y: 64, z: 0 };
    const unlit = worldWithCampfire(campfire({ lit: false, food: 'raw_beef', cook_time: 4 }));
    assertEqual(tickCampfireCooking(unlit, player).length, 0);
    for (let i = 0; i < CAMPFIRE_COOK_TICKS - 1; i++) tickCampfireCooking(world, player);
    assertEqual(world.getBlock(0, 64, 0).get('food'), 'raw_beef');
    const final = tickCampfireCooking(world, player);
    assertEqual(final.length, 1);
    assertEqual(world.getBlock(0, 64, 0).get('food'), 'cooked_beef');
    assertEqual(world.getBlock(0, 64, 0).get('cook_time'), CAMPFIRE_COOK_TICKS);
  });

  it('collects cooked food and clears the campfire slot', () => {
    const ready = campfire({ food: 'cooked_salmon', cook_time: CAMPFIRE_COOK_TICKS });
    const plan = planCampfireFoodInteraction(ready, null);
    assertEqual(plan.type, 'collect');
    assertEqual(plan.itemId, 'mc:cooked_salmon');
    assertEqual(plan.state.get('food'), 'none');
    assertEqual(plan.state.get('cook_time'), 0);
  });
});
