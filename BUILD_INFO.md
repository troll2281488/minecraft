# Minecraft Java Edition 1.12.2-targeted prototype build

This is a browser-based voxel sandbox being brought toward Java Edition 1.12.2. It is **not yet a complete Minecraft 1.12.2 implementation** and is not network/protocol compatible with the official game.

## Start

- Windows: run `play.bat`
- Linux/macOS: run `python3 serve.py` (or `sh run.sh`)
- Open `http://localhost:8080`; test suite: `http://localhost:8080/tests.html`

No npm install or build step is required. A modern browser with WebGL2 and Python 3 are required.

## Implemented in this build

- Classic 1.12.2 build height: Y=0..255.
- Classic-height ore generation; no deepslate, copper or netherite gameplay registrations.
- Six wood families: oak, spruce, birch, jungle, acacia and dark oak.
- Additional 1.12.2-era blocks including red sandstone, prismarine, sea lantern, end stone, purpur, slime, magma, bone, packed ice, sponge, hay bale, and all 16-color wool/stained-glass/terracotta/concrete families.
- WebGL2 voxel rendering, chunk generation, player movement/collision, creative/survival modes, mining, placing, inventory, crafting, tools, armour, food, farming, partial mobs, fishing, containers and local saves.
- Survival damage from hostile mobs and falls, a death screen, and a respawn flow that preserves the player's inventory.

This build is a playable survival sandbox, but it is not yet possible to complete the vanilla 1.12.2 progression or defeat the Ender Dragon. Some added blocks use placeholder textures and do not yet implement their unique vanilla behavior. Biomes, structures, Nether/End, redstone, flowing fluids, brewing, enchanting, and many mobs/mechanics remain incomplete.

## Verification

The browser test harness is `tests.html`. Tests and live browser integration were not executed for this build in the current environment; run `tests.html` in a browser to verify the current branch.

See [`docs/VERSION_1_12_2_AUDIT.md`](docs/VERSION_1_12_2_AUDIT.md) and [`docs/PARITY.md`](docs/PARITY.md) for the remaining work. Procedural art is original and does not include Mojang assets.
