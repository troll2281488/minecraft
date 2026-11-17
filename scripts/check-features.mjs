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
    "High-detail pixel texture pipeline",
    "c.width = 32"
  ],
  [
    "Color-managed pixel rendering",
    "renderer.outputColorSpace = THREE.SRGBColorSpace"
  ],
  [
    "Enhanced voxel lighting and shadows",
    "new THREE.HemisphereLight"
  ],
  [
    "Layered voxel clouds",
    "cloudShadeMat"
  ],
  [
    "Vanilla block texture loader",
    "function loadVanillaBlockTextures"
  ],
  [
    "Vanilla destroy-stage crack overlays",
    "destroy_stage_"
  ],
  ["Pixel-art mob texture pipeline", "function getMobPixelTexture"],
  ["Enderman water behavior", "e.waterEscapeCooldown"],
  ["Enderman arrow immunity", 'target.type === "enderman"'],
  ["Flint and steel creeper ignition", "hitEnt.ignited = true"],
  ["XP command", 'case "xp"'],
  ["Time add command", 'if (a1 === "add")'],
  ["Setblock command", 'case "setblock"'],
  ["Fill command", 'case "fill"'],
  ["Entity kill command", 'a1 === "@e"'],
];
const missing = checks.filter(([, anchor]) => !source.includes(anchor)).map(([name]) => name);

if (missing.length) {
  console.error("Feature regression detected:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Feature baseline OK: ${checks.length} existing systems are present.`);
}
