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
- Added survival recipes for the missing shovel/hoe tiers, leather and gold armor, compass, clock, book, paper, shears, leads, and snowballs; recipes are being audited against the full item catalog for gaps.
- Dropped items now bob and rotate above the ground; eating animates the first-person hand; the HUD lists active effects at the upper-right with hover descriptions.

## Mobs and combat
- Passive/hostile mobs, villagers, drops, melee/ranged combat, bows, hostile projectiles.
- Creeper proximity fuse and flint-and-steel ignition; Enderman gaze-triggered teleport, water damage/escape, and arrow immunity.
- Existing mob roster now has distinct vanilla-inspired traits: zombies burn in daylight (but not rain); skeletons keep ranged bow attacks; wither skeletons inflict periodic wither damage; blazes hover, shoot fireballs, and are hurt by water; pigs follow carrots/potatoes/beetroots; sheep graze grass into dirt; chickens lay eggs; rabbits hop; villagers flee nearby hostile mobs; cows remain milkable; creepers ignite/explode; Endermen react to gaze, teleport, avoid arrows and flee water; Ender Crystals heal the Dragon; the Dragon circles, breathes at the player, and is healed by crystals.
- Ender Dragon, End crystals, boss UI, particles, procedural sound effects.
- Snowballs can be thrown and deal bonus damage to Blazes, giving the Nether mob its classic projectile weakness.
- Creepers flash white, swell, and hiss during the fuse; mob damage and melee attacks now trigger mob-specific procedural voice cues.

## Commands and interface
- Chat and command suggestions; teleport, summon, time, weather, gamerules, give, heal/feed, inventory utilities.
- Additional `/time add`, `/time query`, `/xp add`, `/setblock`, `/fill`, `/say`, and `/kill @e` commands with suggestions.
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
