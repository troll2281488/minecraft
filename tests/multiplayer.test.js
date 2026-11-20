import { describe, it, assertEqual } from './framework.js';
import { electRoomHost, listJoinableRooms, queueContainerWrite } from '../src/game/multiplayer.js';

describe('multiplayer container write queue', () => {
  it('keeps only the newest pending snapshot for a room and container', () => {
    const queue = new Map();
    queueContainerWrite(queue, 'ABCDE', '1,64,2', { slots: [1] });
    queueContainerWrite(queue, 'ABCDE', '1,64,2', { slots: [2] });
    assertEqual(queue.size, 1);
    assertEqual(queue.get('ABCDE:1,64,2').record.slots[0], 2);
  });
  it('keeps rooms isolated and bounds pending container writes', () => {
    const queue = new Map();
    queueContainerWrite(queue, 'ABCDE', '1,64,2', { value: 1 }, 2);
    queueContainerWrite(queue, 'ABCDE', '2,64,2', { value: 2 }, 2);
    queueContainerWrite(queue, 'FGHIJ', '1,64,2', { value: 3 }, 2);
    assertEqual(queue.size, 2);
    assertEqual(queue.has('ABCDE:1,64,2'), false);
    assertEqual(queue.has('FGHIJ:1,64,2'), true);
  });
});

describe('multiplayer room recovery', () => {
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

  it('keeps a valid empty room discoverable after everyone disconnects', () => {
    const rooms = listJoinableRooms({
      ABC12: { seed: '123', createdAt: 900, players: {} },
      DEF34: { seed: '456', createdAt: 800, players: { p1: {} } },
    }, 1000, 500);
    assertEqual(rooms.length, 2);
    assertEqual(rooms[0][0], 'ABC12');
    assertEqual(Object.keys(rooms[0][1].players).length, 0);
  });

  it('filters malformed, archived, and expired rooms', () => {
    const rooms = listJoinableRooms({
      'bad-code!': { seed: '1', createdAt: 1000 },
      GHI56: { seed: '2', createdAt: 1000, archived: true },
      JKL78: { seed: '3', createdAt: 100 },
      MNO12: { seed: '4', createdAt: 1000 },
    }, 1000, 500);
    assertEqual(rooms.length, 1);
    assertEqual(rooms[0][0], 'MNO12');
  });
});
