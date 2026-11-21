import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { noteBlockFrequency } from '../src/game/sounds.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

describe('note block', () => {
  it('registers a 25-step pitch state', () => {
    const state = BLOCKS.get('mc:note_block').defaultState;
    assertEqual(state.get('note'), 0);
    assertEqual(state.with('note', 24).get('note'), 24);
  });

  it('maps note indices to equal-tempered pitches', () => {
    assertEqual(noteBlockFrequency(12), 440);
    assertEqual(noteBlockFrequency(0), 220);
    assertEqual(noteBlockFrequency(24), 880);
  });

  it('plays once on a redstone rising edge, not continuously while powered', () => {
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:note_block').defaultState.with('note', 7)],
      ['1,0,0', BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const played = [];
    const game = {
      world: {
        getBlock(x,y,z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
        setBlock(x,y,z,state) { blocks.set(`${x},${y},${z}`,state); return true; },
      },
      player: { x:0, y:0, z:0 },
      sounds: { playNote(note,material) { played.push({note,material}); } },
      ...RedstoneDevicesMixin,
    };
    game._tickNoteBlocks(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('powered'), true);
    assertEqual(played.length,1);
    assertEqual(played[0].note,7);
    game._tickNoteBlocks(0,0,0,true);
    assertEqual(played.length,1);
    blocks.set('1,0,0',BLOCKS.get('mc:air').defaultState);
    game._tickNoteBlocks(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('powered'), false);
    blocks.set('1,0,0',BLOCKS.get('mc:redstone_block').defaultState);
    game._tickNoteBlocks(0,0,0,true);
    assertEqual(played.length,2);
  });
});
