# Feature Specification

This document is the rewritten form of the original request. The original was:

> *"Make me a Minecraft clone with all core Minecraft features including an inventory, the ability
> to break and place blocks, crafting, tools, mobs, different biomes, lots of block variety. Make
> it so you can save worlds and import them so we can keep the same world through all game
> versions. Copy Minecraft 1:1 as close as possible."*

That request is clear about *what* but leaves the hard parts implicit. Three things it left
unstated turned out to drive the entire architecture:

1. **"Keep the same world through all game versions" is a format-versioning requirement, not a
   save/load feature.** Save/load is easy. Guaranteeing that a world written by v0.1 opens
   correctly in v3.0 — after 300 new blocks, a changed terrain generator, and a reworked entity
   format — requires stable string IDs, a palette-based chunk encoding, an ordered migration
   chain, and forward-compatibility handling for unknown blocks. This has to be designed and
   frozen *before* the first block is ever written to disk. It is Phase 0.
2. **"Lots of block variety" is mostly a shape and property problem, not a block-count problem.**
   Getting to 400+ blockstates is cheap once there is a model system that expresses slab / stair /
   fence / wall / pane / door / trapdoor generically and a color-family generator. Hand-coding
   each block is what makes it expensive.
3. **"1:1 as close as possible" is a measurable claim only if it is written down.** Hence
   `PARITY.md`, which tracks per system what matches vanilla exactly, what is approximated, and
   what is absent.

Everything below is the target. Sequencing lives in [`../PLAN.md`](../PLAN.md).

---

## 1. Engine core

- **Loop**: fixed **20 TPS** simulation tick, decoupled from an uncapped render loop with
  interpolation between ticks. Matches Minecraft, and makes every tick-based constant transferable
  verbatim.
- **Coordinates**: chunks are 16×16, world height **y = −64 to 320** (384 tall), divided into 16³
  sections for meshing and storage.
- **Threading**: worker pool sized to `min(8, cores − 2)` for terrain generation and chunk meshing.
  Results come back as transferable `ArrayBuffer`s so nothing is copied.
- **Storage**: per-section palette + packed bit array. `bitsPerEntry = ceil(log2(paletteLength))`,
  minimum 1. A section of solid stone costs one palette entry and 4096 one-bit indices.

## 2. Rendering

- Raw **WebGL2**. No Three.js — a voxel renderer wants one shader and one big buffer per chunk,
  and a general-purpose scene graph gets in the way.
- **Texture atlas** generated procedurally at runtime into a canvas, uploaded once, `NEAREST`
  filtering with mipmaps and a small padding gutter to prevent bleed.
- **Meshing**: per-face culling against neighbours, with **ambient occlusion** and **smooth
  lighting** (each vertex averages the light of its four touching cells). Vertices packed to
  **8 bytes**: position `u8×3`, face index 3 bits, texture index, AO 2 bits, sky light 4 bits,
  block light 4 bits.
- **Passes**: opaque → cutout (alpha-tested: leaves, grass, glass) → translucent (water, stained
  glass) sorted back-to-front.
- **Culling**: frustum culling per section, plus cave culling via section connectivity flooding.
- **Also**: sky gradient with sun/moon/stars, cloud layer at y=192, biome-tinted fog, weather
  particles, block-break particles, breaking-crack overlay (10 stages), block outline, held-item
  view model with swing animation, first and third person cameras.

## 3. World generation

- Seeded **xoroshiro128++** PRNG, matching Minecraft 1.18+, so a seed is reproducible and
  position-derived sub-seeds are stable.
- **Multi-noise biome placement** on five climate parameters: continentalness, erosion,
  peaks-and-valleys, temperature, humidity. Biome is a nearest-match lookup in that 5D space.
- **Density-function terrain**: 3D noise for the base shape, enabling overhangs and floating
  islands, with surface rules applied afterward per biome.
- **Caves**: cheese caves (large 3D noise cavities), spaghetti caves (tunnel noise), noodle caves
  (thin winding), plus ravines. Aquifers and lava lakes at depth.
- **Ores** with 1.18-style triangular distributions per type, including deepslate variants below
  the transition band.
- **~24 biomes**: plains, sunflower plains, forest, birch forest, dark forest, taiga, snowy taiga,
  snowy plains, ice spikes, desert, savanna, jungle, sparse jungle, bamboo jungle, swamp, badlands,
  eroded badlands, ocean, deep ocean, frozen ocean, beach, stony shore, river, meadow, grove,
  snowy slopes, jagged peaks, mushroom fields.
- **Features**: 8 tree species including large variants, cacti, sugar cane, bamboo, kelp, seagrass,
  flowers, grass, pumpkins, melons, berry bushes, lakes, springs, geodes, dripstone clusters,
  lush caves with moss and azalea.
- **Structures**: dungeons, mineshafts, strongholds, desert and jungle temples, villages with
  biome variants, ocean monuments, woodland mansions, ruined portals, shipwrecks, nether
  fortresses, end cities.

## 4. Blocks

Target **~400+ blockstates**. The count comes from families, not from hand-written definitions.

**Families** — stone (granite/diorite/andesite/deepslate/tuff/calcite/blackstone/basalt, each with
polished, brick, slab, stair, wall variants) · dirt (grass, podzol, mycelium, coarse, rooted,
farmland, path, mud, clay) · sand and sandstone · wood ×8 species (log, stripped, wood, planks,
leaves, sapling, slab, stair, fence, gate, door, trapdoor, button, pressure plate, sign) · ores and
mineral blocks · nether · end · plants and crops · functional blocks · redstone components.

**16-color families** — wool, carpet, concrete, concrete powder, terracotta, glazed terracotta,
stained glass, stained glass panes, beds, candles, shulker boxes, banners. These alone account for
roughly 190 blockstates and are generated from a single template each.

**Shapes** — cube, slab, stair, fence, fence gate, wall, pane, cross-plant, door, trapdoor, carpet,
layer (snow), torch, fluid. Each shape defines both its render model and its collision boxes once,
generically.

**Per-block properties** — hardness, blast resistance, required tool and harvest level, light
emission, light opacity, flammability, sound group, gravity-affected, waterloggable, and a
blockstate property set (facing, half, axis, powered, age, level, …).

## 5. Inventory and containers

- **36 slots** (27 main + 9 hotbar) + 4 armor + 1 offhand, with vanilla stack sizes (64 / 16 / 1).
- Full interaction rules: left-click take/place, right-click take-half/place-one, shift-click
  quick-transfer with correct destination priority, left-drag distribute-evenly, right-drag
  place-one-each, middle-click clone in creative, `Q` drop, `Ctrl+Q` drop stack, hotbar number
  swap, `F` offhand swap, pick-block.
- **Containers**: chest (27), double chest (54), barrel, ender chest, shulker box, furnace / blast
  furnace / smoker (input + fuel + output with burn and progress arrows), crafting table, anvil,
  grindstone, enchanting table, brewing stand, hopper (5), dispenser / dropper (9), beacon, loom,
  stonecutter, cartography table, smithing table.
- **Creative inventory** with tabbed categories and a search field.
- **Item entities** on the ground: pickup delay, stack merging, 5-minute (6000 tick) despawn.

## 6. Crafting and recipes

- **Shaped** recipes with a pattern and key, matched at every offset in the grid and mirrored
  horizontally — exactly vanilla's matching semantics.
- **Shapeless** recipes.
- **Tag ingredients** (`#planks`, `#logs`, `#wool`) so one recipe covers all wood species.
- **~350 crafting recipes**, plus smelting, blasting, smoking, campfire cooking (each with its own
  cook time and XP yield), stonecutting, smithing (netherite upgrade), and brewing.

## 7. Tools, combat, progression

- **Six tiers** — wood, stone, iron, gold, diamond, netherite — with real speed multipliers
  (2 / 4 / 6 / 8 / 12 / 9) and real durabilities (59 / 131 / 250 / 32 / 1561 / 2031).
- **Mining time** = `hardness × (1.5 if correct tool and harvestable else 5) / toolSpeed`, modified
  by Efficiency, Haste, Mining Fatigue, ×5 if underwater without Aqua Affinity, ×5 if airborne.
- **Combat**: attack cooldown per weapon attack speed, critical hits (falling, not sprinting,
  1.5×), sweep attacks, knockback, shields with a blocking window, bows with draw time and velocity,
  crossbows, tridents.
- **Armor**: armor points and toughness feeding the real damage-reduction formula.
- **Enchanting**: enchanting table with bookshelf power, seeded three-offer generation, lapis cost;
  ~35 enchantments; anvil combining with prior-work penalty; grindstone disenchanting.
- **XP**: orbs, the real level curve, costs for enchanting and anvil work.

## 8. Entities and mobs

- **Physics**: AABB collision with axis-separated resolution, step-up, and the real movement
  constants (gravity 0.08/tick, drag 0.98, jump velocity 0.42, walk 4.317 m/s, sprint 5.612 m/s,
  sneak 1.295 m/s).
- **AI**: prioritized **goal selectors** and separate target selectors — the same architecture
  Minecraft uses — over an **A\*** pathfinder on a walkable node graph with jump, fall, door, and
  water costs.
- **~20 passive**: pig, cow, mooshroom, sheep (16 colors, shearable, regrowing), chicken, rabbit,
  horse, donkey, wolf, cat, fox, bee, squid, cod, salmon, tropical fish, turtle, panda, llama, goat,
  axolotl, frog, villager.
- **~18 hostile**: zombie, husk, drowned, skeleton, stray, creeper (charged variant), spider, cave
  spider, enderman, witch, slime, magma cube, blaze, ghast, wither skeleton, piglin, hoglin,
  phantom, silverfish, guardian, shulker, pillager, vindicator, evoker, ravager.
- **Bosses**: Ender Dragon (perch and strafe phases, crystals, respawn) and the Wither.
- **Spawning**: light level, block, and biome rules; per-category mob caps; despawn distance bands;
  the standard spawn cycle. Breeding, baby growth, taming, and loot tables with Looting scaling.

## 9. Survival systems

- Health 20, hunger 20 with saturation and exhaustion using vanilla per-action exhaustion values;
  all foods with real nutrition and saturation; natural regeneration rules; starvation.
- Damage types: fall (with the real formula), drowning, fire, lava, cactus, void, suffocation,
  explosion, magic, freezing — each with correct invulnerability frames.
- Full potion effect list, brewing, splash and lingering potions, effect HUD.
- Day/night on a 24000-tick cycle, weather with rain, snow, thunder, and lightning strikes.
- Beds, sleeping, spawn points, respawn, death screen.
- Gamemodes: survival, creative, adventure, spectator.

## 10. Fluids, redstone, dimensions

- **Fluids**: water and lava with vanilla spread rules (8 levels, source blocks, downward priority,
  hole-seeking flow, infinite water from two sources), waterlogging, swimming, boats, buckets,
  lava→obsidian / cobblestone / stone interactions, fire spread.
- **Redstone**: dust with real connection and decrement rules, torches, repeaters (delay and
  locking), comparators (compare and subtract modes, container reading), levers, buttons, pressure
  plates, tripwire, pistons and sticky pistons (12-block push limit, block entity movement),
  observers, slime and honey blocks, hoppers, droppers, dispensers, all four rail types, minecarts,
  note blocks, daylight sensors, target blocks, on a redstone-tick (2 game ticks) scheduler.
- **Dimensions**: Overworld, Nether (portal construction and lighting, 8:1 coordinate linking,
  nether biomes, fortresses), The End (eyes of ender → stronghold → portal, island generation,
  obsidian pillars, dragon fight, gateway, end cities).

## 11. Interface and audio

- Title screen, world list, world creation (seed, gamemode, world type, structures, cheats),
  settings (render distance, FOV, sensitivity, volume, GUI scale, full keybind remapping), pause.
- HUD: hotbar, hearts with poison/wither/absorption variants, hunger, armor, XP bar and level, air
  bubbles, crosshair, boss bar, effect icons, F3 debug screen with the vanilla layout.
- Chat with a command set: `/give /tp /time /gamemode /weather /summon /fill /setblock /seed /kill
  /xp /effect /enchant /gamerule /clone /locate`.
- Audio synthesized at runtime via Web Audio: per-material break, place, and step sounds, mob
  sounds, damage, ambience — positioned in 3D with distance attenuation.

---

## Explicit non-goals

Named so they are decisions rather than omissions:

- **Multiplayer.** The engine is a single game loop by choice. Adding networking later would mean
  restructuring world access and entity ticking around an authoritative server.
- **Mod / datapack loading.** Registries are data-driven internally, but no external loading API.
- **Resource pack support.** Textures are generated, not loaded.
- **Minecraft's actual assets.** Copyrighted; originals are generated instead.
- **Bedrock parity.** Java Edition behavior is the reference throughout.
- **Realms, servers, accounts, telemetry.**
