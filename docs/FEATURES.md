# Existing game feature baseline

This is the compatibility checklist for the game that already exists. Future work must be additive: extend these systems or add new ones. Do not replace, remove, or reimplement an existing feature unless explicitly requested.

## World and exploration
- Seeded voxel terrain, chunk loading/rebuilding.
- Overworld, Nether, End, and dimension/portal switching.
- Generated villages, pyramids, ruined portals, strongholds, End islands/cities.
- Day/night, weather, difficulty, spawn points, and world rules.

## Player and survival
- First-/third-person camera, movement, sprint, sneak, jump, swim, flight, fall damage.
- Health, hunger, exhaustion damage, natural regeneration, air, fire, death, respawn.
- Survival, creative, spectator-style movement.
- Armor slots/equipment, damage reduction, armor visuals, shield/offhand, elytra glide.

## Items and progression
- Hotbar/inventory, cursor stack movement, split/place-one, double-click collection, creative item browser, drop/pickup.
- Crafting, furnace/smelting, food, tools, weapons, armor tiers, Netherite materials, Ender pearls, bows/arrows, trident item.
- XP/levels, chests/loot, beds/sleep, villager professions/trades, farming/crops.

## Mobs and combat
- Passive/hostile mobs, villagers, drops, melee/ranged combat, bows, hostile projectiles.
- Ender Dragon, End crystals, boss UI, particles, procedural sound effects.

## Commands and interface
- Chat and command suggestions; teleport, summon, time, weather, gamerules, give, heal/feed, inventory utilities.
- Pause/death/victory screens, HUD, armor/hunger/health indicators, player skins, TAB player/ping list.

## Online multiplayer already present
- Firebase Realtime Database room creation, code join, room browser.
- Shared world seed/settings and host-published dimension/time/weather/game rules.
- Remote player avatars, movement/pose, presence cleanup, ping display.
- Multiplayer chat and command log messages.
- Incremental block placement/breaking updates.

## Important boundary
This checklist records the previously implemented game, not every vanilla Minecraft feature. The existing online mode does not yet synchronize every entity, mob AI, inventory, or combat event. Those are future additions to the existing multiplayer system, not reasons to rebuild it.

## Block visuals
- Vanilla 1.21.11 block textures are loaded for the existing block catalog, with the procedural pixel art retained as an offline fallback.
- Grass, logs, crafting/furnace/chest/TNT/sandstone/hay/portal-frame faces use the correct face-specific vanilla texture variants.
- Block mining uses the ten vanilla destroy-stage crack overlays in progression order.

## Regression rule
A CI check runs before deployment and fails if a core implementation anchor listed in `scripts/check-features.mjs` disappears.
