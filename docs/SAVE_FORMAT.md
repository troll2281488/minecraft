# The `.mcw` Save Format — Compatibility Contract

**This document is a contract, not a description.** It is committed before any implementation code
exists, specifically so that no later commit can quietly violate it. If a change to the codebase
conflicts with something written here, the change is wrong until this document is amended
deliberately and the amendment is reviewed on its own terms.

The requirement it exists to satisfy:

> A world created in any version of this game must still open, correctly and without data loss, in
> every future version.

That is a stronger promise than "the game has save files," and it is not achievable by bolting
serialization on at the end. Every mechanism below exists because some specific, ordinary future
change would otherwise silently corrupt old worlds.

---

## The six guarantees

### 1. Namespaced string IDs — never numeric

Blocks, items, biomes, entities, and block entities are identified in the file by namespaced
strings, with blockstate properties encoded inline:

```
mc:stone
mc:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]
mc:wheat[age=7]
```

**The failure this prevents.** With numeric IDs, block `47` means whatever the registry happened to
assign at write time. Insert three blocks into the registry in v2 and every existing save silently
reinterprets every block — a world of oak planks becomes a world of something else. This is the
single most common way voxel games destroy their own saves, and it is unrecoverable after the fact
because the file contains no record of what `47` used to mean.

String IDs make the file self-describing. Adding three hundred blocks cannot change what
`mc:stone` means, because `mc:stone` means `mc:stone`.

**Renames** are handled by migrations (guarantee 3), never by reusing an ID for a different block.

### 2. Per-section palette + packed bit array

Storing a string per block would be absurd, so each 16³ section stores a palette of the distinct
states it contains, plus a densely packed index array:

```
u16                paletteLength
varstring × N      palette entries
u8                 bitsPerEntry   = max(1, ceil(log2(paletteLength)))
packed bit array   4096 indices at bitsPerEntry each
u8[2048]           skyLight   (nibble-packed)
u8[2048]           blockLight (nibble-packed)
```

A section of solid stone: one palette entry, 4096 one-bit indices, 512 bytes. This is Minecraft's
own chunk encoding, and it is what makes guarantee 1 affordable rather than merely correct.

### 3. `dataVersion` + an ordered migration chain

Every save records the `DATA_VERSION` it was written with. `src/save/migrate.js` exports an ordered
list:

```js
export const DATA_VERSION = 7;

export const MIGRATIONS = [
  { to: 2, note: 'grass_block gained a snowy property',      apply(save) { /* … */ } },
  { to: 3, note: 'mc:stone_slab → mc:smooth_stone_slab',     apply(save) { /* … */ } },
  // …
];
```

On load, every migration with `to > save.dataVersion` runs in ascending order. A v1 save opening on
a v7 build runs six migrations and arrives correct. This is the same approach as Minecraft's
DataFixerUpper, and the reason Minecraft can still open alpha worlds.

**Enforced, not merely intended.** A test asserts that `DATA_VERSION` equals
`max(MIGRATIONS.map(m => m.to))`. Bumping the version without writing the migration fails the suite.
The rule for contributors is one line: *if a change alters the meaning of saved data, its migration
ships in the same commit.*

### 4. Forward compatibility — unknown data is preserved, never dropped

Opening a **newer** save on an **older** build is expected to happen (a save exported from a later
version, an old tab left open, a rollback after a bug). The old build:

- keeps unknown palette entries **verbatim**,
- renders them as a visually distinct "unknown block" that cannot be broken,
- and **writes them back unchanged** on save.

So a round trip through an older build never destroys anything. Writing over a newer save requires
an explicit confirmation, because the older build genuinely cannot represent everything in it.

**The failure this prevents.** The naive behavior — drop what you don't recognize — turns "I opened
my world in the old version by accident" into permanent, silent, total loss of every block added
after that version.

### 5. `generatorVersion` per world, `generatedStage` per chunk

The world header records which terrain generator produced it. Each chunk records how far generation
progressed (`0 empty · 1 terrain · 2 features · 3 lit · 4 full`).

Already-generated chunks are **never regenerated**, even when the generator changes. Only new chunks
use the new generator. This is exactly how Minecraft behaves, and it produces the same visible
artifact — a seam at the boundary between old and new terrain. That seam is the correct outcome:
the alternative is deleting the terrain a player has already built in.

### 6. Automatic backups + golden-save regression tests

- Before any migration writes, the original is copied to
  `saves/backups/<world>-v<oldVersion>-<timestamp>.mcw`.
- Every tagged version commits a **golden save** to `tests/saves/`, and `tests.html` loads *all* of
  them on every run.

Guarantee 6 is what makes guarantees 1–5 real rather than aspirational. A promise about backward
compatibility that is never tested is a promise that has already been broken and nobody has noticed
yet. If a change breaks a v0.1 world, the suite fails before that change ships — not eighteen months
later when someone opens an old world.

---

## Container layout

```
offset  size  field
0       8     magic          "MCWORLD\0"
8       2     formatVersion  u16   container structure version
10      4     dataVersion    u32   game content version → drives migrations
14      2     flags          u16   bit 0: deflate payload
16      4     indexOffset    u32   byte offset of the entry index
20      …     payload        deflate stream (CompressionStream)
```

The payload holds a small virtual filesystem:

```
level.json                    name, seed, generatorVersion, gamemode, time, weather,
                              spawn, gamerules, createdWith, lastPlayedWith, playTime
players/<uuid>.json           position, rotation, health, hunger, xp, inventory,
                              effects, dimension, spawn point
<dimension>/chunks/<cx>.<cz>.bin
<dimension>/entities.bin
<dimension>/blockEntities.bin
stats.json
advancements.json
```

### Chunk record

```
u32              dataVersion       per-chunk, so partial migration is possible
u8               sectionCount
section × N      (palette + packed indices + light, per guarantee 2)
u8               generatedStage
u16[256]         heightmap
biome palette + 4×4×4-resolution packed biome array
```

Per-chunk `dataVersion` matters more than it looks: a world can be migrated lazily, chunk by chunk
as each is loaded, instead of rewriting a multi-gigabyte save in one blocking pass on open.

---

## Runtime behavior

**Live storage** is IndexedDB — chunks written as they unload, autosave every 30 seconds and on
exit.

**Export** serializes to a single `.mcw` and triggers a download.

**Import** accepts a file picker or a drag-drop anywhere on the canvas. It validates the magic
bytes, checks `formatVersion`, runs the migration chain, and reports the outcome plainly:

```
Imported "Survival World"
  written by v0.3.0 (dataVersion 3) → migrated to dataVersion 7
  4 migrations applied
  backup written to saves/backups/Survival World-v3-20260723.mcw
```

**Rejection** is limited to two cases, both reported clearly rather than as a crash: the magic bytes
don't match (not a `.mcw` file), or `formatVersion` is newer than this build understands — meaning
the container structure itself changed, not just its contents. `formatVersion` is expected to remain
at 1 essentially forever; `dataVersion` is the one that moves.

---

## Rules for contributors

1. Never write a numeric block, item, or biome ID into a save file.
2. Never reuse a namespaced ID for a different thing. Renames are migrations.
3. If a change alters the meaning of saved data, its migration ships in the same commit.
4. Never delete unknown data. Preserve and write it back.
5. Never regenerate an already-generated chunk.
6. Every tagged version commits a golden save to `tests/saves/`.
