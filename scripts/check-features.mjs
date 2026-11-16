import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const checks = [
  [
    "Three.js renderer",
    "import * as THREE from \"three\""
  ],
  [
    "Voxel world and chunks",
    "class VoxelWorld"
  ],
  [
    "Overworld structures",
    "buildVillageAt"
  ],
  [
    "Stronghold and End cities",
    "buildEndCityAt"
  ],
  [
    "Nether and End dimensions",
    "switchDimension"
  ],
  [
    "Survival hunger and exhaustion",
    "Истощение"
  ],
  [
    "Health, air and fire",
    "air: 300"
  ],
  [
    "Crafting recipes",
    "const RECIPES ="
  ],
  [
    "Furnace and smelting",
    "furnace"
  ],
  [
    "Villagers and trades",
    "villager_blacksmith"
  ],
  [
    "Inventory cursor interactions",
    "function bindInventoryCursor"
  ],
  [
    "Armor slots",
    "bindArmorCursor"
  ],
  [
    "Elytra gliding",
    "gliding"
  ],
  [
    "Creative inventory",
    "creative-search"
  ],
  [
    "Mob spawning and combat",
    "function spawnMob"
  ],
  [
    "Bosses and hostile projectiles",
    "hostile_projectile"
  ],
  [
    "Ender pearl and trident",
    "function launchEnderPearl"
  ],
  [
    "Commands and teleport",
    "case \"tp\""
  ],
  [
    "Multiplayer room creation/join",
    "async function joinMultiplayerRoom"
  ],
  [
    "Multiplayer players and chat",
    "function applyPlayersSnapshot"
  ],
  [
    "Multiplayer block synchronization",
    "/blocks`"
  ],
  [
    "Multiplayer shared world state",
    "/state`"
  ]
];
const missing = checks.filter(([, anchor]) => !source.includes(anchor)).map(([name]) => name);

if (missing.length) {
  console.error("Feature regression detected:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Feature baseline OK: ${checks.length} existing systems are present.`);
}
