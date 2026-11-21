import { describe, it, assert, assertEqual, assertThrows } from './framework.js';
import '../src/world/blocks/index.js'; // registers the catalog as a side effect
import { BLOCKS, AIR, Block, parseStateString, PROPS, boolProp, intProp, enumProp } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { BLOCK_TAGS, TagRegistry } from '../src/world/tags.js';
import { canHarvest, blockDrops } from '../src/game/interaction.js';

describe('blockstate: canonical string form', () => {
  // This form is what lands in save files, so these tests guard the
  // compatibility contract, not just an internal representation.

  it('a block with no properties serializes to a bare id', () => {
    assertEqual(BLOCKS.get('mc:stone').defaultState.stringId, 'mc:stone');
  });

  it('properties serialize in alphabetical order regardless of declaration order', () => {
    // oak_stairs declares facing, half and shape. Alphabetically that
    // is facing, half, shape, waterlogged -- which happens to match. The real
    // guarantee is that the ORDER IS SORTED, not that it follows declaration,
    // so a block whose declaration order differs from alphabetical proves it.
    const b = new Block('test:sorted', {
      properties: {
        zebra: boolProp('zebra'),
        alpha: boolProp('alpha'),
        middle: boolProp('middle'),
      },
    });
    BLOCKS.register(b);
    assertEqual(b.defaultState.stringId, 'test:sorted[alpha=false,middle=false,zebra=false]');
  });

  it('every state of a block has a distinct string', () => {
    const stairs = BLOCKS.get('mc:oak_stairs');
    const strings = new Set(stairs.states.map((s) => s.stringId));
    assertEqual(strings.size, stairs.states.length);
  });

  it('enumerates the full cartesian product of property values', () => {
    // facing(4) x half(2) x shape(5) = 40 (no post-1.12 waterlogging).
    assertEqual(BLOCKS.get('mc:oak_stairs').states.length, 40);
  });

  it('parseStateString round-trips every state of every registered block', () => {
    for (const block of BLOCKS.blocks.values()) {
      for (const state of block.states) {
        const parsed = parseStateString(state.stringId);
        assertEqual(parsed.blockId, block.id, `blockId for ${state.stringId}`);
        for (const [name, value] of Object.entries(state.values)) {
          assertEqual(parsed.values[name], String(value), `${state.stringId} -> ${name}`);
        }
      }
    }
  });

  it('resolves every state string back to the identical state object', () => {
    for (const block of BLOCKS.blocks.values()) {
      for (const state of block.states) {
        assert(
          BLOCKS.stateFromString(state.stringId) === state,
          `${state.stringId} did not resolve to the same object`,
        );
      }
    }
  });
});

describe('blockstate: transitions', () => {
  it('with() returns the sibling state and leaves other properties alone', () => {
    const base = BLOCKS.get('mc:oak_stairs').defaultState;
    const turned = base.with('facing', 'west');
    assertEqual(turned.get('facing'), 'west');
    assertEqual(turned.get('half'), base.get('half'));
    assertEqual(turned.get('shape'), base.get('shape'));
  });

  it('with() is identity when setting a property to its current value', () => {
    const base = BLOCKS.get('mc:oak_stairs').defaultState;
    assert(base.with('facing', base.get('facing')) === base);
  });

  it('with() rejects an invalid value with a message naming the valid ones', () => {
    const base = BLOCKS.get('mc:oak_stairs').defaultState;
    let message = '';
    try {
      base.with('facing', 'sideways');
    } catch (err) {
      message = err.message;
    }
    assert(message.includes('sideways'), 'error did not name the bad value');
    assert(message.includes('north'), 'error did not list the valid values');
  });

  it('with() rejects a property the block does not have', () => {
    const stone = BLOCKS.get('mc:stone').defaultState;
    assertThrows(() => stone.with('facing', 'north'));
  });

  it('defaultValues selects the declared default rather than the first value', () => {
    // oak_log declares axis default 'y', but PROPS.axis lists x first.
    assertEqual(BLOCKS.get('mc:oak_log').defaultState.get('axis'), 'y');
  });
});

describe('blockstate: unknown blocks (save compatibility guarantee 4)', () => {
  it('preserves an unknown block id verbatim instead of dropping it', () => {
    const future = 'mc:sculk_shrieker[can_summon=true,shrieking=false,waterlogged=false]';
    const state = BLOCKS.stateFromString(future);
    assert(state.isUnknown, 'state was not flagged unknown');
    assertEqual(state.stringId, future, 'the original string was not preserved exactly');
  });

  it('returns the same object for repeated lookups of one unknown id', () => {
    // Palette entries are compared by identity in the mesher; minting a new
    // object per lookup would make every unknown block its own palette entry.
    const id = 'mc:future_block[state=7]';
    assert(BLOCKS.stateFromString(id) === BLOCKS.stateFromString(id));
  });

  it('makes unknown blocks unbreakable so a player cannot destroy data', () => {
    const state = BLOCKS.stateFromString('mc:some_unknown_thing');
    assert(state.block.isUnbreakable, 'unknown block was breakable');
  });

  it('falls back gracefully when a known block has an unfamiliar property', () => {
    // Simulates a save written after a property was removed. Losing the
    // property is recoverable; failing the load and losing the chunk is not.
    const state = BLOCKS.stateFromString('mc:oak_stairs[facing=east,nonexistent=42]');
    assert(!state.isUnknown, 'a known block was treated as unknown');
    assertEqual(state.block.id, 'mc:oak_stairs');
    assertEqual(state.get('facing'), 'east', 'a valid property was discarded too');
  });

  it('falls back when a property value is no longer valid', () => {
    const state = BLOCKS.stateFromString('mc:oak_stairs[facing=upside_down]');
    assert(!state.isUnknown);
    assertEqual(state.get('facing'), 'north', 'did not fall back to the default value');
  });

  it('rejects a malformed string rather than guessing at it', () => {
    assertThrows(() => parseStateString('mc:stone[facing=north'));
    assertThrows(() => parseStateString('mc:stone[garbage]'));
  });
});

describe('block registry: invariants', () => {
  it('air holds runtime id 0 so a zeroed section is already valid', () => {
    assertEqual(AIR.defaultState.runtimeId, 0);
  });

  it('rejects a non-namespaced id', () => {
    assertThrows(() => new Block('stone'));
    assertThrows(() => new Block('MC:Stone'));
  });

  it('rejects a duplicate registration', () => {
    assertThrows(() => BLOCKS.define('mc:stone', {}));
  });

  it('unbreakable blocks are flagged by negative hardness, as in vanilla', () => {
    assert(BLOCKS.get('mc:bedrock').isUnbreakable);
    assert(!BLOCKS.get('mc:stone').isUnbreakable);
  });

  it('property names must be snake_case', () => {
    assertThrows(() => boolProp('camelCase'));
    assertThrows(() => enumProp('With Spaces', ['a']));
  });

  it('intProp enumerates its full inclusive range', () => {
    assertEqual(intProp('age', 0, 7).values.length, 8);
    assertEqual(PROPS.level.values.length, 16);
  });
});

describe('items', () => {
  it('an empty stack reports empty and has no item', () => {
    assert(ItemStack.EMPTY.isEmpty);
  });

  it('unknown item ids are preserved rather than deleted', () => {
    // Same guarantee as blocks: opening a world in an older build must not
    // silently empty the player's inventory of items it does not recognize.
    const item = ITEMS.resolve('mc:some_future_item');
    assert(item.isUnknown);
    assertEqual(item.originalId, 'mc:some_future_item');
  });

  it('an unknown item serializes back to its original id', () => {
    const stack = new ItemStack(ITEMS.resolve('mc:future_sword'), 1, 0, null);
    assertEqual(stack.toJSON().id, 'mc:future_sword');
  });

  it('stacks with different damage do not merge', () => {
    ITEMS.define('test:pick', { stackSize: 1, maxDamage: 100 });
    const a = ItemStack.of('test:pick', 1, 10);
    const b = ItemStack.of('test:pick', 1, 20);
    assert(!a.canStackWith(b));
  });

  it('mergeFrom respects the stack limit and reports what moved', () => {
    ITEMS.define('test:dust', { stackSize: 64 });
    const a = ItemStack.of('test:dust', 60);
    const b = ItemStack.of('test:dust', 20);
    assertEqual(a.mergeFrom(b), 4);
    assertEqual(a.count, 64);
    assertEqual(b.count, 16);
  });

  it('toJSON omits fields at their defaults to keep saves small', () => {
    ITEMS.define('test:rock', { stackSize: 64 });
    const json = ItemStack.of('test:rock', 1).toJSON();
    assert(!('count' in json), 'count was written despite being 1');
    assert(!('damage' in json), 'damage was written despite being 0');
  });

  it('an item stack survives a JSON round trip', () => {
    ITEMS.define('test:blade', { stackSize: 1, maxDamage: 250 });
    const original = ItemStack.of('test:blade', 1, 37);
    const restored = ItemStack.fromJSON(original.toJSON());
    assertEqual(restored.item.id, 'test:blade');
    assertEqual(restored.damage, 37);
  });
});

describe('tags', () => {
  it('expands nested tags to concrete ids', () => {
    assert(BLOCK_TAGS.contains('#mc:logs', 'mc:oak_log'));
  });

  it('a bare id matches itself, so recipes need no special case', () => {
    assert(BLOCK_TAGS.contains('mc:stone', 'mc:stone'));
    assert(!BLOCK_TAGS.contains('mc:stone', 'mc:dirt'));
  });

  it('define() extends an existing tag rather than replacing it', () => {
    const tags = new TagRegistry('block');
    tags.define('#t:x', ['a']);
    tags.define('#t:x', ['b']);
    assertEqual(tags.expand('#t:x').size, 2);
  });

  it('detects a cycle instead of hanging', () => {
    const tags = new TagRegistry('block');
    tags.define('#t:a', ['#t:b']);
    tags.define('#t:b', ['#t:a']);
    assertThrows(() => tags.expand('#t:a'));
  });

  it('validate reports references to ids that do not exist', () => {
    const tags = new TagRegistry('block');
    tags.define('#t:typo', ['mc:stnoe']);
    const problems = tags.validate((id) => BLOCKS.get(id) !== undefined);
    assertEqual(problems.length, 1);
    assert(problems[0].includes('mc:stnoe'));
  });

  it('every seeded block tag references a registered block', () => {
    const problems = BLOCK_TAGS.validate((id) => BLOCKS.get(id) !== undefined);
    assertEqual(problems.length, 0, problems.join('; '));
  });
});


describe('Java 1.19 monster spawner block', () => {
  it('requires a pickaxe and never drops itself', () => {
    const spawner = BLOCKS.get('mc:mob_spawner');
    assert(spawner, 'mob spawner block is registered');
    assertEqual(canHarvest(spawner, ItemStack.empty()), false);
    const pickaxe = ItemStack.of('mc:wooden_pickaxe', 1);
    assertEqual(canHarvest(spawner, pickaxe), true);
    assertEqual(blockDrops(spawner.defaultState, pickaxe).length, 0);
  });

  it('is hidden from the creative inventory', () => {
    assertEqual(ITEMS.get('mc:mob_spawner').notInCreative, true);
  });
});
