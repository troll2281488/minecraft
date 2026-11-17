# minecraft-clone

A from-scratch Minecraft clone that runs in the browser, built with **zero dependencies** and
**no build step**. Clone it, run one Python script, and it plays.

The defining constraint of this project: **a world you create today must still open in every
future version of the game.** The save format was designed and frozen before a single line of
gameplay code was written, and the promise is enforced by tests rather than by good intentions.
The `v0.1.0` save file is committed to the repo and loaded on every test run - golden saves are
never regenerated, because re-recording one after a break would fix the test by destroying the
evidence. See [`docs/SAVE_FORMAT.md`](docs/SAVE_FORMAT.md).

## Status

**Playable; incremental development has resumed.** The `v0.1.0` foundation remains intact. New
systems are being added in small, testable steps, with incomplete mechanics labelled honestly.

Over 13,000 lines of JavaScript and 231 tests in a hand-written browser harness.

**Working:**

| System | What runs |
|---|---|
| **World generation** | Seeded and reproducible from the seed alone. xoroshiro128++ matching 1.18+, verified against BigInt. 8 biomes over a temperature/humidity map, caves, ore veins using the real 1.18 triangular distributions, deepslate ore variants, oak/birch/spruce trees. Terrain generates on a Web Worker pool. |
| **Rendering** | WebGL2. Procedurally generated texture atlas, per-face culling, per-vertex ambient occlusion, smooth lighting, back-to-front translucent pass, frustum culling, packed 8-byte vertex format, hard mesh-memory budget with farthest-first eviction. |
| **Player** | Real vanilla constants on a fixed 20 TPS tick: gravity 0.08/tick, drag 0.98, jump 0.42, walk 4.317 m/s, sprint 5.612 m/s. AABB collision, sneak, sprint, 0.6 step height, ice slipperiness. Survival and creative modes; creative flight. |
| **Blocks and mining** | ~80 blocks carrying their real vanilla hardness, tool, and harvest-level values. The real `ceil(hardness x 1.5 / speed x 20)` mining formula, 10-stage crack overlay, tool durability consumed on break. Slabs and stairs render and collide from one shared box list. |
| **Inventory and crafting** | Full inventory GUI with the vanilla slot layout and click rules. 2x2 personal grid, 3x3 crafting table, shaped / shapeless / tag (`#mc:planks`) recipe matching, tools and weapons across all six tiers, searchable creative block picker. |
| **Saves** | Versioned `.mcw` files plus IndexedDB. Ordered migration chain, autosave every 30 s and on chunk unload, export and import including drag-and-drop. |
| **Menus** | Title screen, world create / load / delete / export, pause menu, F3 debug overlay. |
| **Survival food** | Food level, saturation, exhaustion from sprinting and jumping, natural regeneration, normal-difficulty starvation, and right-click consumption of apples, bread, raw/cooked meat, carrots, and potatoes. |

**Partial:** mob simulation currently includes simple sheep, pigs and zombies with basic wandering,
fleeing and zombie pursuit/attacks; models are procedural low-poly shapes, not vanilla rigs.

**Not built:** golden-apple effects, food poisoning, full survival damage and death flow, combat tools,
fluid flow, weather, furnaces and chests, redstone, enchanting, dimensions, structures and audio.
Water renders and blocks movement but does not flow.

[`docs/PARITY.md`](docs/PARITY.md) grades all of it system by system, including where it
deliberately differs from vanilla. A row earns a check mark there only when a test covers it or
it has been verified against a documented vanilla value - "the number is typed into
`constants.js`" does not count.

---

## Development approach

The long-term target is broad feature coverage through Java Edition 1.12.2, not a claim of complete parity today. The existing foundation contains some newer-version data; mechanics are being brought toward the requested 1.12.2 target incrementally.
Work proceeds system by system: implement a real mechanic, add regression tests, then document
what is working and what remains.

## What this is

| | |
|---|---|
| **Platform** | Browser, WebGL2, vanilla ES modules |
| **Dependencies** | None. No npm, no bundler, no framework, no `package.json`. |
| **Size** | Over 13,000 lines of JavaScript |
| **Tests** | 220, in a hand-written browser harness (`tests.html`) |
| **Server** | `serve.py` - Python stdlib static server, only needed because ES modules require `http://` |
| **Saves** | Versioned `.mcw` files + IndexedDB, with an ordered migration chain |
| **Mode** | Singleplayer |

## Running it

```bash
play.bat            # Windows
python serve.py     # anything else
```

That starts `serve.py` on port 8080 and opens the browser. Nothing to install: no npm, no
bundler, no `package.json`. Opening `index.html` directly from disk will **not** work - browsers
block ES modules over the `file://` protocol, which is the only reason a server is involved at
all.

**Tests:** with the server running, open `/tests.html`. The runner is hand-written for the same
reason as everything else here - installing one would mean installing npm.

## Controls

| | |
|---|---|
| Move / jump / sneak / sprint | `WASD` / `Space` / `Shift` / `Ctrl` or `R` |
| Look | Mouse (click the canvas to capture the pointer) |
| Break / place or use / pick block | Left click (hold) / right click / middle click |
| Select hotbar slot | `1`-`9` or scroll wheel |
| Drop one | `Q` |
| Inventory | `E` (opens the creative picker in creative mode) |
| Toggle flight (creative) | `F` |
| Debug overlay | `F3` |
| Pause | `Esc` |

Sneaking while right-clicking places a block against a crafting table instead of opening it,
matching vanilla. Game mode is toggled from the pause menu.

## Documentation

| Document | What's in it |
|---|---|
| [`docs/PARITY.md`](docs/PARITY.md) | Per-system checklist of what matches vanilla, what is approximated, and what is not built. Start here. |
| [`docs/SAVE_FORMAT.md`](docs/SAVE_FORMAT.md) | The `.mcw` container and the six compatibility guarantees |
| [`docs/SPEC.md`](docs/SPEC.md) | Complete feature spec - the target that was being built |
| [`PLAN.md`](PLAN.md) | Phased implementation plan, from scaffold to Ender Dragon |

## On fidelity

Modern Minecraft is roughly fifteen years and millions of lines of code. A literal 1:1
reproduction is not achievable in one project, and claiming otherwise would just set up a
disappointing handoff.

What *is* the goal, and what gets tracked in `docs/PARITY.md`: **the same mechanics, the same
numeric constants, the same formulas, the same GUI layouts and interaction rules.** Where a real
number exists - block hardness, tool speed multipliers, gravity per tick, hunger exhaustion per
action, creeper fuse length - this project uses the real one rather than something that merely
feels close.

## On assets

All textures and sounds are **original and procedurally generated** - 16x16 pixel art rendered at
runtime, and Web Audio synthesized sound effects. Minecraft's actual textures, sounds, and font
are copyrighted and are not used or redistributed here. This costs nothing in mechanical fidelity,
which is where the interesting work is anyway.

Not affiliated with or endorsed by Mojang or Microsoft.

## Hardware target

Developed against a GTX 1650 SUPER with **4 GB of VRAM**, which is a deliberately modest target.
The renderer uses a packed 8-byte vertex format, a hard mesh-memory budget with farthest-first
eviction, and a capped render distance, so exceeding the budget causes distant chunks to unload
rather than a driver crash. Render distance defaults to 10 and is capped at 24.

The mesher was profiled rather than guessed at. The first version made roughly 200 world lookups
per block - about 27 ms per chunk - because every lookup walked a closure, then the chunk, then
the section, then a paletted container. Loading each section's 18x18x18 neighbourhood into a
reusable scratch buffer once brought that to 5,832 lookups per section instead of ~250,000 per
chunk, for a measured 2.3x speedup. Greedy meshing was considered and rejected: merged coplanar
quads cannot carry differing per-vertex ambient occlusion and light values.
