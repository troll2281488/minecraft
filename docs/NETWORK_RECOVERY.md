# Multiplayer reconnect and durable rooms

This branch fixes a failure mode in the browser multiplayer prototype where a room
disappeared from the lobby after its last player disconnected, making a perfectly
valid room code appear unusable.

## Changes

Implementation branch: `feature/multiplayer-reconnect-stability`.

- Room creation claims a short code with a Firebase Realtime Database transaction.
  A random-code collision no longer overwrites an existing room/world.
- The lobby lists valid, non-archived room records even when their player list is
  empty. Empty rooms are labelled as waiting for players.
- The last joined room code is retained locally and shown as a one-click
  reconnect action after reloading the page.
- The Firebase `.info/connected` listener detects a transition back online.
  It re-registers the player's `onDisconnect` cleanup, restores the room player
  record, and refreshes user presence after the connection returns.
- Block edits are coalesced by coordinate and queued while Firebase is offline.
  The queue is bounded to 4,096 distinct pending edits and is flushed after
  room presence is restored. The newest edit for a coordinate replaces an older
  queued edit.

## Important limitations

- This is browser-based multiplayer using Firebase Realtime Database. It is not
  yet a WebRTC peer-to-peer transport. Firebase remains the signalling/state
  service and current position updates still use database writes.
- No browser game can guarantee zero lag when a participant has a poor network.
  These changes make room discovery and recovery more robust; they cannot repair
  packet loss, a disconnected device, or a completely unavailable service.
- Only block edits are queued in this change. Chat, combat events, item drops,
  and other transient operations are not durable offline messages.
- The shared world remains a deterministic seed plus room-level block and
  container-state overlays. Chest and furnace snapshots now replicate through
  the room's `containers` node, and breaking a container publishes a tombstone
  so stale contents are not restored by another client. This is best-effort
  client-side replication, not an authoritative inventory service: two players
  editing the same container at nearly the same time can still overwrite one
  another. Container writes are not queued while offline. Full authoritative
  chunk storage, player inventory, mobs, dimensions, conflict resolution, and
  server-side anti-cheat remain future work.
- Room records older than 30 days are hidden by the lobby helper. They are not
  deleted from Firebase.

## Verification

Pure helper tests cover room host election and discoverability of empty rooms.
Run `npm test` (or `node tests/run-node.mjs`) from the repository root.
Live multi-browser/network-loss testing still needs to be performed in browsers
with two separate player sessions.

## Shared container state

Chest and furnace block-entity snapshots are stored per room and block position
under `minecraft_game/rooms/{code}/containers`. A joining client applies the
current snapshot, local slot changes publish an updated serialized record, and
breaking a container publishes a deletion marker. The live object is updated in
place when a remote snapshot arrives so an open screen keeps its slot references.
For online furnaces, only the elected room host advances the smelting timer and
publishes periodic snapshots; this avoids every client simulating the same furnace
and racing to write its progress.

This is an initial replication layer only. It does not lock a container while a
player edits it, queue changes during network loss, or provide server-side item
validation. Avoid treating simultaneous edits as conflict-free until those
protections and live two-browser tests are added.
