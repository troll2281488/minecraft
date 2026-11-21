# Vanilla Parity Checklist

"Copy Minecraft 1:1 as close as possible" is only a meaningful claim if it can be checked. This
file is where it gets checked — per system, honestly, including the places where this project
deliberately differs.

Reference target for this compatibility track is **Minecraft: Java Edition 1.19.x**. Rows inherited from older project phases must be re-verified against 1.19 before being marked exact.

**Legend**

| | Meaning |
|---|---|
| ✅ | Matches vanilla — same formula, same constants, same observable behavior |
| 🟡 | Implemented and playable, but simplified or approximated. The difference is stated. |
| ⬜ | Not yet implemented |
| ❌ | Deliberately out of scope — see [SPEC.md § non-goals](SPEC.md#explicit-non-goals) |

> **Current status: Phase 1 (v0.1.0).** A row earns ✅ only when a test in `tests.html` covers it
> or it has been verified against a vanilla-documented value. "The number is typed into
> constants.js" is not sufficient.

---

## Core constants

| Item | Vanilla value | Status |
|---|---|---|
| Tick rate | 20 TPS, fixed timestep with accumulator | ✅ |
| Day length | 24000 ticks (20 min) | ✅ |
| Day/night boundaries | dusk 12000, night 13000, dawn 23000 | ✅ |
| World height | −64 to 320 | ✅ |
| Chunk size | 16×16, 16³ sections | ✅ |
| Light levels | 0–15, sky + block | ✅ |
| Gravity | 0.08 blocks/tick² | ✅ |
| Vertical drag | 0.98/tick | ✅ |
| Terminal velocity | −3.92 blocks/tick | ✅ |
| Jump velocity | 0.42 blocks/tick | ✅ |
| Jump apex | 1.252 blocks (clears a full block) | ✅ *measured, tested* |
| Sprint-jump forward impulse | 0.2 | ✅ |
| Walk / sprint / sneak speed | 4.317 / 5.612 / 1.295 m/s | ✅ *measured 0.0% error, tested* |
| Physics tick order | input → move → gravity/friction (vanilla) | ✅ |
| Ground friction / ice slipperiness | 0.6 / 0.98 | ✅ |
| Step height | 0.6 (cannot walk up a full block; matches vanilla) | ✅ |
| Player hitbox / eye height | 0.6×1.8, eye 1.62 | ✅ |
| Reach | 4.5 survival, 5.0 creative | ✅ |
| Item despawn | 6000 ticks | ⬜ *(no item entities until Phase 3)* |

## Mining

| Item | Vanilla behavior | Status |
|---|---|---|
| Mining time formula | `ceil(hardness × (1.5 / 5) × 20 ÷ speed)` whole ticks | ✅ |
| — stone by hand | 7.5 s (150 ticks) | ✅ *exact* |
| — stone, wooden / stone / iron pickaxe | 1.15 / 0.6 / 0.4 s | ✅ *exact* |
| — stone, diamond / gold pickaxe | 0.3 / 0.2 s | ✅ *exact* |
| — obsidian, diamond pickaxe | 9.4 s | ✅ *exact* |
| — dirt by hand / wooden shovel | 0.75 / 0.4 s | ✅ *exact* |
| — oak log, wooden axe | 1.5 s | ✅ *exact* |
| Tool speed multipliers | wood 2, stone 4, iron 6, diamond 8, netherite 9, gold 12 | ✅ |
| Tool durabilities | 59 / 131 / 250 / 1561 / 2031 / 32 | ✅ |
| Harvest levels gate drops | yes | ✅ |
| Underwater / airborne penalty | ×5 each | ✅ |
| Tool durability consumed on break | yes | ✅ |
| Efficiency, Haste, Mining Fatigue | modify speed | 🟡 *(formula present, no enchantments/effects to drive it)* |
| Per-block hardness table | full vanilla table | 🟡 *(69 blocks carry real values; catalog grows in Phase 2)* |
| Break progress tracked per target | resets when target changes | ✅ |
| 10-stage crack overlay | overlay on the block being broken | ✅ *(generated in-shader rather than as a texture)* |
| Block drops seeded from world seed + position | reproducible | ✅ |
| Ore mining XP (coal, lapis, redstone, diamond, emerald, nether quartz) | vanilla XP ranges, harvest-tool gated | 🟡 *(orb pickup is implemented; Fortune/Silk Touch and full deepslate catalog remain incomplete)* |
| Fishing, breeding and villager trade XP | Java 1.19 point ranges | 🟡 *(3–6 trade XP is implemented; +5 level-up bonus awaits real villager XP progression)* |

## Inventory & crafting

| Item | Vanilla behavior | Status |
|---|---|---|
| Slot layout | 27 + 9 hotbar + 4 armor + offhand | ✅ |\n| Swap selected hotbar item with offhand (F) | yes | 🟡 *(inventory operation + default key + toast; offhand HUD rendering still needs verification)* |
| Stack sizes | 64 / 16 / 1 | ✅ |
| Damaged tools do not stack | yes | ✅ |
| Fill partial stacks before empty slots | yes | ✅ |
| Left-click take/swap, right-click half/one | yes | ✅ |
| Shift-click transfer between hotbar and main | yes | ✅ |
| Shift-click between chest/furnace slots and player inventory | yes | 🟡 *(two-way transfer; partial stacks remain in source; automated tests)* |
| Shift-click armor auto-equip (occupied slot falls back to storage) | yes | 🟡 *(empty-slot equip + occupied-slot fallback tested)* |
| Left-drag distribute / right-drag one-each | yes | 🟡 *(left-drag distributes evenly across compatible player inventory slots; right-drag places one per slot)* |
| Shaped matching (any offset + mirrored) | yes | ✅ |
| Shapeless matching | yes | ✅ |
| Tag ingredients (`#mc:planks`) | yes | ✅ |
| Recipe count | ~350 | 🟡 *(50 in Phase 1)* |
| — verified: 1 log → 4 planks | yes | ✅ |
| — verified: 2 planks (vertical) → 4 sticks | yes | ✅ |
| 2×2 personal grid (planks/sticks/table/2×2 recipes) | yes | ✅ |
| **3×3 crafting table** — right-click to open | yes | ✅ *tested; sneak+click places instead* |
| — tools/weapons craftable at the table | pickaxe/axe/shovel/sword ×6 tiers | ✅ *tested* |
| Crafting grid returns items on close | yes | ✅ |
| Creative inventory — all blocks, click to grab, search | tabbed + search | 🟡 *scrollable list + search; tabs are a later polish* |
| Furnace smelting XP | Fractional XP is banked per completed recipe and awarded only when output is manually collected; pending XP persists and drops as orbs when the furnace is broken | 🟡 *(supported recipe subset only; blast furnace, smoker, hoppers and the complete 1.19 recipe catalogue remain incomplete)* |
| Player death XP | Drop 7 × current level, capped at 100; `keepInventory` preserves XP | 🟡 *(Overworld Survival deaths with `keepInventory=false`; death-orb restoration across dimensions is not yet supported)* |
| Monster spawners | Active within 16 blocks; up to four mobs per cycle; 200–799 tick delay; six-mob local cap; dungeon rooms generate a spawner | 🟡 *(activation, delay, cap, local save state and zombie/skeleton/spider dungeon selection are implemented; light checks, exact vanilla collision rules, network authority and loot tables remain incomplete)* |
| Monster spawner mining XP | Survival pickaxe break releases 15–43 XP; spawner itself never drops | 🟡 *(mining reward is implemented; Silk Touch is not implemented and spawners never drop as items)* |
| Stonecutting / smithing / brewing | yes | ⬜ |

## World generation

| Item | Vanilla behavior | Status |
|---|---|---|
| Seeded, reproducible from seed alone | yes | ✅ |
| xoroshiro128++ generator | 1.18+ | ✅ *(verified against BigInt)* |
| Text seeds hashed as Java `String.hashCode` | yes | ✅ |
| Position-derived sub-seeds (order independent) | yes | ✅ |
| Multi-noise biome placement (5 params) | 1.18+ style | 🟡 *(Phase 1 uses 2-param temp/humidity over 8 biomes; full system is Phase 2)* |
| Density-function terrain | yes | 🟡 *(2D heightmap + 3D carving)* |
| Caves | cheese + spaghetti + noodle | 🟡 *(tunnel + cheese; no noodle caves or ravines)* |
| Ore triangular distributions | 1.18 values | ✅ |
| Deepslate ore variants + ragged transition | yes | ✅ |
| Trees per biome | 8 species incl. large variants | 🟡 *(oak, birch, spruce; canopies clipped at chunk borders)* |
| Biome count | ~24 | 🟡 *(8)* |
| Aquifers, lava lakes, structures | yes | 🟡 *(dungeon rooms include mob spawners and seeded chest loot; both optional room chests now receive loot; three weighted dungeon loot pools and seeded random chest-slot placement follow Java 1.19; enchanted books and gunpowder are represented by their own registered item IDs; randomized enchantment data is still pending)* |

## Rendering

| Item | Vanilla behavior | Status |
|---|---|---|
| Per-face culling against neighbours | yes | ✅ |
| Ambient occlusion (per-vertex) | yes | ✅ |
| Smooth lighting (4-cell average) | yes | ✅ |
| AO seam fix (quad diagonal flip) | yes | ✅ |
| Directional face shading | top 1.0, bottom 0.5, N/S 0.8, E/W 0.6 | ✅ |
| Translucent pass sorted back-to-front | yes | ✅ |
| Same-fluid faces culled against each other | yes | ✅ |
| Frustum culling | yes | ✅ |
| Camera / aim consistency | view matrix agrees with raycast + movement | ✅ *(invariant: `fromCamera·forward == [0,0,-1]`, tested)* |
| Biome-tinted grass / foliage / water | per-biome blend | 🟡 *(single plains tint; per-biome blending is Phase 2)* |
| Box-model system (render + collision from one box list) | yes | ✅ *tested* |
| Slabs (bottom/top/double) — render, collide, auto-step | yes | ✅ *tested* |
| Stairs (facing/half, straight) — render, collide, walk up | yes | 🟡 *straight only; corner auto-shaping and cropped-UV textures are refinements* |
| Doors (oak, spruce, birch, jungle, acacia, dark oak, iron) — two-block placement, paired state, wooden toggle, open/closed collision and removal | yes | 🟡 *(iron redstone activation, hinge placement rules and exact door sound/UV polish remain)* |
| Door geometry / collision | shared 1/16-thick model | 🟡 *(axis-aligned panel boxes; model is simplified)* |
| Trapdoors (six wood types + iron) — open/closed shape, collision, hand toggle and recipes | yes | 🟡 *(iron requires redstone; attachment validation and exact orientation remain)* |
| Buttons (wood, stone, polished blackstone), lever, standard and weighted pressure plates, daylight detector, note block, redstone wire, redstone torch (floor-mounted inversion), repeater, comparator (compare/subtract modes, directional 0–15 output, 2-tick delay), redstone lamp and glowstone, hopper (five-slot inventory, eight-tick item transfer), observer, dropper, target, piston and sticky piston | 🟡 | *(local active-area simulation; piston push/retract is transactional and capped at 12 blocks; slime- and honey-block adhesion are implemented, while block entities, quasi-connectivity, exact Java update scheduling and moving-block animation remain incomplete)* |
| Fence, gate, wall models | yes | ⬜ |
| Cloud layer, weather, particles | yes | ⬜ |

## Saves

| Item | Requirement | Status |
|---|---|---|
| Namespaced string IDs only | [contract](SAVE_FORMAT.md) | ✅ |
| Palette + packed bit array | yes | ✅ |
| Migration chain applied in order | yes | ✅ |
| `DATA_VERSION` == max migration `to` (enforced by test) | yes | ✅ |
| Unknown blocks preserved on round trip | yes | ✅ |
| Unknown *items* preserved on round trip | yes | ✅ |
| Corruption detected rather than loaded (gzip CRC) | yes | ✅ |
| Write is idempotent (round trip byte-identical) | yes | ✅ |
| Pre-migration backup captured | yes | ✅ |
| Chunks never regenerated (`generatedStage`) | yes | ✅ |
| **Golden saves from every version load** | yes | ✅ *(v0.1.0 recorded)* |
| Autosave every 30 s and on chunk unload | yes | ✅ |
| Export / import `.mcw`, drag-and-drop | yes | ✅ |

## Multiplayer (experimental)

Room-code joining, remote avatar rendering, chat, shared overworld block edits, player health/food/experience status display, sprint/sneak state, attack animation, held/offhand item identifiers and simplified remote armor/equipment rendering, a host-synchronized day/night clock with deterministic handoff when the host leaves, and per-player local save persistence across reconnects are implemented. This is not yet a complete co-op survival session: each browser still simulates its own mobs and combat; mob damage, inventory/container contents, XP orbs and XP awards, weather and dimensions are not shared/authoritative. Firebase access also depends on the configured Realtime Database being reachable and its deployed security rules allowing the intended operations.

### Observer, dropper and target block

Observer detects a change in the adjacent block on its facing side and emits a two-tick pulse. Dropper stores nine slots and on a rising redstone edge transfers one item into a supported adjacent container or ejects it into the world. Target block reports an analogue signal for arrow hits, with stronger output near the center. These systems are active-area simulations; exact Java update ordering, all projectile types and chunk-wide ticking remain incomplete.

### Hopper automation

Hoppers now have a five-slot saved inventory, a vanilla-shaped recipe, a container UI, one-item transfers on an eight-tick cadence between nearby hoppers/chests/furnaces, and redstone locking. The simulation is host-authoritative in multiplayer and only scans a small area around the active player to limit work and network traffic. Dropped-item pickup, minecart containers, exact sided furnace slot rules, and full unloaded-chunk scheduling remain incomplete.

## Not yet started

Survival is partial: health, hunger, player XP levels, XP orbs from player-credited mob kills, eligible ore mining, fishing, successful animal breeding, villager trades and manually claimed furnace smelting XP; furnace XP is fractionally banked, persisted and released when its block is broken. Same-value orb merging, water buoyancy, fire/lava/cactus destruction, XP attraction/pickup and the survival XP HUD are present, with food consumption and basic starvation/
regeneration; mob spawning, wandering, simple fleeing/pursuit, melee combat with armour damage reduction/durability, sheep shearing,
fishing, apple drops from oak leaves, wheat seed drops from grass, rare zombie carrot/potato drops, and drops for pigs, sheep, cows, chickens and zombies are implemented in simplified
form. Basic wheat farming is now playable: hoes till soil, seeds plant crops, seven growth stages advance near the player, and mature wheat yields wheat/seeds; bread is craftable. Crop growth is a fixed 600-tick interval within a 6-block player radius, without vanilla light, hydration or neighbour checks. Still missing are full vanilla mob AI, breeding, chicken egg laying, armour enchantments and potion effects, and full vanilla item-drop and respawn rules. Fluids and flow, redstone, enchanting and
brewing, dimensions, structures, villagers and audio are not implemented. See
[`../PLAN.md`](../PLAN.md) for the phase each belongs to.

---

## Known and accepted differences

| System | How it differs | Why |
|---|---|---|
| Textures & sounds | Procedurally generated originals, not Minecraft's assets | Minecraft's assets are copyrighted. Mechanics are unaffected. |
| Multiplayer | 🟡 Experimental rooms sync positions, health/food display, sprint/sneak and attack pose, visible held/offhand equipment and simplified armor, chat, block edits and world time; mobs, damage, inventory, containers and dimensions are not shared/authoritative yet | Co-op foundation exists; shared survival simulation remains incomplete |
| Bedrock-specific behavior | Absent | Java Edition is the reference |
| Water | Static; renders and blocks movement but does not flow | Full fluid mechanics are Phase 5. Terrain needs oceans to look right before then. |
| Lighting scope | Computed per chunk; cross-chunk light does not bleed through a chunk border | Exact for the common case, slightly wrong beside a tall overhang in a neighbouring chunk. Incremental cross-chunk relighting is Phase 3. |
| Chunk meshing | Runs on the main thread under a 6 ms/frame budget, not in the worker pool | Correct meshing needs the eight neighbouring chunks; shipping those to a worker means ~250 KB of copying per chunk or moving storage to SharedArrayBuffer. Terrain *generation* — the more expensive half — does run in workers. |
| Meshing throughput | ~12 ms per chunk | Improved 2.3× by loading each section's 18³ neighbourhood into scratch once instead of making ~250,000 world lookups per chunk. Still the slowest part of loading; moving it to workers needs the SharedArrayBuffer refactor. |
| Starting kit | New worlds grant stone tools, torches, and planks | Not vanilla. Phase 1 has no furnace or chest, so this makes the whole block catalog reachable in the first minute rather than the first hour. |
| Tree canopies | Do not cross chunk borders | Phase 1 generation writes only into its own chunk; cross-chunk feature placement arrives in Phase 2. |


### Java 1.19 structure loot progress

- Desert and jungle temple chests use separate seeded, weighted loot pools (three desert pools and two jungle pools). Strongholds now generate a distinct large-library room with two library chests, retain a crossing/storage chest, and add a portal-room chest; each chest type is recognized by its exact seed-derived coordinates and uses a separate weighted loot table. All loot entries use registered item IDs. The implementation remains an approximation: randomized enchantment data and temple dispenser loot remain outstanding. Stronghold generation now includes a deterministic side-room network with a connected library wing, bent dead-end passage, four-exit crossing, seed-selected fountain/pillar, stocked storage room, and a two-cell prison hall. The library wing has compact and duplex variants, bookshelf rows, a two-level oak gallery with ladder and fence railing, two loot chests in the duplex variant, and deterministic 7% cobweb placement in the lower air volume; generation version is 21. The compact/duplex selection is currently seed-based rather than vanilla's collision/space test. Cobweb blocks now damp intersecting player movement (horizontal velocity ×0.25, vertical ×0.05) before collision resolution. Stronghold library, storeroom, and altar pools now include map/compass/pearl entries and the library (52), storeroom (62), and altar common-roll (63) weight totals. The portal room now generates twelve inward-facing frame states with deterministic 10% eye prefill per frame, a 15-source lava layout, a stair block, and a dedicated silverfish spawner state. Map and compass are registered inventory items only; their navigation behavior and dedicated item artwork remain pending. The portal frame is not yet activatable and the chamber's iron-bar grille / exact full-room geometry remain incomplete.


### Ladder movement

Player movement now detects ladder contact: forward or jump input climbs at a capped upward velocity, falling is limited while attached, and sneaking holds vertical position. This is an initial movement implementation; directional attachment validation and exact vanilla climbing acceleration remain parity work.


### Redstone ore

Redstone ore has a saved lit state. Right-clicking it or stepping on it activates a 30-tick glow; the lit state emits block light level 9 and uses a brighter procedural texture. Repeated contact refreshes the timer. This is a local player-contact approximation; projectile activation, exact vanilla mining-start hooks and mob contact are not included.

### Comparator inventory inputs

Comparators now read fullness from the five-slot hopper and nine-slot dropper inventories as well as chests and furnaces. The output uses the vanilla fullness scaling formula and the existing two-game-tick update delay. Inventory snapshots are read locally; no additional multiplayer polling or per-tick network traffic is introduced.

### Slime blocks and piston adhesion

Slime blocks can be crafted from nine slime balls. A piston pushing a slime block now plans the connected attached-block group before changing the world; attached ordinary blocks move with it, and the complete group is rejected if any member is immovable, outside build height, in an unloaded chunk, or would exceed the 12-block push cap. Honey blocks now have an original procedural texture, a creative inventory item, Java slipperiness (0.4), piston adhesion to ordinary blocks, and do not adhere to slime blocks. Falling players touching a honey wall are capped at −0.05 vertical velocity and have fall distance reset. Honeycomb is registered with a four-item recipe for honeycomb blocks. Bee nests and crafted beehives have a saved 0–5 honey-level blockstate; a full hive can be harvested with shears (3 honeycombs) or a glass bottle (1 honey bottle) only when a campfire has an unobstructed smoke column directly below it. Honey bottles restore 6 food points and return an empty glass bottle. Campfire, hive and nest textures are procedural, and the beehive/campfire recipes are registered. Bee entities spawn in flower forests and have a fallback model; they seek nearby flowers, collect pollen, find non-full nests/hives and increment honey level after delivering pollen. Bee pollen and hive-work progress are saved. Natural nest placement is deterministic on eligible oak/birch trees in flower/forest/plains biomes. Bee AI is a lightweight ground-following approximation rather than vanilla flight/return/anger behavior, and nest block geometry/smoke particles are simplified.

### Pistons

Normal and sticky pistons now react to adjacent local redstone signals. Extension validates the complete push line before mutating anything, moves up to 12 movable blocks from farthest to nearest, creates an oriented internal piston head, and records the extended blockstate. Retraction removes the head; sticky pistons pull one movable block from two blocks ahead when the front cell is clear. Slime blocks pull adjacent ordinary blocks into the same transactional push group; the 12-block cap counts the entire group. Bedrock, obsidian, portal blocks, piston parts, containers, spawners and other registered immovable IDs block movement. Piston base and head face textures now follow the six-way facing state. The piston head has a shared render/collision box model. This remains a deliberately bounded implementation: moving-block entity interpolation, quasi-connectivity, block-entity movement, fragile-block destruction rules, gravity updates and complete Java neighbor-update scheduling remain incomplete.
