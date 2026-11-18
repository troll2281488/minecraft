# Minecraft Java Edition 1.12.2-targeted prototype build

This is a browser-based voxel sandbox being brought toward Java Edition 1.12.2. It is **not yet a complete Minecraft 1.12.2 implementation** and is not network/protocol compatible with the official game.

## Start

- Windows: run `play.bat`
- Linux/macOS: run `./run.sh` (or `python3 serve.py`)
- Open `http://localhost:8080`; test suite: `http://localhost:8080/tests.html`

No npm install or build step is required. A modern browser with WebGL2 and Python 3 are required.

## Implemented in this build

- Classic 1.12.2 build height: Y=0..255.
- Classic-height ore generation; no deepslate, copper or netherite gameplay registrations.
- Six wood families: oak, spruce, birch, jungle, acacia and dark oak.
- Additional 1.12.2-era blocks including red sandstone, prismarine, sea lantern, end stone, purpur, slime, magma, bone, packed ice, sponge and hay bale.
- WebGL2 voxel rendering, chunk generation, player movement/collision, creative/survival modes, mining, placing, inventory, crafting, tools, armour, food, farming, partial mobs, fishing, containers and local saves.

Some added blocks use placeholder textures and do not yet implement their unique vanilla behavior. Biomes, structures, Nether/End, redstone, flowing fluids, brewing, enchanting, and many mobs/mechanics remain incomplete.

## Verification

The Node-compatible regression suites report 364 passed and 0 failed. The browser-only golden-save test and live browser integration were not verified in this environment. Run `tests.html` in a browser to perform the full browser suite.

See [`docs/VERSION_1_12_2_AUDIT.md`](docs/VERSION_1_12_2_AUDIT.md) and [`docs/PARITY.md`](docs/PARITY.md) for the remaining work. Procedural art is original and does not include Mojang assets.
