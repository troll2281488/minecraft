import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
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
  ],
  [
    "Ancient debris and Nether gold ore generation",
    "B.ANCIENT_DEBRIS"
  ],
  [
    "Explosion resistance for ancient debris",
    "blastResistance: 1200"
  ],
  [
    "Creeper fuse and explosion",
    "e.fuse >= 1.45"
  ],
  [
    "TNT ignition",
    "Взорвался блок TNT"
  ],
  [
    "Multiplayer dropped item synchronization",
    "/drops`"
  ],
  [
    "Graphics quality presets",
    "btn-set-quality"
  ],
  [
    "Food cooking and survival",
    "raw_chicken: \"cooked_chicken\""
  ],
  [
    "Minecraft 1.21 mace and smash attack",
    "smashBonus"
  ],
  [
    "Breeze rod and heavy core crafting",
    "heavy_core: 1, breeze_rod: 1, stick: 1"
  ],
  [
    "Throwable wind charge",
    "wind_charge_projectile"
  ],
  [
    "Breeze mob model and AI",
    'breeze: { name: "Бриз"'
  ],
  [
    "Breeze wind charge attacks",
    'launchHostileProjectile(e, "wind_charge")'
  ]
];
const missing = checks.filter(([, anchor]) => !source.includes(anchor)).map(([name]) => name);

if (missing.length) {
  console.error("Feature regression detected:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Feature baseline OK: ${checks.length} existing systems are present.`);
}
