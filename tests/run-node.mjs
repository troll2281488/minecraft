import { describe, it, assertEqual } from './framework.js';
import './stronghold_library.test.js';
import './redstone_wire.test.js';
import './redstone_devices.test.js';
import './pistons.test.js';
import './piston_textures.test.js';
import './bee_hives.test.js';
import './weather.test.js';
import './status_effects.test.js';
import './sleep.test.js';
import './sponge.test.js';
import './jukebox.test.js';
import './leads.test.js';
import './cobweb_drops.test.js';
import './animal_lifecycle.test.js';
import './rabbit_horse_breeding.test.js';
import './fire_charge.test.js';
import './fishing.test.js';
import './farming.test.js';
import './sweet_berry_bush.test.js';
import './campfire_cooking.test.js';
import './ender_pearl.test.js';
import './railways.test.js';
import './enchantments.test.js';
import './enchanting_table.test.js';
import './ranged_weapons_advancements.test.js';
import './firework_explosion.test.js';
import './expanded_survival_potions.test.js';
import './trident_gameplay.test.js';
import './mob_systems.test.js';
import './composting.test.js';
import './hopper.test.js';
import './fences.test.js';
import './stairs.test.js';
import './dye_crafting.test.js';
import './livestock_interactions.test.js';
import './shield_food.test.js';
import './fluid_buckets.test.js';
import './processing_stations.test.js';
import './cauldron.test.js';
import { applyRemotePlayerState, remoteEquipmentSnapshot, queueChatMessage, canAcquireContainerLease, electRoomHost, isContainerLeaseHeldByOther, isValidContainerKey, listJoinableRooms, ownsContainerLease, queueContainerWrite } from '../src/game/multiplayer.js';

describe('multiplayer container key validation', () => {
  it('accepts signed integer coordinates only', () => {
    assertEqual(isValidContainerKey('1,64,-2'), true);
    assertEqual(isValidContainerKey('-120,0,45'), true);
    assertEqual(isValidContainerKey('1,2'), false);
    assertEqual(isValidContainerKey('1,2,3/extra'), false);
    assertEqual(isValidContainerKey('../players'), false);
    assertEqual(isValidContainerKey(null), false);
  });
});

describe('multiplayer container write queue', () => {
  it('keeps only the newest pending snapshot for a room and container', () => {
    const queue = new Map();
    queueContainerWrite(queue, 'ABCDE', '1,64,2', { slots: [1] });
    queueContainerWrite(queue, 'ABCDE', '1,64,2', { slots: [2] });
    assertEqual(queue.size, 1);
    assertEqual(queue.get('ABCDE:1,64,2').record.slots[0], 2);
  });
  it('rejects malformed coordinate keys before queueing writes', () => {
    const queue = new Map();
    assertEqual(queueContainerWrite(queue, 'ABCDE', '../players', { value: 1 }), false);
    assertEqual(queue.size, 0);
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


describe('multiplayer container edit leases', () => {
  it('allows a new lease when the container is unlocked', () => {
    assertEqual(canAcquireContainerLease(null, 'player-a', 1000), true);
  });

  it('prevents another player taking an unexpired lease', () => {
    assertEqual(canAcquireContainerLease({ owner: 'player-a', expiresAt: 2000 }, 'player-b', 1000), false);
  });

  it('allows takeover after a lease expires', () => {
    assertEqual(canAcquireContainerLease({ owner: 'player-a', expiresAt: 999 }, 'player-b', 1000), true);
  });

  it('allows the current owner to renew its own lease', () => {
    assertEqual(canAcquireContainerLease({ owner: 'player-a', expiresAt: 500 }, 'player-a', 1000), true);
  });

  it('requires both owner and unique token to release or renew a lease', () => {
    const lease = { owner: 'player-a', token: 'tab-token' };
    assertEqual(ownsContainerLease(lease, 'player-a', 'tab-token'), true);
    assertEqual(ownsContainerLease(lease, 'player-a', 'other-token'), false);
    assertEqual(ownsContainerLease(lease, 'player-b', 'tab-token'), false);
  });

  it('detects another player only while their lease is active', () => {
    const lease = { owner: 'player-b', expiresAt: 2000 };
    assertEqual(isContainerLeaseHeldByOther(lease, 'player-a', 1000), true);
    assertEqual(isContainerLeaseHeldByOther(lease, 'player-a', 2000), false);
    assertEqual(isContainerLeaseHeldByOther(lease, 'player-b', 1000), false);
  });

  it('rejects attempts to create a lease without a player identity', () => {
    assertEqual(canAcquireContainerLease(null, '', 1000), false);
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

describe('multiplayer remote player state', () => {
  it('replicates sprint, sneak, attack animation, and game mode', () => {
    const remote = applyRemotePlayerState({}, {
      name: 'Runner', health: 17, food: 13, inWater: false, sneaking: true,
      sprinting: true, onGround: true, gamemode: 'creative', attackTime: 6,
      x: 1, y: 2, z: 3, yaw: 90,
    });
    assertEqual(remote.name, 'Runner');
    assertEqual(remote.sprinting, true);
    assertEqual(remote.sneaking, true);
    assertEqual(remote.attacking, true);
    assertEqual(remote.attackTime, 6);
    assertEqual(remote.gamemode, 'creative');
    assertEqual(remote.targetYaw, 90);
  });

  it('clamps untrusted status and animation values and supplies safe defaults', () => {
    const remote = applyRemotePlayerState({}, {
      name: '<bad>', health: 99, food: -4, attackTime: 999,
      gamemode: 'invalid', x: 0, y: 0, z: 0,
    });
    assertEqual(remote.health, 20);
    assertEqual(remote.food, 0);
    assertEqual(remote.attackTime, 10);
    assertEqual(remote.attacking, true);
    assertEqual(remote.gamemode, 'survival');
    assertEqual(remote.sprinting, false);
    assertEqual(remote.sneaking, false);
  });

  it('clears a previous attack pose when the next snapshot is idle', () => {
    const remote = applyRemotePlayerState({ attacking: true, attackTime: 4 }, {
      name: 'Player', attackTime: 0, x: 0, y: 0, z: 0,
    });
    assertEqual(remote.attacking, false);
    assertEqual(remote.attackTime, 0);
  });
});

describe('multiplayer equipment snapshots', () => {
  it('sends only held, offhand, and four armor item identifiers', () => {
    const stacks = [
      { isEmpty: false, item: { id: 'minecraft:diamond_sword' } },
      ...Array.from({ length: 35 }, () => ({ isEmpty: true, item: null })),
      { isEmpty: false, item: { id: 'minecraft:diamond_boots' } },
      { isEmpty: false, item: { id: 'minecraft:iron_leggings' } },
      { isEmpty: false, item: { id: 'minecraft:iron_chestplate' } },
      { isEmpty: false, item: { id: 'minecraft:iron_helmet' } },
      { isEmpty: false, item: { id: 'minecraft:shield' } },
    ];
    const snapshot = remoteEquipmentSnapshot({ selectedSlot: 0, get: (index) => stacks[index] });
    assertEqual(snapshot.heldItem, 'minecraft:diamond_sword');
    assertEqual(snapshot.offhandItem, 'minecraft:shield');
    assertEqual(snapshot.armor[0], 'minecraft:diamond_boots');
    assertEqual(snapshot.armor[3], 'minecraft:iron_helmet');
    assertEqual(Object.keys(snapshot).length, 3);
  });

  it('uses empty equipment defaults and ignores malformed item identifiers', () => {
    const snapshot = remoteEquipmentSnapshot({ selectedSlot: 0, get: () => ({
      isEmpty: false, item: { id: '../invalid' },
    }) });
    assertEqual(snapshot.heldItem, null);
    assertEqual(snapshot.offhandItem, null);
    assertEqual(snapshot.armor.every((id) => id === null), true);
  });

  it('applies equipment from remote snapshots and clears stale slots', () => {
    const remote = applyRemotePlayerState({}, {
      heldItem: 'minecraft:iron_pickaxe', offhandItem: 'minecraft:shield',
      armor: ['minecraft:iron_boots', null, null, 'minecraft:iron_helmet'],
      x: 0, y: 0, z: 0,
    });
    assertEqual(remote.heldItem, 'minecraft:iron_pickaxe');
    assertEqual(remote.offhandItem, 'minecraft:shield');
    assertEqual(remote.armor[0], 'minecraft:iron_boots');
    applyRemotePlayerState(remote, { x: 0, y: 0, z: 0 });
    assertEqual(remote.heldItem, null);
    assertEqual(remote.armor.every((id) => id === null), true);
  });
});

describe('multiplayer offline chat queue', () => {
  it('queues messages by room and stable message ID', () => {
    const queue = new Map();
    assertEqual(queueChatMessage(queue, 'ROOM1', {
      id: 'msg_1', sender: 'Alex', text: 'hello', timestamp: 123,
    }), true);
    assertEqual(queue.size, 1);
    assertEqual(queue.get('ROOM1:msg_1').text, 'hello');
  });

  it('keeps room queues isolated and replaces retries with the same ID', () => {
    const queue = new Map();
    queueChatMessage(queue, 'ROOM1', { id: 'same', sender: 'Alex', text: 'old' });
    queueChatMessage(queue, 'ROOM1', { id: 'same', sender: 'Alex', text: 'new' });
    queueChatMessage(queue, 'ROOM2', { id: 'same', sender: 'Sam', text: 'other room' });
    assertEqual(queue.size, 2);
    assertEqual(queue.get('ROOM1:same').text, 'new');
    assertEqual(queue.get('ROOM2:same').text, 'other room');
  });

  it('rejects invalid message IDs and empty messages', () => {
    const queue = new Map();
    assertEqual(queueChatMessage(queue, 'ROOM1', { id: '../x', text: 'bad' }), false);
    assertEqual(queueChatMessage(queue, 'ROOM1', { id: 'empty', text: '  ' }), false);
    assertEqual(queue.size, 0);
  });

  it('bounds pending messages and truncates oversized text', () => {
    const queue = new Map();
    queueChatMessage(queue, 'ROOM1', { id: 'a', sender: 'A', text: 'x'.repeat(500) }, 2);
    queueChatMessage(queue, 'ROOM1', { id: 'b', sender: 'B', text: 'b' }, 2);
    queueChatMessage(queue, 'ROOM1', { id: 'c', sender: 'C', text: 'c' }, 2);
    assertEqual(queue.size, 2);
    assertEqual(queue.has('ROOM1:a'), false);
    assertEqual(queue.get('ROOM1:b').text, 'b');
    assertEqual(queue.get('ROOM1:c').text, 'c');
  });
});
