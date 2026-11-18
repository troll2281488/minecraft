# Minecraft Java Edition 1.12.2 compatibility audit

**Status: INCOMPLETE 1.12.2-targeted prototype. This document is an audit, not a completion claim.**

The current codebase is being corrected toward Minecraft Java Edition 1.12.2. The compatibility pass now uses the classic 0..255 build height, classic ore bands and no registered deepslate, copper or netherite gameplay content. It is still not a complete Minecraft Java Edition 1.12.2 implementation.

## Compatibility removals applied

The active block/item registries, world generator and atlas no longer provide deepslate, copper or netherite content. Stairs and slabs also no longer carry the post-1.12 `waterlogged` state. Tests retain a parser fixture for an unknown future block ID only to verify forward-compatible save handling; that fixture does not register or expose the block in gameplay.

## Major 1.12.2 parity work still required

The existing README and specification describe a partial browser voxel sandbox, not a full game. Before claiming parity, implementation and tests are still needed for the complete 1.12.2 block/item/state catalog and metadata; all 1.12.2 biomes and dimension generation; Nether and End; villages, temples, dungeons, strongholds, mineshafts, monuments, mansions and other structures; redstone components and update behavior; pistons; rails and minecarts; boats; full fluid flow; enchanting and the 1.12.2 enchantment set; brewing and potion effects; anvils; fishing loot; maps; banners; shulker boxes; command blocks and commands; advancements; statistics; recipes and furnace behavior; weather and day/night details; all hostile, passive and utility mobs with their AI, spawning, drops and breeding; combat and damage rules; sound, particles, lighting and block updates; multiplayer/server protocol; and save compatibility.

This list is a minimum work breakdown, not an assertion that it exhausts every edge case. Version-specific behavior must be checked against authoritative 1.12.2 references and regression tests.

## Required engineering approach

1. Establish a version-locked source of truth for 1.12.2 block IDs, metadata, items, entities, recipes, biomes, dimensions and mechanics.
2. Remove post-1.12.2 content from registries, recipes, world generation, rendering, UI, tests and saves—not just from the visible creative inventory.
3. Implement missing 1.12.2 systems in dependency order, with deterministic tests for state transitions and world generation.
4. Run the complete automated test suite and browser integration tests in a working browser environment.
5. Compare behavior against 1.12.2 reference fixtures before marking any subsystem complete.

## Current verification limits

The previous browser test attempt was blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). Therefore no claim is made here that browser integration tests pass. This audit does not claim full game parity, and it does not claim that incompatible content has already been removed.


- Added the three missing classic wood families (jungle, acacia, dark oak), including logs, planks, leaves and saplings, their atlas materials, and plank conversion recipes.
- Registered a first batch of 1.12.2-era building blocks: red sandstone, prismarine variants, sea lantern, end stone/bricks, purpur, slime, magma, bone, packed ice, sponge variants and hay bale. Some use placeholder atlas materials; their specialized behavior is not yet complete.
- Removed the post-1.13 waterlogged state from slabs and stairs.

## Remaining major blockers to full playability

- The generator is still a simplified heightmap/noise generator, not the complete 1.12.2 biome/structure generator; current biome selection is only a small subset, and it does not reproduce Java 1.12.2 world seeds exactly.
- Nether and End world generation, portals, dragon fight and dimension-specific behavior are incomplete.
- Most 1.12.2 blocks and block entities are still absent; some newly registered decorative blocks use placeholder textures and lack their special behavior.
- Fluid simulation, redstone circuits, pistons, doors/gates, rails, minecarts, boats, dispensers, droppers, hoppers, brewing, enchanting, anvils, maps, banners, command blocks and commands are incomplete or absent.
- Mob spawning, pathfinding, attacks, drops, breeding, riding and boss behavior are not complete for all 1.12.2 entities.
- Browser integration tests were not verified in this environment. Node-compatible unit suites were run separately; the browser-only golden-save test uses browser `fetch` and was excluded from the Node run.

- Added all 16 dye colors for wool, stained glass, terracotta, concrete and concrete powder, with procedural colored atlas textures.

- Added survival fall damage (three-block safe distance, one health point per additional block) and a death/respawn screen. Respawn currently preserves inventory as a deliberate prototype convenience; this differs from vanilla death drops.
- Added leather, chainmail, iron, gold and diamond armour items; leather/iron/gold/diamond crafting recipes; shift-click equip/swap; and armour-point/toughness damage reduction with durability wear on hostile attacks. Armour enchantments and potion effects remain absent.
- The current build still has no End portal/End dimension/dragon encounter, so it is not yet completable as a vanilla Minecraft 1.12.2 playthrough.
