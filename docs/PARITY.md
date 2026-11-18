# Vanilla Parity Checklist

"Copy Minecraft 1:1 as close as possible" is only a meaningful claim if it can be checked. This
file is where it gets checked — per system, honestly, including the places where this project
deliberately differs.

Reference target is **Minecraft: Java Edition 1.20.x**.

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

## Inventory & crafting

| Item | Vanilla behavior | Status |
|---|---|---|
| Slot layout | 27 + 9 hotbar + 4 armor + offhand | ✅ |
| Stack sizes | 64 / 16 / 1 | ✅ |
| Damaged tools do not stack | yes | ✅ |
| Fill partial stacks before empty slots | yes | ✅ |
| Left-click take/swap, right-click half/one | yes | ✅ |
| Shift-click transfer between hotbar and main | yes | ✅ |
| Left-drag distribute / right-drag one-each | yes | ⬜ |
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
| Smelting / blasting / smoking | vanilla times + XP | ⬜ *(Phase 3, with the furnace)* |
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
| Aquifers, lava lakes, structures | yes | ⬜ |

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
| Non-cube models (fence, gate, wall, pane, door, trapdoor) | yes | ⬜ *(next Phase 2 increment)* |
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

## Multiplayer (experimental)\n\nRoom-code joining, remote avatar rendering, chat, shared overworld block edits, player health/food status display, a host-synchronized day/night clock with deterministic handoff when the host leaves, and per-player local save persistence across reconnects are implemented. This is not yet a complete co-op survival session: each browser still simulates its own mobs and combat; mob damage, inventory/container contents, weather and dimensions are not shared/authoritative. Firebase access also depends on the configured Realtime Database being reachable and its deployed security rules allowing the intended operations.\n\n## Not yet started

Survival is partial: health and hunger are present, with food consumption and basic starvation/
regeneration; mob spawning, wandering, simple fleeing/pursuit, melee combat, sheep shearing,
fishing, apple drops from oak leaves, wheat seed drops from grass, rare zombie carrot/potato drops, and drops for pigs, sheep, cows, chickens and zombies are implemented in simplified
form. Basic wheat farming is now playable: hoes till soil, seeds plant crops, seven growth stages advance near the player, and mature wheat yields wheat/seeds; bread is craftable. Crop growth is a fixed 600-tick interval within a 6-block player radius, without vanilla light, hydration or neighbour checks. Still missing are full vanilla mob AI, breeding, chicken egg laying, equipment/
armour combat, and a complete death/respawn loop. Fluids and flow, redstone, enchanting and
brewing, dimensions, structures, villagers and audio are not implemented. See
[`../PLAN.md`](../PLAN.md) for the phase each belongs to.

---

## Known and accepted differences

| System | How it differs | Why |
|---|---|---|
| Textures & sounds | Procedurally generated originals, not Minecraft's assets | Minecraft's assets are copyrighted. Mechanics are unaffected. |
| Multiplayer | 🟡 Experimental rooms sync player positions, chat and block edits; mobs, inventory, health, containers, world time and dimensions are not shared/authoritative yet | Co-op foundation exists; shared survival simulation remains incomplete |
| Bedrock-specific behavior | Absent | Java Edition is the reference |
| Water | Static; renders and blocks movement but does not flow | Full fluid mechanics are Phase 5. Terrain needs oceans to look right before then. |
| Lighting scope | Computed per chunk; cross-chunk light does not bleed through a chunk border | Exact for the common case, slightly wrong beside a tall overhang in a neighbouring chunk. Incremental cross-chunk relighting is Phase 3. |
| Chunk meshing | Runs on the main thread under a 6 ms/frame budget, not in the worker pool | Correct meshing needs the eight neighbouring chunks; shipping those to a worker means ~250 KB of copying per chunk or moving storage to SharedArrayBuffer. Terrain *generation* — the more expensive half — does run in workers. |
| Meshing throughput | ~12 ms per chunk | Improved 2.3× by loading each section's 18³ neighbourhood into scratch once instead of making ~250,000 world lookups per chunk. Still the slowest part of loading; moving it to workers needs the SharedArrayBuffer refactor. |
| Starting kit | New worlds grant stone tools, torches, and planks | Not vanilla. Phase 1 has no furnace or chest, so this makes the whole block catalog reachable in the first minute rather than the first hour. |
| Tree canopies | Do not cross chunk borders | Phase 1 generation writes only into its own chunk; cross-chunk feature placement arrives in Phase 2. |
