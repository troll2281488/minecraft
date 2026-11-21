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
  room presence is restored or the player rejoins that room. The newest edit for a coordinate replaces an older
  queued edit.

## Important limitations

- This is browser-based multiplayer using Firebase Realtime Database. It is not
  yet a WebRTC peer-to-peer transport. Firebase remains the signalling/state
  service and current position updates still use database writes.
- No browser game can guarantee zero lag when a participant has a poor network.
  These changes make room discovery and recovery more robust; they cannot repair
  packet loss, a disconnected device, or a completely unavailable service.
- Block edits, chest/furnace snapshots, and chat messages are queued while Firebase
  is offline. Container writes are bounded to 512 pending room/container records;
  the newest snapshot or deletion marker for each container wins. Chat has a
  bounded 100-message queue per client and stable message IDs, so retries write
  to the same Firebase child instead of creating duplicate messages. Combat
  events, item drops, and other transient operations are not durable offline messages.
- The shared world remains a deterministic seed plus room-level block and
  container-state overlays. Chest and furnace snapshots now replicate through
  the room's `containers` node, and breaking a container publishes a tombstone
  so stale contents are not restored by another client. This is best-effort
  client-side replication, not an authoritative inventory service. Online UI
  edits are coordinated by expiring advisory leases; host furnace simulation
  pauses while another player holds that furnace's lease. Offline container
  edits are replayed after presence recovery or when rejoining the same room,
  but they remain best-effort snapshots and can still conflict with edits made
  by another player while the client was disconnected. Full authoritative
  chunk storage, player inventory, mobs, dimensions, conflict resolution, and
  server-side anti-cheat remain future work.
- Room records older than 30 days are hidden by the lobby helper. They are not
  deleted from Firebase.

## Verification

Automated tests cover offline chat queue bounds, room isolation and stable IDs, remote player pose/equipment snapshots, lease ownership, expiry, token matching, active remote lease detection, UI edit blocking while a lease is pending/busy/offline/lost, room host election and discoverability of empty rooms, coordinate-key validation, chest/furnace shift-click edge cases, save/restore validation, and container draining when blocks break.
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

This is an initial replication layer only. It does not provide server-side item validation. Offline snapshots are queued, but a later replay can still overwrite
newer changes made by another player while the client was disconnected. Avoid treating simultaneous edits as conflict-free until those
protections and live two-browser tests are added.


## Advisory container leases

A player opening a shared chest or furnace attempts a Firebase transaction at
`minecraft_game/rooms/{code}/containerLocks/{x,y,z}`. The lease is tied to the
player's per-tab UID and a unique token. It expires after 15 seconds and is
renewed every 5 seconds while the screen remains open. The elected host pauses
that furnace's periodic simulation writes while a different player owns its lease. Closing the screen or
leaving the room releases only the lease whose owner and token still match.
If the browser closes unexpectedly, the expiry permits another player to open
the container later. A failed acquisition, lost lease, or unavailable connection
blocks slot interaction in that shared screen.

This is an advisory client-side coordination mechanism, not a security boundary.
The Firebase database rules are not stored in this repository, so the lock path's
permissions must be verified against the live project. A client that writes
directly to the container data path can bypass the UI lease. Offline queued
snapshots also remain best-effort and can conflict with newer remote changes.
