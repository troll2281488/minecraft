# Minecraft Java Edition 1.12.2 compatibility audit

**Status: NOT 1.12.2-compatible. This document is an audit, not a completion claim.**

The current codebase cannot honestly be described as a complete Minecraft Java Edition 1.12.2 implementation. Its own `src/core/constants.js` names 1.20.x as its reference target, and the world generator documents 1.18-era terrain/ore behavior. Hiding a few newer blocks would not make the simulation compatible.

## Confirmed post-1.12 content found in source

The source currently registers or references at least:

- Deepslate and cobbled deepslate, including deepslate ore variants.
- Copper ore, copper blocks, raw copper and copper ingots.
- Netherite tool/armor tier, netherite harvest level and netherite smithing concepts.
- 1.18-style negative-Y/deepslate terrain and triangular ore distributions.
- Bamboo jungle and other biome/feature concepts identified in `docs/SPEC.md` that postdate 1.12.2.
- Sculk-related identifiers in tests (including sculk catalyst and sculk shrieker).

These are incompatible with the 1.12.2 target and must not appear in a 1.12.2 game.

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
