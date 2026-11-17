# Minecraft Clone — Implementation Plan

## Context

Tyler asked for a Minecraft clone with all core features — inventory, block breaking/placing,
crafting, tools, mobs, biomes, lots of block variety — plus **save/import worlds that survive
every future version of the game**. They also asked for the prompt itself to be improved into a
real spec, and for the result to copy Minecraft as closely as possible.

The save-portability requirement is the architecturally load-bearing one. "Keep the same world
through all game versions" means the save format cannot be an afterthought bolted on at the end —
it has to be designed and frozen *before* there is any world data to break, with a versioned
migration chain from day one. That single constraint drives most of the early ordering below.

**Environment** (verified): 12 cores, 32 GB RAM, **GTX 1650 SUPER with 4 GB VRAM**, Windows 11.
Python 3.12 (numpy/pillow/pygame/moderngl), Java 21, git 2.55, Edge (Chromium). **No Node/npm.**
The 4 GB VRAM ceiling is a real constraint — it's the same limit that caused the Distant Horizons
client crash in an earlier session — so the renderer gets a hard mesh budget and eviction rather
than an unbounded chunk cache.

**Decisions made with Tyler:**
- Browser + WebGL2, vanilla ES modules, no build step, no dependencies
- Thin playable vertical slice first, then additive phases
- Singleplayer only — single game loop, no client/server split
- Local git, pushed to a **private** GitHub repo under `UnknownCaz`

### Scope honesty

Modern Minecraft is ~15 years and millions of lines of code; a literal 1:1 reproduction is not
achievable in one project, and saying otherwise would set up a bad handoff. What "1:1" means
operationally here, and what will actually be delivered: **same mechanics, same numeric constants,
same formulas, same GUI layouts and interaction rules**, tracked explicitly in `docs/PARITY.md`
with a per-system checklist of what matches vanilla and what is approximated. Where a number
exists in Minecraft (block hardness, tool speed multiplier, gravity per tick, hunger exhaustion
per action, creeper fuse length), we use the real one rather than something that feels close.

Assets are **original**: procedurally generated 16×16 pixel-art textures and Web Audio synthesized
sounds. Minecraft's actual textures, sounds, and font are copyrighted and are not used. This is the
standard approach for clones and costs nothing in fidelity of *mechanics*.

---

## Improved spec (the rewritten prompt)

The full version lives at `docs/SPEC.md`. Summary of the target:

| System | Target |
|---|---|
| World | Infinite chunked terrain, y = −64..320, 16×16 chunks, 16³ sections |
| Biomes | ~24 via 1.18-style multi-noise (continentalness / erosion / peaks-valleys / temp / humidity) |
| Blocks | ~400+ blockstates: full stone, wood ×8, ore, plant, nether, end families + 16-color families |
| Shapes | Cube, slab, stair, fence, gate, wall, pane, cross, door, trapdoor, carpet, layer, fluid |
| Lighting | Sky + block light 0–15, BFS flood fill, smooth per-vertex lighting + AO |
| Inventory | 36 + 4 armor + offhand, real stack sizes, shift-click / split / drag-distribute rules |
| Crafting | Shaped + shapeless + tag ingredients, 2×2 and 3×3, ~350 recipes, smelting/blasting/smoking/stonecutting/smithing/brewing |
| Tools | 6 tiers, real speed multipliers + durabilities, real mining-time formula, harvest levels |
| Combat | Attack cooldown, crits, sweep, knockback, shields, bows/crossbows, armor + toughness formula |
| Mobs | ~20 passive + ~18 hostile + 2 bosses, goal-selector AI, A* pathfinding, spawn rules, loot tables |
| Survival | Health, hunger/saturation/exhaustion, all damage types, effects, XP, enchanting, brewing |
| Fluids | Water/lava MC spread rules, waterlogging, swimming, boats, fire spread |
| Redstone | Dust, repeaters, comparators, pistons, observers, hoppers, rails, minecarts |
| Dimensions | Overworld, Nether (8:1 portal linking), End (+ Ender Dragon) |
| Saves | Versioned `.mcw` with forward migration chain — **never breaks** |

---

## The save system (design this first, freeze it, never break it)

`docs/SAVE_FORMAT.md` is the contract. Six mechanisms guarantee old worlds keep opening:

1. **Namespaced string IDs everywhere.** The file contains `mc:oak_stairs[facing=north,half=bottom,
   waterlogged=false]`, never a numeric ID. Adding 300 blocks in a later version cannot shift the
   meaning of anything already written.
2. **Per-section palette + packed bit array** (Minecraft's own chunk format). Cheap storage, and
   the palette is what makes string IDs affordable.
3. **`dataVersion` + ordered migration chain.** `src/save/migrate.js` exports
   `MIGRATIONS = [{to: 2, apply(save){…}}, {to: 3, …}]`. Load applies every entry with
   `to > save.dataVersion`, in order. Any commit that changes the meaning of saved data ships its
   migration in the same commit — a test fails the build if `DATA_VERSION` was bumped without a
   matching migration.
4. **Forward compatibility.** Opening a *newer* save on an *older* build preserves unknown block
   IDs verbatim in the palette, renders them as a distinct "unknown block", and writes them back
   unchanged. A round trip never destroys data.
5. **`generatorVersion` per world + `generatedStage` per chunk.** If terrain generation changes,
   existing chunks are never regenerated — only new chunks use the new generator. Same behavior as
   real Minecraft's chunk borders.
6. **Automatic pre-migration backup** to `saves/backups/<world>-v<old>.mcw` before any migration
   writes, plus **golden saves** committed at every version tag under `tests/saves/`, which the
   test page loads on every run. That's the actual regression guarantee, not just intent.

Container: `magic "MCWORLD\0" | formatVersion u16 | dataVersion u32 | flags u16 | index u32`,
then a deflate payload (`CompressionStream`) holding `level.json`, `players/`, per-dimension
`chunks/`, `entities/`, `blockEntities/`, `stats.json`. Live storage is IndexedDB with autosave
every 30 s and on exit; export writes a single `.mcw` download; import accepts a file picker or a
drag-drop anywhere on the canvas and reports `"v3 → v7, 4 migrations applied, backup written"`.

---

## Layout

```
C:\Users\Tyler\Claude\minecraft-clone\
  play.bat  serve.py  README.md  .gitignore
  docs/     SPEC.md  SAVE_FORMAT.md  PARITY.md
  src/
    main.js                    fixed 20 TPS tick + decoupled render loop
    core/      constants.js  rng.js  noise.js  math.js
    world/     block.js  item.js  tags.js  chunk.js  world.js  lighting.js  fluids.js
               blocks/    stone wood ores plants color_families functional nether end
               gen/       biome.js  terrain.js  caves.js  features.js  structures.js  worker.js
    render/    gl.js  atlas.js  mesher.js  mesher_worker.js  chunk_renderer.js  models.js
               sky.js  particles.js  entity_renderer.js  hand.js  camera.js  shaders/
    entity/    entity.js  player.js  mob.js  spawning.js  loot.js  ai/  mobs/
    game/      inventory.js  crafting.js  mining.js  combat.js  enchanting.js  effects.js
               hunger.js  xp.js  commands.js  containers/  recipes/  redstone/  dimensions.js
    save/      format.js  migrate.js  storage.js  io.js
    ui/        hud.js  inventory_ui.js  chat.js  debug.js  settings.js  screens/
    audio/     synth.js  sounds.js
  saves/       (gitignored)          tests/  tests.html  saves/*.mcw golden files
```

`play.bat` runs `serve.py` (static server, correct MIME types, no-cache) on :8080 and opens Edge.
ES modules require `http://`, so opening the HTML directly off disk will not work — the launcher
is the supported entry point.

---

## Phases

Each phase ends in a **runnable build, a git tag, and a golden save** committed to `tests/saves/`.

**Phase 0 — Scaffold + frozen save contract.** Repo + git init + `.gitignore`; `play.bat`/`serve.py`;
`core/constants.js` holding every real Minecraft numeric constant in one auditable place; block/item/
tag registries and the blockstate system; the entire `save/` module at `DATA_VERSION = 1`; the
`tests.html` harness with save round-trip and migration-chain tests. No gameplay yet — the point is
that nothing can be written before the format that has to outlive it exists.

**Phase 1 — Playable vertical slice → tag `v0.1.0`, first build Tyler actually plays.**
WebGL2 renderer with a procedurally generated texture atlas; chunk mesher with face culling,
ambient occlusion, and smooth lighting, running on a worker pool (8 of 12 cores); packed 8-byte
vertex format. Perlin terrain with caves and ores. Player physics using the real constants (gravity
0.08/tick, drag 0.98, jump 0.42, walk 4.317 m/s, sprint 5.612 m/s), AABB collision, sneak/sprint/
swim. DDA voxel raycast targeting, break with progress + 10-stage crack overlay, place with correct
facing. ~50 blocks, hotbar, full inventory GUI, 2×2 and 3×3 crafting with ~60 recipes, tools with
the real `hardness × 1.5 / speed` mining formula and real durabilities. Title screen, world create/
select, save/load/export/import working end to end, F3 debug screen.

**Phase 2 — World and block variety.** Full multi-noise biome system (~24 biomes), surface rules,
rivers/oceans/beaches. 8 tree types incl. large variants, all plants and flowers. Block count to
~400 states — the 16-color families (wool, concrete, terracotta, stained glass, panes, carpet, beds,
candles, shulker boxes) plus complete stone and wood families with slab/stair/fence/gate/door/
trapdoor/button/plate/sign for each. Model + collision system so those shapes aren't hand-coded per
block. Biome tinting of grass, leaves, and water; per-biome fog.

**Phase 3 — Survival loop.** Health, hunger/saturation/exhaustion with vanilla per-action values,
all foods. All damage types incl. the real fall-damage formula and i-frames. 24000-tick day/night
with sky, sun, moon, stars, clouds, weather, lightning. Beds, sleeping, spawn points, respawn and
death screens. Furnace + smelting, chests/barrels/ender chest, item entities, XP orbs. Full lighting
engine including incremental sky-light propagation.

**Phase 4 — Mobs and combat.** Entity/AI framework with prioritized goal selectors and A* pathfinding
over a walkable node graph (jump/fall costs), matching how Minecraft actually does it. ~20 passive and
~18 hostile mobs, spawn rules by light/block/biome, mob caps, despawn distances. Breeding, taming,
shearing, milking, riding. Combat: attack cooldown, criticals, sweep attacks, knockback, shields,
bows/arrows/crossbows. Armor points + toughness + the real damage-reduction formula. Loot tables
with looting.

**Phase 5 — Fluids, farming, explosions.** Water and lava with Minecraft's exact spread rules,
waterlogging, swimming, boats, buckets, infinite water sources. Fire spread; lava→obsidian/cobble/
stone. Crops with growth stages, bonemeal, farmland hydration and trampling, composter. TNT with
the ray-based explosion algorithm and blast resistance. Fishing.

**Phase 6 — Redstone.** Dust signal propagation with the real connection rules, torches, repeaters
(delay + locking), comparators (compare/subtract + container reading), levers/buttons/plates.
Pistons and sticky pistons with the 12-block push limit and block-entity movement, observers, slime
and honey blocks. Hoppers/droppers/dispensers with transfer cooldowns. All four rail types and
minecarts, note blocks, doors and gates.

**Phase 7 — Progression.** XP curve and levels; enchanting table with bookshelf power, seeded
three-offer generation and lapis cost; ~35 enchantments with real effects. Anvil combining, renaming,
and prior-work penalty; grindstone. Brewing stand and the full potion effect list including splash
and lingering, with the effect HUD. Smithing table + netherite, stonecutter.

**Phase 8 — Dimensions.** Nether: portal construction, lighting, and linking at the 8:1 coordinate
ratio; nether terrain and biomes; fortresses; nether mobs. End: eyes of ender → stronghold → portal,
end island generation, obsidian pillars with crystals, and the **Ender Dragon** fight with real perch/
strafe phases. Wither boss. End gateway and end cities as stretch.

**Phase 9 — Structures, villagers, polish.** Villages with biome variants, villagers with professions,
trading, and reputation; iron golems; pillagers and raids. Mineshafts, dungeons, desert/jungle temples,
ocean monuments, woodland mansions, ruined portals, shipwrecks. Advancements, statistics, chat and the
command set (`/give /tp /time /gamemode /weather /summon /fill /setblock /seed /effect /enchant
/gamerule /locate`). Full audio pass, particle pass, settings screen with GUI scale and keybind
remapping.

---

## VRAM budget (4 GB card)

Deliberate, because this hardware has crashed on VRAM before:
- Texture atlas 512×512 RGBA + mipmaps ≈ **1.4 MB**. Negligible.
- Vertex format packed to **8 bytes** (position u8×3, face 3 bits, texture index, AO 2 bits,
  sky+block light 4+4 bits) — roughly a quarter of a naive float layout.
- Default render distance **10** (~441 chunks), maximum 24 rather than an unbounded slider.
- Chunk mesh VBO **pool with a hard byte budget** (default 512 MB): when exceeded, evict the
  farthest meshes instead of allocating. The failure mode becomes "distant chunks pop" rather than
  "silent driver crash".
- Settings screen and F3 both show a live VRAM estimate against the budget.

---

## Step 0 — Repo bootstrap and push ✅ DONE

**Live at https://github.com/UnknownCaz/minecraft-clone — private, `main`, tagged `v0.0.0-plan`,
commit `70be5e8`, 986 lines across 8 files. No implementation code, as agreed.**

Two deviations from what this section originally predicted, both recorded here because they matter:

**The token step was never needed.** `gh` was already installed (winget reported an existing
package and exited 43; it simply wasn't on this shell's PATH — it lives at
`C:\Program Files\GitHub CLI\gh.exe`) **and** already authenticated as `UnknownCaz` via keyring with
`gist, read:org, repo, workflow` scopes. No PAT was created and none was pasted into the transcript.

**`.gitattributes` was added, unplanned.** Staging surfaced CRLF warnings, revealing
`core.autocrlf=true` set at the system level on this machine. Left alone, that would apply
line-ending translation to binary `.mcw` files — rewriting any `0x0A` inside packed block data or a
deflate payload as `0x0D 0x0A` on checkout — silently corrupting the golden saves that the entire
compatibility guarantee depends on, and presenting later as a mysterious loader bug rather than a
Git configuration problem. `*.mcw binary` closes it permanently. This is exactly the class of
failure guarantee 6 exists to catch, caught before it could occur.

`.gitignore` was also tightened from `saves/` to **`/saves/`** (rooted): the unrooted form matches a
`saves` directory at any depth and would have excluded `tests/saves/`, which must stay tracked.

**Committed:** `PLAN.md` · `README.md` · `docs/SPEC.md` · `docs/SAVE_FORMAT.md` · `docs/PARITY.md`
· `.gitattributes` · `.gitignore` · `tests/saves/README.md`

Thereafter: commit per phase, annotated tag per playable version.

### The plan stays editable after the push

Pushing does not freeze the plan. `PLAN.md` is a normal tracked file, and the revision loop is:

```
Step 0 push  →  re-enter plan mode  →  revise PLAN.md freely  →  commit + push each revision
             →  repeat until settled  →  only then begin Phase 0 implementation
```

Immediately after the Step 0 push I return to plan mode, so revisions happen under the same
read-only guardrails and **no implementation code is written until Tyler explicitly signs off on
the final plan**. Each revision is its own commit, which means the repo ends up carrying the
history of how the design evolved — more useful than a single frozen snapshot, and it costs
nothing. Plan revisions are committed as `Plan: <what changed>` and are not tagged; only playable
builds get version tags.

---

## Verification

**Every phase:**
- `play.bat` → Edge opens `localhost:8080`, world loads, no console errors. I verify this directly
  through the Browser pane (`preview_start` → `navigate` → screenshot + `read_console_messages`),
  so failures are caught here rather than handed over.
- `tests.html` runs the in-browser suite and prints pass/fail: noise determinism for a fixed seed,
  save round-trip byte equality, migration chain application, recipe matcher (shaped/shapeless/
  mirrored/tag ingredients), mining-time formula against a table of known vanilla values, inventory
  shift-click and drag-distribute rules, light propagation, chunk palette pack/unpack, AABB collision.
- **Golden-save regression:** every `tests/saves/*.mcw` from every prior version loads on the current
  build. This is the check that makes the "same world across all versions" promise real — if a change
  breaks an old save, this fails before the change ships.
- `docs/PARITY.md` checklist updated with what now matches vanilla and what is approximated.

**Performance target:** 60 fps at render distance 12 on the 1650 SUPER, verified via the F3 readout
(FPS, loaded/rendered chunks, VRAM estimate, tick time).

**Phase 1 acceptance — the specific thing to try:** create a world with a known seed, mine and place
blocks, craft a wooden pickaxe then a stone pickaxe at a crafting table, export the `.mcw`, reload
the page, import it, and confirm the terrain, inventory, and player position all come back exactly.
That single round trip exercises the whole load-bearing part of the design.
