# Prototype build — Minecraft Java 1.12.2 target

This archive is a playable browser-based voxel sandbox prototype, not a complete or binary-compatible recreation of Minecraft Java 1.12.2.

## Start

- Windows: run `play.bat`
- Linux/macOS: run `./run.sh` (or `python3 serve.py`)
- Open `http://localhost:8080`; test suite: `http://localhost:8080/tests.html`
- Requires Python 3 and a modern browser with WebGL2. No npm install or build step is required.

## Included

- Seeded chunk/world generation, caves, ore veins, several biomes and trees
- WebGL2 voxel renderer, face culling, ambient occlusion and lighting
- Player movement, collision, survival/creative modes, mining and block placement
- Inventory, crafting, tools, armour, food, farming, mobs, fishing, containers and save/import/export systems (see `README.md` and `docs/PARITY.md` for exact status)
- Browser test harness and regression tests

## Compatibility note

The target is Java Edition 1.12.2, but this build still contains newer-version concepts (for example deepslate and netherite) and lacks major 1.12.2 systems (including the Nether/End dimensions, redstone, full structures, enchanting/brewing parity, flowing fluids, and complete mob AI). It must be treated as an in-progress prototype. Textures and sounds are original procedural assets, not Mojang assets.
