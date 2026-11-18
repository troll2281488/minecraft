import { describe, it, assertEqual } from './framework.js';
import { electRoomHost } from '../src/game/multiplayer.js';

describe('multiplayer host election', () => {
  it('keeps the current host while that player is still in the room', () => {
    assertEqual(
      electRoomHost({ hostUid: 'player-b' }, { 'player-a': {}, 'player-b': {} }),
      'player-b',
    );
  });

  it('elects the same remaining player on every client after host disconnect', () => {
    const room = { hostUid: 'player-z' };
    const players = { 'player-c': {}, 'player-a': {}, 'player-b': {} };
    assertEqual(electRoomHost(room, players), 'player-a');
    assertEqual(electRoomHost(room, players), 'player-a');
  });

  it('returns null when a room has no connected players', () => {
    assertEqual(electRoomHost({ hostUid: 'gone' }, {}), null);
  });
});
