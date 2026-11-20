# Multiplayer reconnect and durable rooms

This branch fixes a failure mode in the browser multiplayer prototype where a room
disappeared from the lobby after its last player disconnected, making a perfectly
valid room code appear unusable.

## Changes

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
- The shared world remains a deterministic seed plus a room-level block-edit
  overlay. Full authoritative chunk storage, inventory/container state, mobs,
  dimensions, conflict resolution, and server-side anti-cheat are future work.
- Room records older than 30 days are hidden by the lobby helper. They are not
  deleted from Firebase.

## Verification

Pure helper tests cover room host election and discoverability of empty rooms.
Run `npm test` (or `node tests/run-node.mjs`) from the repository root.
Live multi-browser/network-loss testing still needs to be performed in browsers
with two separate player sessions.
