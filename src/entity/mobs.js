import { ITEMS, ItemStack } from '../world/item.js';
import { BLOCKS } from '../world/block.js';
import { SPAWNER_MOB_TYPES, spawnerMobType, spawnerPlayerInRange, countSpawnerMobs, nextSpawnerDelay, spawnerSpawnPosition } from './spawners.js';
import { experienceForMob, experienceForFishing, experienceForBreeding, splitExperienceIntoOrbs, mergeExperienceOrbState, isExperienceOrbHazard } from './experience.js';
import { TerrainGenerator, villageCandidateForCell } from '../world/gen/terrain.js';
import { createVillagerProfile } from './villager_trades.js';
import { drawPower, canFire } from '../game/bow.js';
import { aimVector, createArrow, stepArrow } from './arrows.js';
import { beginCrossbowLoad as beginCrossbowLoadData, finishCrossbowLoad, crossbowShotPlan, consumeCrossbowCharge } from '../game/crossbow.js';
import { tickBeeForaging } from '../game/bee_hives.js';
import { weatherAt } from '../game/weather.js';
import { channelingLightningEffect } from '../game/trident.js';
import { fireworkBlastImpacts, creeperBlastImpacts, FIREWORK_BLAST } from '../game/firework_explosion.js';
import { enchantmentDamageBonus, enchantmentLevel, repairWithMending, fishingWaitTicks, protectionDamageMultiplier, unbreakingDamage } from '../game/enchantments.js';

/**
 * Lightweight voxel creature simulation. Mobs use deterministic game ticks,
 * ground-following movement and simple species-specific behaviour.
 */
/**
 * Per-species combat and awareness tuning. These are game-only creature rules:
 * each hostile has a readable counterplay window instead of sharing one generic AI.
 */
/** Pick a walkable local detour that still trends toward the target. */
/** Java sunlight ignition: zombies (including zombie villagers), skeletons and strays; husks and wither skeletons are immune. */
export function shouldBurnInSunlight(type, daylight, skyExposed) {
  return daylight > 0.82 && skyExposed &&
    ['zombie', 'zombie_villager', 'skeleton', 'stray'].includes(type);
}

export function chooseMobDetourYaw(currentYaw, desiredYaw, options) {
  let bestYaw = null;
  let bestScore = Infinity;
  for (const option of options ?? []) {
    if (!option?.walkable || !Number.isFinite(option.yaw) || !Number.isFinite(option.distance)) continue;
    const turn = Math.abs(Math.atan2(
      Math.sin(option.yaw - currentYaw),
      Math.cos(option.yaw - currentYaw),
    ));
    const alignment = Math.abs(Math.atan2(
      Math.sin(option.yaw - desiredYaw),
      Math.cos(option.yaw - desiredYaw),
    ));
    const score = option.distance + turn * 0.18 + alignment * 0.12;
    if (score < bestScore) {
      bestScore = score;
      bestYaw = option.yaw;
    }
  }
  return bestYaw;
}

export const MOB_AI_PROFILES = Object.freeze({
  zombie: Object.freeze({ detectionRange: 14, speedMultiplier: 1, meleeRange: 1.35, attackCooldown: 40, damage: 1, role: 'pursuer' }),
  skeleton: Object.freeze({ detectionRange: 20, speedMultiplier: 0.82, rangedRange: 14, preferredRange: 8, attackCooldown: 55, damage: 2, role: 'ranged' }),
  stray: Object.freeze({ detectionRange: 20, speedMultiplier: 0.82, rangedRange: 14, preferredRange: 8, attackCooldown: 55, damage: 2, role: 'chilling-ranged' }),
  creeper: Object.freeze({ detectionRange: 12, speedMultiplier: 0.9, fuseRange: 3, fuseTicks: 30, blastRange: 4, role: 'exploder' }),
  spider: Object.freeze({ detectionRange: 16, speedMultiplier: 1.48, meleeRange: 1.55, attackCooldown: 28, damage: 2, role: 'ambusher' }),
  cave_spider: Object.freeze({ detectionRange: 16, speedMultiplier: 1.35, meleeRange: 1.5, attackCooldown: 30, damage: 2, role: 'ambusher' }),
  enderman: Object.freeze({ detectionRange: 16, speedMultiplier: 1.25, meleeRange: 1.5, attackCooldown: 30, damage: 4, role: 'stalker' }),
  husk: Object.freeze({ detectionRange: 14, speedMultiplier: 1, meleeRange: 1.35, attackCooldown: 40, damage: 1, role: 'pursuer' }),
  zombie_villager: Object.freeze({ detectionRange: 14, speedMultiplier: 1, meleeRange: 1.35, attackCooldown: 40, damage: 1, role: 'pursuer' }),
  wither_skeleton: Object.freeze({ detectionRange: 16, speedMultiplier: 1.08, meleeRange: 1.5, attackCooldown: 36, damage: 3, role: 'pursuer' }),
  silverfish: Object.freeze({ detectionRange: 12, speedMultiplier: 1.25, meleeRange: 1.2, attackCooldown: 24, damage: 1, role: 'ambusher' }),
  endermite: Object.freeze({ detectionRange: 12, speedMultiplier: 1.3, meleeRange: 1.2, attackCooldown: 24, damage: 1, role: 'ambusher' }),
  slime: Object.freeze({ detectionRange: 12, speedMultiplier: 0.9, meleeRange: 1.5, attackCooldown: 32, damage: 2, role: 'jumper' }),
  magma_cube: Object.freeze({ detectionRange: 12, speedMultiplier: 1, meleeRange: 1.5, attackCooldown: 32, damage: 3, role: 'jumper' }),
  vex: Object.freeze({ detectionRange: 18, speedMultiplier: 1.5, meleeRange: 1.3, attackCooldown: 24, damage: 2, role: 'flying-ambusher' }),
  vindicator: Object.freeze({ detectionRange: 18, speedMultiplier: 1.12, meleeRange: 1.5, attackCooldown: 32, damage: 3, role: 'pursuer' }),
  evoker: Object.freeze({ detectionRange: 18, speedMultiplier: 0.78, rangedRange: 12, preferredRange: 8, attackCooldown: 70, damage: 3, role: 'caster' }),
  witch: Object.freeze({ detectionRange: 18, speedMultiplier: 0.78, rangedRange: 12, preferredRange: 8, attackCooldown: 65, damage: 2, role: 'caster' }),
  blaze: Object.freeze({ detectionRange: 20, speedMultiplier: 0.9, rangedRange: 16, preferredRange: 10, attackCooldown: 45, damage: 3, role: 'flying-ranged' }),
  ghast: Object.freeze({ detectionRange: 24, speedMultiplier: 0.55, rangedRange: 20, preferredRange: 14, attackCooldown: 80, damage: 4, role: 'flying-ranged' }),
  guardian: Object.freeze({ detectionRange: 18, speedMultiplier: 0.8, rangedRange: 14, preferredRange: 9, attackCooldown: 55, damage: 2, role: 'aquatic-ranged' }),
  elder_guardian: Object.freeze({ detectionRange: 22, speedMultiplier: 0.65, rangedRange: 16, preferredRange: 10, attackCooldown: 60, damage: 3, role: 'aquatic-ranged' }),
  wither: Object.freeze({ detectionRange: 24, speedMultiplier: 0.85, rangedRange: 18, preferredRange: 10, attackCooldown: 45, damage: 4, role: 'boss' }),
  warden: Object.freeze({ detectionRange: 20, speedMultiplier: 0.72, meleeRange: 2.1, attackCooldown: 50, damage: 6, role: 'pursuer' }),
});

const LEASHABLE_MOB_TYPES = new Set(['cow', 'pig', 'sheep', 'chicken', 'mooshroom', 'rabbit', 'wolf', 'horse', 'bee', 'goat']);

export function nextGoatRamState(mob, distance) {
  const cooldown = Math.max(0, (mob?.ramCooldown || 0) - 1);
  const previousWindup = Math.max(0, mob?.ramWindup || 0);
  let windup = Math.max(0, previousWindup - 1);
  const previousActive = Math.max(0, mob?.ramTicks || 0);
  let active = Math.max(0, previousActive - 1);
  if (!mob || mob.type !== 'goat') return { cooldown, windup, active, start: false };
  if (previousWindup > 0 && windup === 0) active = 12;
  if (previousActive > 0 && active === 0) cooldown = Math.max(cooldown, 600);
  const start = previousWindup === 0 && active === 0 && cooldown === 0 && distance >= 4 && distance <= 8;
  if (start) windup = 30;
  return { cooldown, windup, active, start };
}

export function canSaddlePig(mob) {
  return mob?.type === 'pig' && mob.saddled !== true;
}

export function pigBoostImpulse(yaw, magnitude = 0.22) {
  if (!Number.isFinite(yaw) || !Number.isFinite(magnitude) || magnitude <= 0) return { x: 0, z: 0 };
  return { x: -Math.sin(yaw) * magnitude, z: Math.cos(yaw) * magnitude };
}

export function canLeadMob(mob) {
  return !!mob && LEASHABLE_MOB_TYPES.has(mob.type) && !mob.leashHolder;
}

export function attachMobLead(mob, owner = 'player') {
  if (!canLeadMob(mob) || typeof owner !== 'string' || !owner || owner.length > 32) return false;
  mob.leashHolder = owner;
  return true;
}

export function detachMobLead(mob, owner = 'player') {
  if (!mob || mob.leashHolder !== owner) return false;
  delete mob.leashHolder;
  return true;
}

export const HORSE_FOOD_EFFECTS = Object.freeze({
  'mc:sugar': Object.freeze({ heal: 1, growth: 0.10 }),
  'mc:wheat': Object.freeze({ heal: 2, growth: 0.20 }),
  'mc:apple': Object.freeze({ heal: 3, growth: 0.30 }),
  'mc:golden_carrot': Object.freeze({ heal: 4, growth: 0.50, breeding: true }),
  'mc:golden_apple': Object.freeze({ heal: 10, growth: 0.50, breeding: true }),
  'mc:enchanted_golden_apple': Object.freeze({ heal: 10, growth: 0.50, breeding: true }),
  'mc:hay_block': Object.freeze({ heal: 20, growth: 0.90 }),
});

export function horseFoodEffect(itemId) {
  return HORSE_FOOD_EFFECTS[itemId] || null;
}
export const BREEDING_FOODS = Object.freeze({
  cow: Object.freeze(['mc:wheat']), sheep: Object.freeze(['mc:wheat']),
  pig: Object.freeze(['mc:carrot', 'mc:potato']),
  chicken: Object.freeze(['mc:wheat_seeds', 'mc:pumpkin_seeds', 'mc:melon_seeds']),
  rabbit: Object.freeze(['mc:carrot', 'mc:golden_carrot', 'mc:dandelion']),
  horse: Object.freeze(['mc:golden_carrot', 'mc:golden_apple']),
  goat: Object.freeze(['mc:wheat']),
});

export function canBreedAnimalWith(type, itemId) {
  return !!BREEDING_FOODS[type]?.includes(itemId);
}
export function tickChickenEggLaying(mob, random = Math.random) {
  if (!mob || mob.type !== 'chicken') return false;
  if (!Number.isFinite(mob.eggLayTicks)) mob.eggLayTicks = 6000 + Math.floor(random() * 6001);
  mob.eggLayTicks = Math.max(0, mob.eggLayTicks - 1);
  if (mob.eggLayTicks > 0) return false;
  mob.eggLayTicks = 6000 + Math.floor(random() * 6001);
  return true;
}

export function tickSheepGrassRegrowth(mob, world, random = Math.random) {
  if (!mob || mob.type !== 'sheep' || !mob.sheared || !world) return null;
  if (!Number.isFinite(mob.grazeTicks)) mob.grazeTicks = 600 + Math.floor(random() * 601);
  mob.grazeTicks = Math.max(0, mob.grazeTicks - 1);
  if (mob.grazeTicks > 0) return null;
  const x = Math.floor(mob.x), y = Math.floor(mob.y - 1), z = Math.floor(mob.z);
  const below = world.getBlock(x, y, z);
  if (below?.block?.id === 'mc:grass_block') {
    const dirt = BLOCKS.get('mc:dirt')?.defaultState;
    if (dirt && world.setBlock(x, y, z, dirt)) {
      mob.sheared = false;
      mob.grazeTicks = 600 + Math.floor(random() * 601);
      return { x, y, z, state: dirt };
    }
  }
  mob.grazeTicks = 120;
  return null;
}
export const MOB_TYPES_112 = Object.freeze([
  'bat','bee','blaze','cave_spider','chicken','cow','creeper','donkey','elder_guardian',
  'ender_dragon','enderman','endermite','evoker','ghast','guardian','horse','husk','illusioner',
  'llama','magma_cube','mooshroom','mule','ocelot','parrot','pig','polar_bear',
  'rabbit','sheep','shulker','silverfish','skeleton','skeleton_horse','slime',
  'snow_golem','spider','squid','stray','vex','villager','vindicator','witch',
  'wither','wither_skeleton','wolf','zombie','zombie_horse','zombie_villager','goat',
  'allay','axolotl','frog','tadpole','warden',
]);

export function shearSheep(mob, random = Math.random) {
  if (!mob || mob.type !== 'sheep' || mob.sheared) return [];
  mob.sheared = true;
  const count = 1 + Math.floor(random() * 3);
  return [{ id: 'mc:white_wool', count }];
}

export function shearMooshroom(mob) {
  if (!mob || mob.type !== 'mooshroom') return [];
  mob.type = 'cow';
  mob.sheared = true;
  return Array.from({ length: 5 }, () => ({ id: 'mc:red_mushroom', count: 1 }));
}

const FISHING_LOOT = Object.freeze({
  // Java junk weights; the duplicate boots entry represents the damaged
  // and undamaged leather-boots outcomes (durability metadata is not modelled).
  junk: Object.freeze([
    ['mc:lily_pad', 17], ['mc:leather_boots', 10], ['mc:leather_boots', 10],
    ['mc:rotten_flesh', 10], ['mc:stick', 5], ['mc:string', 5],
    ['mc:water_bottle', 10], ['mc:bone', 10], ['mc:ink_sac', 10],
    ['mc:tripwire_hook', 10],
  ]),
  treasure: Object.freeze([
    'mc:bow', 'mc:enchanted_book', 'mc:fishing_rod',
    'mc:name_tag', 'mc:nautilus_shell', 'mc:saddle',
  ]),
});

/**
 * Java 1.19 fishing loot categories (unenchanted rod, open water):
 * 85% fish, 10% junk and 5% treasure. Fish are selected from their
 * category with the vanilla relative weights. The injected RNG keeps this
 * deterministic for regression tests.
 */
export function rollFishingCatch(random = Math.random, rodStack = null) {
  const categoryRoll = random();
  const luck = enchantmentLevel(rodStack, 'luck_of_the_sea');
  const junkBoundary = 0.95 - luck * 0.025;
  if (categoryRoll < 0.85) {
    const fishRoll = random();
    if (fishRoll < 0.60) return { id: 'mc:raw_cod', count: 1 };
    if (fishRoll < 0.85) return { id: 'mc:raw_salmon', count: 1 };
    if (fishRoll < 0.98) return { id: 'mc:pufferfish', count: 1 };
    return { id: 'mc:tropical_fish', count: 1 };
  }
  if (categoryRoll < junkBoundary) {
    const totalWeight = FISHING_LOOT.junk.reduce((sum, entry) => sum + entry[1], 0);
    let ticket = random() * totalWeight;
    for (const [id, weight] of FISHING_LOOT.junk) {
      ticket -= weight;
      if (ticket < 0) return { id, count: 1 };
    }
    return { id: FISHING_LOOT.junk[FISHING_LOOT.junk.length - 1][0], count: 1 };
  }
  const index = Math.min(FISHING_LOOT.treasure.length - 1, Math.floor(random() * FISHING_LOOT.treasure.length));
  return { id: FISHING_LOOT.treasure[index], count: 1 };
}

/** Apply the Java 1.12 armour formula and return health damage after reduction. */
export function calculateArmorDamage(damage, armorPoints = 0, toughness = 0) {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  const effectiveArmor = Math.min(20, Math.max(
    armorPoints / 5,
    armorPoints - damage / (2 + toughness / 4),
  ));
  return damage * (1 - effectiveArmor / 25);
}

export function shieldBlocksAttack(player, sourceX, sourceZ, active = true) {
  if (!active || !player || !Number.isFinite(sourceX) || !Number.isFinite(sourceZ)) return false;
  const dx = sourceX - player.x;
  const dz = sourceZ - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return false;
  const yaw = (player.yaw || 0) * Math.PI / 180;
  const facingX = -Math.sin(yaw);
  const facingZ = Math.cos(yaw);
  // Shields cover a 120-degree frontal arc; attacks from behind still connect.
  return (dx * facingX + dz * facingZ) / distance >= 0.5;
}

export function calculateHorseArmorDamage(damage, material = null) {
  const points = ({ leather: 3, iron: 5, golden: 7, diamond: 11 })[material] || 0;
  return calculateArmorDamage(damage, points, 0);
}

export function rollMobDrops(type, random = Math.random, lootingLevel = 0) {
  const looting = Math.max(0, Math.min(3, Math.floor(lootingLevel) || 0));
  const amount = (min, max) => min + Math.floor(random() * (max - min + 1)) + (looting ? Math.floor(random() * (looting + 1)) : 0);
  if (type === 'pig') return [{ id: 'mc:raw_porkchop', count: amount(1, 3) }];
  if (type === 'cow') return [
    { id: 'mc:raw_beef', count: amount(1, 3) },
    ...(random() < 0.5 ? [{ id: 'mc:leather', count: amount(1, 2) }] : []),
  ];
  if (type === 'chicken') return [
    { id: 'mc:raw_chicken', count: amount(1, 3) },
    { id: 'mc:feather', count: amount(0, 2) },
  ];
  if (type === 'sheep') return [{ id: 'mc:raw_mutton', count: amount(1, 2) }];
  // Java 1.19 frogs occasionally drop a slimeball; tadpoles and allays have no item drops.
  if (type === 'frog') return [{ id: 'mc:slime_ball', count: amount(0, 1) }].filter((drop) => drop.count > 0);
  if (type === 'rabbit') return [{ id: 'mc:raw_rabbit', count: amount(1, 1) }, ...(random() < 0.5 ? [{ id: 'mc:rabbit_hide', count: 1 }] : [])];
  if (type === 'mooshroom') return [{ id: 'mc:raw_beef', count: amount(1, 3) }, { id: 'mc:leather', count: amount(0, 2) }];
  if (type === 'skeleton' || type === 'stray') return [{ id: 'mc:bone', count: amount(0, 2) }];
  if (type === 'creeper') return [{ id: 'mc:gunpowder', count: amount(0, 2) }];
  if (type === 'spider' || type === 'cave_spider') return [{ id: 'mc:string', count: amount(0, 2) }];
  if (type === 'enderman') return [{ id: 'mc:ender_pearl', count: amount(0, 1) }];
  if (type === 'slime') return [{ id: 'mc:slime_ball', count: amount(0, 2) }];
  if (type === 'zombie') {
    const count = amount(0, 2);
    const drops = count ? [{ id: 'mc:rotten_flesh', count }] : [];
    // Rare carrot/potato drops make both crops obtainable before farming exists.
    if (random() < 0.025 + looting * 0.01) drops.push({ id: random() < 0.5 ? 'mc:carrot' : 'mc:potato', count: 1 });
    return drops;
  }
  return [];
}

export class MobSystem {
  constructor(game) {
    this.game = game;
    this.mobs = [];
    this.arrows = [];
    this.blockParticles = [];
    this.bowDrawStart = null;
    this.crossbowLoadStart = null;
    this.tridentThrowStart = null;
    this.droppedItems = [];
    this.experienceOrbs = [];
    this.experiencePickupCooldown = 0;
    this.spawnerStates = new Map();
    this.spawnerScanTicks = 0;
    this.spawnTicks = 0;
    this.nextId = 1;
    this.attackCooldown = 0;
    this.fishing = null;
    this.villageCheckTicks = 0;
    this.villageGenerator = null;
    this.populatedVillages = new Set();
    this.netherFortressWave = false;
  }

  reset() {
    this.mobs.length = 0;
    this.arrows.length = 0;
    this.blockParticles.length = 0;
    this.bowDrawStart = null;
    this.crossbowLoadStart = null;
    this.tridentThrowStart = null;
    this.droppedItems.length = 0;
    this.experienceOrbs.length = 0;
    this.experiencePickupCooldown = 0;
    this.spawnerStates.clear();
    this.spawnerScanTicks = 0;
    this.spawnTicks = 0;
    this.nextId = 1;
    this.fishing = null;
    this.villageCheckTicks = 0;
    this.villageGenerator = null;
    this.populatedVillages.clear();
    this.netherFortressWave = false;
  }

  detonateFireworkRocket(x, y, z) {
    const center = { x, y, z };
    const impacts = fireworkBlastImpacts(this.mobs, center);
    for (const impact of impacts) {
      const mob = impact.mob;
      const previousHealth = mob.health;
      mob.health = Math.max(0, mob.health - impact.damage);
      mob.knockbackX = (mob.knockbackX || 0) + impact.knockbackX;
      mob.knockbackZ = (mob.knockbackZ || 0) + impact.knockbackZ;
      mob.vy = (mob.vy || 0) + impact.knockbackY;
      mob.pauseTicks = 0;
      mob.hurtTicks = 10;
      mob.anim ||= {};
      mob.anim.hurt = 1;
      if (previousHealth > 0 && mob.health <= 0 &&
          ['zombie','skeleton','stray','creeper','spider','enderman','witch','slime','magma_cube','ghast','blaze','wither_skeleton','drowned','phantom','guardian','elder_guardian','silverfish','cave_spider'].includes(mob.type)) {
        this.game.player?.recordAdvancementEvent?.('killed_hostile', this.game.tickCount || 0);
      }
    }

    const player = this.game.player;
    if (player?.gamemode === 'survival') {
      const dx = player.x - x;
      const dy = player.eyeY - y;
      const dz = player.z - z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < FIREWORK_BLAST.RADIUS) {
        const falloff = 1 - distance / FIREWORK_BLAST.RADIUS;
        const damage = Math.max(1, Math.ceil(FIREWORK_BLAST.MAX_DAMAGE * falloff));
        this._damagePlayer(damage, x, z);
        const horizontal = Math.hypot(dx, dz);
        const impulse = FIREWORK_BLAST.KNOCKBACK * falloff;
        if (horizontal > 0.0001) {
          player.vx += dx / horizontal * impulse;
          player.vz += dz / horizontal * impulse;
        }
        player.vy = (player.vy || 0) + 0.16 * falloff;
      }
    }
    this.spawnBlockParticles(x, y, z, 'mc:firework');
    this.game.sounds?.play('explode');
    return impacts.length;
  }

  spawnBlockParticles(x, y, z, blockId = '') {
    const mode = this.game.particlesMode || 'all';
    if (mode === 'off') return;
    const count = mode === 'reduced' ? 3 : 10;
    const palette = blockId.includes('grass') ? [0.35, 0.58, 0.24, 1]
      : blockId.includes('dirt') || blockId.includes('mud') ? [0.43, 0.29, 0.17, 1]
      : blockId.includes('sand') ? [0.78, 0.70, 0.48, 1]
      : blockId.includes('ore') ? [0.48, 0.47, 0.43, 1]
      : blockId.includes('wood') || blockId.includes('log') ? [0.42, 0.29, 0.16, 1]
      : [0.55, 0.55, 0.55, 1];
    for (let i = 0; i < count; i++) {
      this.blockParticles.push({
        x: x + 0.2 + Math.random() * 0.6,
        y: y + 0.2 + Math.random() * 0.6,
        z: z + 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 0.16,
        vy: Math.random() * 0.12 + 0.025,
        vz: (Math.random() - 0.5) * 0.16,
        life: 18 + Math.floor(Math.random() * 10),
        color: palette,
      });
    }
  }

  _tickBlockParticles() {
    for (let i = this.blockParticles.length - 1; i >= 0; i--) {
      const p = this.blockParticles[i];
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      p.vy -= 0.012;
      p.vx *= 0.94; p.vz *= 0.94;
      p.life--;
      if (p.life <= 0) this.blockParticles.splice(i, 1);
    }
  }


  beginTridentThrow() {
    const held = this.game.inventory?.held;
    if (held?.item?.id !== 'mc:trident' || !['survival', 'creative'].includes(this.game.player?.gamemode)) return false;
    this.tridentThrowStart = this.game.tickCount || 0;
    this.game.ui?.toast('Готовлю трезубец…', { duration: 650 });
    return true;
  }

  releaseTridentThrow() {
    if (this.tridentThrowStart === null) return false;
    const started = this.tridentThrowStart;
    this.tridentThrowStart = null;
    const held = this.game.inventory?.held;
    if (held?.item?.id !== 'mc:trident') return true;
    const chargedTicks = Math.max(0, (this.game.tickCount || 0) - started);
    if (chargedTicks < 10) return true;
    const creative = this.game.player?.gamemode === 'creative';
    const player = this.game.player;
    const direction = aimVector(player.yaw, player.pitch);
    const trident = createArrow(
      player.x + direction[0] * 0.55, player.eyeY + direction[1] * 0.55,
      player.z + direction[2] * 0.55, direction, 0.9,
    );
    trident.isTrident = true;
    trident.damage = 8;
    trident.vx = direction[0] * 2.5;
    trident.vy = direction[1] * 2.5;
    trident.vz = direction[2] * 2.5;
    trident.loyaltyLevel = enchantmentLevel(held, 'loyalty');
    trident.impalingLevel = enchantmentLevel(held, 'impaling');
    trident.channeling = enchantmentLevel(held, 'channeling') > 0;
    this.arrows.push(trident);
    const award = player.recordAdvancementEvent?.('threw_trident', this.game.tickCount || 0);
    if (award?.completed) this.game.ui?.toast('Достижение: A Throwaway Joke');
    if (!creative) this.game.inventory.damageHeld(1);
    const riptide = enchantmentLevel(held, 'riptide');
    if (riptide > 0 && (player.inWater || this.game.world?.isRainingAt?.(player.x, player.y, player.z))) {
      const impulse = 0.6 + riptide * 0.35;
      player.vx += direction[0] * impulse;
      player.vy += direction[1] * impulse;
      player.vz += direction[2] * impulse;
    }
    this.game.sounds?.play('bow');
    this.game.ui?.toast('Трезубец брошен');
    return true;
  }

  beginCrossbowLoad() {
    const held = this.game.inventory?.held;
    if (held?.item?.id !== 'mc:crossbow' || !['survival', 'creative'].includes(this.game.player?.gamemode)) return false;
    const tick = this.game.tickCount || 0;
    const data = beginCrossbowLoadData(held, tick);
    if (!data) return false;
    held.data = data;
    this.crossbowLoadStart = tick;
    this.game.ui?.toast('Заряжаю арбалет…', { duration: 700 });
    return true;
  }

  releaseCrossbowLoad() {
    if (this.crossbowLoadStart === null) return false;
    const held = this.game.inventory?.held;
    const tick = this.game.tickCount || 0;
    const started = this.crossbowLoadStart;
    this.crossbowLoadStart = null;
    if (held?.item?.id !== 'mc:crossbow') return true;
    const quickCharge = enchantmentLevel(held, 'quick_charge');
    const ammoId = this.game.player?.gamemode === 'creative' ? 'mc:arrow' : (this.game.inventory?.countOf('mc:arrow') > 0 ? 'mc:arrow' : (this.game.inventory?.countOf('mc:firework_rocket') > 0 ? 'mc:firework_rocket' : null));
    const loaded = ammoId ? finishCrossbowLoad(held.data, tick, ammoId, quickCharge) : null;
    if (!loaded) {
      held.data = { ...(held.data || {}), loadingSince: null, charged: false, chargedProjectile: null };
      if (!ammoId) this.game.ui?.toast('Для арбалета нужны стрелы или ракеты!', { error: true });
      return true;
    }
    const inventory = this.game.inventory;
    const creative = this.game.player?.gamemode === 'creative';
    if (!creative && inventory.remove(ammoId, 1) !== 1) {
      held.data = { ...loaded, charged: false, chargedProjectile: null };
      this.game.ui?.toast('Для арбалета нужны стрелы или ракеты!', { error: true });
      return true;
    }
    held.data = loaded;
    const multishot = enchantmentLevel(held, 'multishot');
    const piercing = enchantmentLevel(held, 'piercing');
    const shots = crossbowShotPlan(loaded, multishot, piercing) || [];
    const player = this.game.player;
    for (const shot of shots) {
      const direction = aimVector(player.yaw + shot.yawOffsetDeg, player.pitch);
      const arrow = createArrow(player.x + direction[0] * 0.45, player.eyeY + direction[1] * 0.45, player.z + direction[2] * 0.45, direction, 1);
      arrow.damage = shot.damage;
      arrow.piercingLevel = shot.piercingLevel;
      arrow.isFireworkRocket = shot.ammoId === 'mc:firework_rocket';
      this.arrows.push(arrow);
    }
    held.data = consumeCrossbowCharge(loaded);
    if (!creative) inventory.damageHeld(1);
    this.game.sounds?.play('bow');
    const award = this.game.player?.recordAdvancementEvent?.('shot_crossbow', tick);
    if (award?.completed) this.game.ui?.toast("Достижение: Ol' Betsy");
    this.game.ui?.toast(multishot > 0 ? 'Арбалет: тройной выстрел' : 'Арбалет выстрелил');
    return true;
  }

  beginBowDraw() {
    const held = this.game.inventory?.held;
    if (held?.item?.id !== 'mc:bow' || !['survival', 'creative'].includes(this.game.player?.gamemode)) return false;
    this.bowDrawStart = this.game.tickCount || 0;
    return true;
  }

  releaseBow() {
    if (this.bowDrawStart === null) return false;
    const held = this.game.inventory?.held;
    const ticks = Math.max(0, (this.game.tickCount || 0) - this.bowDrawStart);
    this.bowDrawStart = null;
    if (held?.item?.id !== 'mc:bow' || !canFire(ticks)) return true;
    const creative = this.game.player?.gamemode === 'creative';
    const inventory = this.game.inventory;
    const infinity = enchantmentLevel(held, 'infinity') > 0;
    if (!creative && inventory.countOf('mc:arrow') < 1) {
      this.game.ui?.toast('Нужны стрелы!', { error: true });
      return true;
    }
    if (!creative && !infinity) inventory.remove('mc:arrow', 1);
    const player = this.game.player;
    const direction = aimVector(player.yaw, player.pitch);
    const draw = drawPower(ticks);
    const powerLevel = enchantmentLevel(held, 'power');
    const arrow = createArrow(
      player.x + direction[0] * 0.45,
      player.eyeY + direction[1] * 0.45,
      player.z + direction[2] * 0.45,
      direction, draw,
    );
    // Java Power adds 25% of base damage per level, plus a small flat bonus.
    arrow.damage += powerLevel > 0 ? Math.floor(arrow.damage * (0.25 * powerLevel) + 0.5) : 0;
    arrow.punchLevel = enchantmentLevel(held, 'punch');
    arrow.flame = enchantmentLevel(held, 'flame') > 0;
    this.arrows.push(arrow);
    if (!creative) inventory.damageHeld(1);
    this.game.sounds?.play('bow');
    return true;
  }

  _tickArrows() {
    const world = this.game.world;
    const player = this.game.player;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      if (arrow.stuck) {
        arrow.age++;
        if (Math.hypot(player.x - arrow.x, player.y - arrow.y, player.z - arrow.z) < 1.15 && arrow.age > 12) {
          const left = this.game.inventory?.addItem('mc:arrow', 1) ?? 1;
          if (left === 0) { this.arrows.splice(i, 1); this.game.ui?.toast('Стрела поднята'); continue; }
        }
        if (arrow.age > 1200) this.arrows.splice(i, 1);
        continue;
      }
      if (arrow.stuckMobId) {
        arrow.age++;
        const target = this.mobs.find((mob) => mob.id === arrow.stuckMobId);
        if (target) { arrow.x = target.x + (arrow.offsetX || 0); arrow.y = target.y + (arrow.offsetY || 0); arrow.z = target.z + (arrow.offsetZ || 0); }
        if (!target) { arrow.stuckMobId = null; arrow.stuck = true; arrow.vx = arrow.vy = arrow.vz = 0; }
        if (arrow.age > 1200) this.arrows.splice(i, 1);
        continue;
      }
      if (arrow.isTrident && arrow.returning) {
        const dx = player.x - arrow.x, dy = player.eyeY - arrow.y, dz = player.z - arrow.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance < 0.8) { this.arrows.splice(i, 1); continue; }
        const speed = 0.85 + (arrow.loyaltyLevel || 0) * 0.18;
        arrow.vx = dx / distance * speed; arrow.vy = dy / distance * speed; arrow.vz = dz / distance * speed;
        arrow.x += arrow.vx; arrow.y += arrow.vy; arrow.z += arrow.vz;
        arrow.age++;
        if (arrow.age > 1200) this.arrows.splice(i, 1);
        continue;
      }
      if (arrow.isFireworkRocket) arrow.vy += 0.05;
      const result = stepArrow(arrow,
        (x, y, z) => world.getBlock(x, y, z).block.solid,
        this.mobs,
      );
      if (result.hit === 'mob' && result.mob) {
        if (arrow.isFireworkRocket) {
          this.detonateFireworkRocket(arrow.x, arrow.y, arrow.z);
          this.arrows.splice(i, 1);
          continue;
        }
        const mob = result.mob;
        const previousHealth = mob.health;
        const aquatic = ['guardian', 'elder_guardian', 'drowned', 'squid'].includes(mob.type);
        const impalingBonus = arrow.isTrident && aquatic ? Math.max(0, arrow.impalingLevel || 0) * 2.5 : 0;
        const hitDamage = arrow.damage + impalingBonus;
        const surfaceY = world.getHeight?.(Math.floor(mob.x), Math.floor(mob.z));
        const skyVisible = Number.isFinite(surfaceY) && surfaceY < Math.floor(mob.y + 1);
        const lightning = arrow.isTrident && arrow.channeling && world.dimension === 'overworld'
          ? channelingLightningEffect({ channeling: true, thunder: weatherAt(world.seed, world.time) === 'thunder', skyVisible, targetExposed: skyVisible, targetType: mob.type })
          : null;
        const totalDamage = hitDamage + (lightning?.damage || 0);
        mob.health = Math.max(0, mob.health - (mob.type === 'horse' ? calculateHorseArmorDamage(totalDamage, mob.horseArmor) : totalDamage));
        if (lightning) {
          mob.fireTicks = Math.max(mob.fireTicks || 0, lightning.fireTicks);
          if (lightning.chargedCreeper) mob.charged = true;
          if (lightning.transformTo && mob.health > 0) mob.type = lightning.transformTo;
          this.game.sounds?.play('thunder');
          this.spawnBlockParticles(mob.x, mob.y + 0.5, mob.z, 'mc:lightning');
          const channelAward = this.game.player?.recordAdvancementEvent?.('channelled_lightning', this.game.tickCount || 0);
          if (channelAward?.completed) this.game.ui?.toast('Достижение: Channeling');
          if (lightning.transformTo === 'witch' && mob.health > 0) {
            const witchAward = this.game.player?.recordAdvancementEvent?.('struck_villager_with_lightning', this.game.tickCount || 0);
            if (witchAward?.completed) this.game.ui?.toast('Достижение: Very Very Frightening');
          }
        }
        if (previousHealth > 0 && mob.health <= 0 && ['zombie','skeleton','stray','creeper','spider','enderman','witch','slime','magma_cube','ghast','blaze','wither_skeleton','drowned','phantom','guardian','elder_guardian','silverfish','cave_spider'].includes(mob.type)) this.game.player?.recordAdvancementEvent?.('killed_hostile', this.game.tickCount || 0);
        mob.hurtTicks = 10;
        mob.anim.hurt = 1;
        mob.playerDamageTicks = 100;
        if (arrow.flame) mob.fireTicks = Math.max(mob.fireTicks || 0, 100);
        if (arrow.punchLevel > 0) {
          const length = Math.max(0.001, Math.hypot(arrow.vx, arrow.vz));
          const impulse = 0.35 * arrow.punchLevel;
          mob.knockbackX = (arrow.vx / length) * impulse;
          mob.knockbackZ = (arrow.vz / length) * impulse;
          mob.pauseTicks = 0;
        }
        if (arrow.isTrident && arrow.loyaltyLevel > 0) { arrow.returning = true; continue; }
        if (arrow.isTrident) { this.arrows.splice(i, 1); continue; }
        if (arrow.piercingLevel > 0) {
          // Piercing arrows keep travelling and remember every hit entity so
          // they cannot repeatedly damage the same mob on later ticks.
          if (arrow.done) this.arrows.splice(i, 1);
          continue;
        }
        arrow.stuckMobId = mob.id;
        arrow.offsetX = arrow.x - mob.x; arrow.offsetY = arrow.y - mob.y; arrow.offsetZ = arrow.z - mob.z;
        arrow.done = false;
      } else if (result.hit === 'block') {
        if (arrow.isFireworkRocket) {
          this.detonateFireworkRocket(arrow.x, arrow.y, arrow.z);
          this.arrows.splice(i, 1);
          continue;
        }
        if (arrow.isTrident && arrow.loyaltyLevel > 0) { arrow.returning = true; continue; }
        if (arrow.isTrident) { this.arrows.splice(i, 1); continue; }
        arrow.stuck = true;
        arrow.stuckYaw = Math.atan2(-arrow.vx, arrow.vz);
        arrow.stuckPitch = Math.atan2(-arrow.vy, Math.hypot(arrow.vx, arrow.vz));
        arrow.vx = arrow.vy = arrow.vz = 0;
        arrow.done = false;
      }
      if (arrow.isFireworkRocket && arrow.age >= 20) {
        this.detonateFireworkRocket(arrow.x, arrow.y, arrow.z);
        this.arrows.splice(i, 1);
        continue;
      }
      if (arrow.done) this.arrows.splice(i, 1);
    }
  }

  /** Spawn a redstone-ejected item at a block face without borrowing player position. */
  spawnItemStackAt(stack, x, y, z, vx = 0, vy = 0.12, vz = 0) {
    if (!stack || stack.isEmpty) return false;
    const drop = { id: this.nextId++, stack: stack.clone(), x, y, z, vx, vy, vz, age: 0, pickupDelay: 10 };
    this.droppedItems.push(drop);
    this.game.multiplayer?.publishDroppedItem(drop);
    return true;
  }

  /** Toss a stack into the world with a small forward/upward impulse. */
  dropStack(stack) {
    if (!stack || stack.isEmpty || !this.game.player) return false;
    const p = this.game.player;
    const yaw = p.yaw * Math.PI / 180;
    const pitch = p.pitch * Math.PI / 180;
    const drop = {
      id: this.nextId++, stack: stack.clone(),
      x: p.x - Math.sin(yaw) * 0.65, y: p.y + p.eyeHeight - 0.25,
      z: p.z + Math.cos(yaw) * 0.65,
      vx: -Math.sin(yaw) * 0.12, vy: 0.12 - Math.sin(pitch) * 0.04,
      vz: Math.cos(yaw) * 0.12, age: 0, pickupDelay: 12,
    };
    this.droppedItems.push(drop);
    this.game.multiplayer?.publishDroppedItem(drop);
    return true;
  }

  _tickDroppedItems() {
    const p = this.game.player, world = this.game.world;
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const drop = this.droppedItems[i];
      drop.age++;
      if (drop.pickupDelay > 0) drop.pickupDelay--;
      drop.vy = Math.max(-0.35, drop.vy - 0.018);
      const nx = drop.x + drop.vx, ny = drop.y + drop.vy, nz = drop.z + drop.vz;
      const floor = world.getHeight(Math.floor(nx), Math.floor(nz)) + 1.08;
      if (ny <= floor) {
        drop.y = floor; drop.vy = 0; drop.vx *= 0.55; drop.vz *= 0.55;
        drop.resting = true;
      } else { drop.y = ny; drop.resting = false; }
      drop.x = nx; drop.z = nz;
      drop.vx *= 0.96; drop.vz *= 0.96;
      if (drop.resting) {
        drop.y = floor + 0.035 + Math.sin(drop.age * 0.09) * 0.018;
        drop.spin = (drop.spin || 0) + 0.055;
      }
      if (drop.pickupDelay <= 0 && !drop.claiming && Math.hypot(drop.x-p.x, drop.y-p.y-0.5, drop.z-p.z) < 1.35) {
        const multiplayer = this.game.multiplayer;
        if (drop.networkKey && multiplayer?.roomId) {
          drop.claiming = true;
          multiplayer.claimDroppedItem(drop).then((claimed) => {
            const index = this.droppedItems.indexOf(drop);
            if (index < 0) return;
            if (claimed) {
              this.game.inventory.add(drop.stack);
              this.game.ui.updateHotbar(this.game.inventory);
              this.droppedItems.splice(index, 1);
            } else {
              // A different player may have won the atomic pickup race.
              this.droppedItems.splice(index, 1);
            }
          }).catch(() => { drop.claiming = false; });
        } else {
          const leftover = this.game.inventory.add(drop.stack);
          if (leftover <= 0) this.droppedItems.splice(i, 1);
          else if (leftover < drop.stack.count) drop.stack.count = leftover;
        }
      }
      if (drop.age > 6000) this.droppedItems.splice(i, 1);
    }
  }

  /** Return a compact, JSON-safe snapshot for the local world save. */
  toJSON() {
    const entries = this.mobs.map((mob) => ({
      id: mob.id,
      type: mob.type,
      x: mob.x, y: mob.y, z: mob.z,
      yaw: mob.yaw,
      targetYaw: mob.targetYaw,
      health: mob.health,
      tamed: !!mob.tamed && ['wolf', 'horse'].includes(mob.type),
      sitting: mob.type === 'wolf' && !!mob.sitting,
      tameProgress: Number.isFinite(mob.tameProgress) ? Math.max(0, Math.min(3, mob.tameProgress)) : 0,
      saddled: ['horse', 'pig'].includes(mob.type) && !!mob.saddled,
      horseArmor: ['iron', 'golden', 'diamond'].includes(mob.horseArmor) ? mob.horseArmor : null,
      ramCooldown: mob.type === 'goat' ? Math.max(0, Math.min(600, mob.ramCooldown || 0)) : 0,
      ramWindup: mob.type === 'goat' ? Math.max(0, Math.min(30, mob.ramWindup || 0)) : 0,
      ramTicks: mob.type === 'goat' ? Math.max(0, Math.min(12, mob.ramTicks || 0)) : 0,
      hornsDropped: mob.type === 'goat' ? Math.max(0, Math.min(2, mob.hornsDropped || 0)) : 0,
      leashHolder: typeof mob.leashHolder === 'string' && mob.leashHolder.length <= 32 ? mob.leashHolder : null,
      beePollenTicks: Number.isFinite(mob.beePollenTicks) ? mob.beePollenTicks : 0,
      beeHiveWorkTicks: Number.isFinite(mob.beeHiveWorkTicks) ? mob.beeHiveWorkTicks : 0,
      beeSearchTicks: Number.isFinite(mob.beeSearchTicks) ? mob.beeSearchTicks : 0,
      sheared: !!mob.sheared, eggLayTicks: Number.isFinite(mob.eggLayTicks) ? mob.eggLayTicks : 0, grazeTicks: Number.isFinite(mob.grazeTicks) ? mob.grazeTicks : 0,
      fuseTicks: mob.fuseTicks || 0,
      walkPhase: mob.walkPhase || 0,
      ageTicks: Number.isFinite(mob.ageTicks) ? mob.ageTicks : 0,
      loveTicks: mob.loveTicks || 0,
      breedCooldown: mob.breedCooldown || 0,
      villageKey: mob.villageKey ?? null,
      villageSlot: Number.isInteger(mob.villageSlot) ? mob.villageSlot : null,
      villagerCareer: mob.villagerCareer ?? null,
      villagerProfession: mob.villagerProfession ?? null,
      villagerType: mob.villagerType ?? null,
      villagerSeed: Number.isSafeInteger(mob.villagerSeed) ? mob.villagerSeed : 1,
      villagerTier: mob.villagerTier ?? 1,
      villagerTradeCount: mob.villagerTradeCount ?? 0,
      villagerUsedOffers: mob.villagerUsedOffers ?? [],
      villagerOfferUses: mob.villagerOfferUses ?? {},
    }));
    for (const villageKey of this.populatedVillages) entries.push({ type: 'village_marker', villageKey });
    for (const orb of this.experienceOrbs) entries.push({
      type: 'experience_orb', id: orb.id, value: orb.value,
      x: orb.x, y: orb.y, z: orb.z, vx: orb.vx, vy: orb.vy, vz: orb.vz,
      age: orb.age, pickupDelay: orb.pickupDelay, count: orb.count || 1,
    });
    for (const state of [...this.spawnerStates.values()].slice(0, 256)) entries.push({
      type: 'mob_spawner_state', x: state.x, y: state.y, z: state.z,
      mobType: state.mobType, delay: state.delay,
    });
    return entries;
  }

  /** Restore only known, finite mob state; malformed save entries are ignored. */
  loadFrom(entries) {
    this.mobs.length = 0;
    this.experienceOrbs.length = 0;
    this.spawnerStates.clear();
    this.spawnerScanTicks = 0;
    this.populatedVillages = new Set();
    if (!Array.isArray(entries)) {
      this.nextId = 1;
      return;
    }
    for (const entry of entries) {
      if (entry?.type === 'experience_orb' &&
          Number.isSafeInteger(entry.value) && entry.value > 0 && entry.value <= 32767 &&
          ['x','y','z'].every((key) => Number.isFinite(entry[key])) &&
          Number.isSafeInteger(entry.age) && entry.age >= 0 && entry.age < 6000 &&
          this.experienceOrbs.length < 512) {
        this.experienceOrbs.push({
          id: Number.isSafeInteger(entry.id) && entry.id > 0 ? entry.id : this.experienceOrbs.length + 1,
          value: entry.value, x: entry.x, y: entry.y, z: entry.z,
          vx: Number.isFinite(entry.vx) ? entry.vx : 0,
          vy: Number.isFinite(entry.vy) ? entry.vy : 0,
          vz: Number.isFinite(entry.vz) ? entry.vz : 0,
          age: entry.age, pickupDelay: Number.isFinite(entry.pickupDelay) ? Math.max(0, Math.min(100, entry.pickupDelay)) : 0,
          count: Number.isSafeInteger(entry.count) ? Math.max(1, Math.min(32767, entry.count)) : 1,
        });
      }
      if (entry?.type === 'mob_spawner_state' &&
          Number.isSafeInteger(entry.x) && Number.isSafeInteger(entry.y) && Number.isSafeInteger(entry.z) &&
          entry.y >= -64 && entry.y <= 320 && SPAWNER_MOB_TYPES.includes(entry.mobType) &&
          Number.isSafeInteger(entry.delay) && entry.delay >= 0 && entry.delay <= 799 &&
          this.spawnerStates.size < 256) {
        const key = `${entry.x},${entry.y},${entry.z}`;
        this.spawnerStates.set(key, { x: entry.x, y: entry.y, z: entry.z, mobType: entry.mobType, delay: entry.delay });
      }
      if (entry?.type === 'village_marker' && typeof entry.villageKey === 'string' && entry.villageKey.length <= 48) {
        this.populatedVillages.add(entry.villageKey);
      }
    }
    const valid = entries.filter((mob) =>
      mob && MOB_TYPES_112.includes(mob.type) &&
      ['x', 'y', 'z', 'yaw', 'health'].every((key) => Number.isFinite(mob[key])) &&
      mob.y >= -64 && mob.y <= 320 && mob.health > 0 && mob.health <= 2048
    ).slice(0, 128);
    for (const mob of valid) {
      this.mobs.push({
        id: Number.isSafeInteger(mob.id) && mob.id > 0 ? mob.id : this.mobs.length + 1,
        type: mob.type,
        x: mob.x, y: mob.y, z: mob.z,
        yaw: mob.yaw,
        targetYaw: Number.isFinite(mob.targetYaw) ? mob.targetYaw : mob.yaw,
        speed: ['zombie','skeleton','stray','creeper','spider'].includes(mob.type) ? 0.035 : ['enderman','bee'].includes(mob.type) ? 0.045 : 0.018,
        thinkTicks: 0, attackTicks: 0,
        walkPhase: Number.isFinite(mob.walkPhase) ? mob.walkPhase : 0,
        moveTicks: Number.isFinite(mob.moveTicks) ? Math.max(0, mob.moveTicks) : 0,
        pauseTicks: Number.isFinite(mob.pauseTicks) ? Math.max(0, mob.pauseTicks) : 0,
        ageTicks: Number.isFinite(mob.ageTicks) ? Math.max(-24000, Math.min(0, mob.ageTicks)) : 0,
        loveTicks: Number.isFinite(mob.loveTicks) ? Math.max(0, Math.min(600, mob.loveTicks)) : 0,
        breedCooldown: Number.isFinite(mob.breedCooldown) ? Math.max(0, Math.min(6000, mob.breedCooldown)) : 0,
        villageKey: typeof mob.villageKey === 'string' ? mob.villageKey : null,
        villageSlot: Number.isInteger(mob.villageSlot) && mob.villageSlot >= 0 && mob.villageSlot < 4 ? mob.villageSlot : null,
        villagerCareer: typeof mob.villagerCareer === 'string' ? mob.villagerCareer : null,
        villagerProfession: typeof mob.villagerProfession === 'string' ? mob.villagerProfession : null,
        villagerType: typeof mob.villagerType === 'string' ? mob.villagerType : 'plains',
        villagerSeed: Number.isSafeInteger(mob.villagerSeed) ? mob.villagerSeed : 1,
        villagerTier: Number.isFinite(mob.villagerTier) ? Math.max(1, Math.min(5, mob.villagerTier)) : 1,
        villagerTradeCount: Number.isFinite(mob.villagerTradeCount) ? Math.max(0, mob.villagerTradeCount) : 0,
        villagerUsedOffers: Array.isArray(mob.villagerUsedOffers) ? mob.villagerUsedOffers.filter((id) => typeof id === 'string').slice(0, 64) : [],
        villagerOfferUses: mob.villagerOfferUses && typeof mob.villagerOfferUses === 'object' ? mob.villagerOfferUses : {},
        health: mob.health,
        tamed: !!mob.tamed && ['wolf', 'horse'].includes(mob.type),
        sitting: mob.type === 'wolf' && !!mob.sitting,
        tameProgress: Number.isFinite(mob.tameProgress) ? Math.max(0, Math.min(3, mob.tameProgress)) : 0,
        saddled: ['horse', 'pig'].includes(mob.type) && !!mob.saddled,
        horseArmor: ['iron', 'golden', 'diamond'].includes(mob.horseArmor) ? mob.horseArmor : null,
        ramCooldown: mob.type === 'goat' && Number.isFinite(mob.ramCooldown) ? Math.max(0, Math.min(600, mob.ramCooldown)) : 0,
        ramWindup: mob.type === 'goat' && Number.isFinite(mob.ramWindup) ? Math.max(0, Math.min(30, mob.ramWindup)) : 0,
        ramTicks: mob.type === 'goat' && Number.isFinite(mob.ramTicks) ? Math.max(0, Math.min(12, mob.ramTicks)) : 0,
        hornsDropped: mob.type === 'goat' && Number.isFinite(mob.hornsDropped) ? Math.max(0, Math.min(2, mob.hornsDropped)) : 0,
        leashHolder: typeof mob.leashHolder === 'string' && mob.leashHolder.length <= 32 && LEASHABLE_MOB_TYPES.has(mob.type) ? mob.leashHolder : null,
        beePollenTicks: Number.isFinite(mob.beePollenTicks) ? Math.max(0, Math.min(600, mob.beePollenTicks)) : 0,
        beeHiveWorkTicks: Number.isFinite(mob.beeHiveWorkTicks) ? Math.max(0, Math.min(200, mob.beeHiveWorkTicks)) : 0,
        beeSearchTicks: Number.isFinite(mob.beeSearchTicks) ? Math.max(0, Math.min(20, mob.beeSearchTicks)) : 0,
        beeTarget: null,
        sheared: !!mob.sheared, eggLayTicks: Number.isFinite(mob.eggLayTicks) ? Math.max(0, Math.min(12000, mob.eggLayTicks)) : 0, grazeTicks: Number.isFinite(mob.grazeTicks) ? Math.max(0, Math.min(1200, mob.grazeTicks)) : 0,
        hurtTicks: 0,
        knockbackX: 0, knockbackZ: 0,
        fuseTicks: Number.isFinite(mob.fuseTicks) ? Math.max(0, Math.min(30, mob.fuseTicks)) : 0,
        anim: { walk: 0, idle: 0, attack: 0, hurt: 0, fuse: 0 },
      });
    }
    this.nextId = [...this.mobs, ...this.experienceOrbs].reduce((next, entity) => Math.max(next, entity.id + 1), 1);
  }

  _spawn(type, x, z, extra = {}) {
    const world = this.game.world;
    const y = Number.isFinite(extra.y) ? extra.y : world.getHeight(x, z) + 1;
    if (y < -60 || !world.getBlock(x, y - 1, z).block.solid) return false;
    const feet = world.getBlock(x, y, z).block;
    const head = world.getBlock(x, y + 1, z).block;
    if (feet.solid || head.solid || feet.id === 'mc:water' || head.id === 'mc:water') return false;
    this.mobs.push({
      id: this.nextId++, type, x: x + 0.5, y, z: z + 0.5,
      yaw: Math.random() * Math.PI * 2,
      targetYaw: Math.random() * Math.PI * 2,
      speed: MOB_AI_PROFILES[type] ? 0.035 : 0.018,
      thinkTicks: 0, attackTicks: 0, walkPhase: Math.random() * 6,
      moveTicks: 0, pauseTicks: 45 + Math.floor(Math.random() * 100),
      health: ({ goat:10, bee:10, allay:20, axolotl:14, frog:10, tadpole:6, warden:500, zombie:20, husk:20, zombie_villager:20, skeleton:20, stray:20, wither_skeleton:20, creeper:20, enderman:40, spider:16, cave_spider:12, silverfish:8, endermite:8, slime:16, magma_cube:16, vex:14, vindicator:24, evoker:24, witch:26, blaze:20, ghast:10, guardian:30, elder_guardian:80, wither:300, cow:10, pig:10, chicken:4, sheep:8, mooshroom:10, rabbit:3, wolf:8, horse:30, polar_bear:30, villager:20 })[type] ?? 10,
      sheared: false, eggLayTicks: type === 'chicken' ? 6000 + Math.floor(Math.random() * 6001) : 0, grazeTicks: 600 + Math.floor(Math.random() * 601), hurtTicks: 0, fuseTicks: 0,
      ageTicks: 0, loveTicks: 0, breedCooldown: 0,
      anim: { walk: 0, idle: Math.random() * Math.PI * 2, attack: 0, hurt: 0, fuse: 0 },
      ...extra,
    });
    return true;
  }


  /** Populate nearby generated villages with four persistent residents. */
  _spawnNearbyVillageResidents() {
    const world = this.game.world, player = this.game.player;
    if (!world || !player || world.seed === undefined || world.seed === null) return;
    if (!this.villageGenerator || this.villageSeed !== String(world.seed)) {
      this.villageGenerator = new TerrainGenerator(world.seed);
      this.villageSeed = String(world.seed);
    }
    const centerX = Math.floor(player.x / 128), centerZ = Math.floor(player.z / 128);
    const positions = [[8, 8], [18, 8], [8, 18], [18, 18]];
    for (let gz = centerZ - 1; gz <= centerZ + 1; gz++) {
      for (let gx = centerX - 1; gx <= centerX + 1; gx++) {
        const candidate = villageCandidateForCell(world.seed, gx, gz);
        if (!candidate) continue;
        const site = this.villageGenerator.validateVillageSite(candidate.x, candidate.z);
        if (!site) continue;
        const villageKey = `${gx},${gz}`;
        if (this.populatedVillages.has(villageKey)) continue;
        const residents = this.mobs.filter((mob) => mob.type === 'villager' && mob.villageKey === villageKey);
        if (residents.length >= 4) { this.populatedVillages.add(villageKey); continue; }
        const occupied = new Set(residents.map((mob) => mob.villageSlot));
        for (let slot = 0; slot < positions.length; slot++) {
          if (occupied.has(slot)) continue;
          const [ox, oz] = positions[slot];
          const x = candidate.x + ox, z = candidate.z + oz;
          if (!world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
          const y = world.getHeight(x, z) + 1;
          if (Math.abs(y - (site.y + 1)) > 1.1) continue;
          const profile = createVillagerProfile(world.seed, candidate.x, candidate.z, site.biome, slot);
          this._spawn('villager', x, z, {
            ...profile, y, villageKey, villageSlot: slot,
            speed: 0.018,
          });
        }
        if (this.mobs.filter((mob) => mob.type === 'villager' && mob.villageKey === villageKey).length >= 4) {
          this.populatedVillages.add(villageKey);
        }
      }
    }
  }

  /** Spawn a supported creature from a creative egg on the clicked block. */
  spawnFromEgg(type, x, z) {
    if (!['cow','pig','sheep','chicken','mooshroom','rabbit','wolf','horse','polar_bear','zombie','husk','zombie_villager','skeleton','stray','wither_skeleton','creeper','enderman','spider','cave_spider','silverfish','endermite','slime','magma_cube','vex','vindicator','evoker','witch','blaze','ghast','guardian','elder_guardian','wither','villager','bee','goat','allay','axolotl','frog','tadpole','warden'].includes(type)) return false;
    if (type === 'villager') {
      const world = this.game.world;
      const y = world.getHeight(x, z);
      const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
      const localX = ((x % 16) + 16) % 16, localZ = ((z % 16) + 16) % 16;
      const biome = chunk?.getBiome(localX, y, localZ) ?? 'mc:plains';
      return this._spawn(type, x, z, createVillagerProfile(world.seed, x, z, biome, 0));
    }
    return this._spawn(type, x, z);
  }

  /** Ensure the mob's feet and head fit at all four corners. */
  _canOccupy(x, y, z) {
    const radius = 0.27;
    const feetY = Math.floor(y + 0.05);
    const headY = Math.floor(y + 1.35);
    for (const ox of [-radius, radius]) for (const oz of [-radius, radius]) {
      const bx = Math.floor(x + ox), bz = Math.floor(z + oz);
      if (this.game.world.getBlock(bx, feetY, bz).block.solid ||
          this.game.world.getBlock(bx, headY, bz).block.solid) return false;
    }
    return true;
  }

  targetedMob(maxDistance = 4.5) {
    const player = this.game.player;
    if (!player) return null;
    const yaw = player.yaw * Math.PI / 180;
    const pitch = player.pitch * Math.PI / 180;
    const look = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    let best = null;
    let bestDistance = maxDistance;
    for (const mob of this.mobs) {
      const dx = mob.x - player.x;
      const dy = mob.y + 0.75 - player.eyeY;
      const dz = mob.z - player.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= 0.001 || distance > bestDistance) continue;
      // A solid block between the player's eye and the creature blocks melee
      // and interaction; do not let the aim cone hit through walls.
      const blockHit = this.game.hit;
      if (blockHit) {
        const blockDistance = Math.hypot(
          blockHit.x + 0.5 - player.x,
          blockHit.y + 0.5 - player.eyeY,
          blockHit.z + 0.5 - player.z,
        );
        if (blockDistance + 0.35 < distance) continue;
      }
      const dot = (dx * look[0] + dy * look[1] + dz * look[2]) / distance;
      if (dot < 0.82) continue;
      best = mob;
      bestDistance = distance;
    }
    return best;
  }

  _findFishingWater(maxDistance = 7) {
    const player = this.game.player;
    const world = this.game.world;
    if (!player || !world) return null;
    const yaw = player.yaw * Math.PI / 180;
    const pitch = player.pitch * Math.PI / 180;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = -Math.sin(pitch);
    const dz = Math.cos(yaw) * Math.cos(pitch);
    for (let distance = 0.35; distance <= maxDistance; distance += 0.08) {
      const x = player.x + dx * distance;
      const y = player.eyeY + dy * distance;
      const z = player.z + dz * distance;
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      const block = world.getBlock(bx, by, bz).block;
      if (block.id === 'mc:water') {
        // Keep the bobber in the actual water block and let the renderer place
        // it just above the animated surface, rather than at the player's aim point.
        return { x: bx + 0.5, y: by + 0.88, z: bz + 0.5 };
      }
      if (block.solid) return null;
    }
    return null;
  }

  useFishingRod() {
    const stack = this.game.inventory?.held;
    const player = this.game.player;
    if (stack?.item?.id !== 'mc:fishing_rod' || !player) return false;
    if (!this.fishing) {
      const target = this._findFishingWater();
      if (!target) {
        this.game.ui?.toast('Наведи удочку на воду и нажми ПКМ');
        return true;
      }
      const yaw = player.yaw * Math.PI / 180;
      const side = { x: Math.cos(yaw), z: Math.sin(yaw) };
      const approachDistance = 1.35 + Math.random() * 0.75;
      this.fishing = {
        ...target,
        ticks: fishingWaitTicks(110 + Math.floor(Math.random() * 100), stack),
        bite: false,
        window: 0,
        elapsed: 0,
        castProgress: 0,
        approachAt: 48,
        fishX: target.x + side.x * approachDistance,
        fishZ: target.z + side.z * approachDistance,
        fishSeed: Math.random() * Math.PI * 2,
        biteAnim: 0,
      };
      player.attackTime = 8;
      this.game.sounds?.play('cast');
      this.game.ui?.toast('Поплавок на воде. Рыба может подплыть…');
      return true;
    }
    if (!this.fishing.bite) {
      this.fishing = null;
      this.game.sounds?.play('reel');
      this.game.ui?.toast('Ты вытащил удочку слишком рано');
      return true;
    }
    const caught = rollFishingCatch(Math.random, this.game.inventory?.held);
    if (player.gamemode !== 'creative') {
      const leftover = this.game.inventory.addItem(caught.id, caught.count);
      if (leftover > 0) this.game.ui?.toast('Инвентарь заполнен: улов потерян', { error: true });
      this.game.inventory.damageHeld(1);
    }
    player.attackTime = 8;
    if (player.gamemode === 'survival') {
      this.spawnExperienceOrbs(experienceForFishing(), player.x, player.y + 0.65, player.z);
    }
    player.recordAdvancementEvent?.('caught_fish', this.game.tickCount || 0);
    this.game.sounds?.play('reel');
    this.game.sounds?.play('catch');
    this.fishing = null;
    this.game.ui?.toast('Поймано: ' + caught.id.replace('mc:', ''));
    return true;
  }


  useLeadFromPlayer() {
    const mob = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!mob || !player || !['survival', 'creative'].includes(player.gamemode)) return false;
    if (mob.leashHolder === 'player' && (!held || held.isEmpty) &&
        (this.game.keys?.has('ShiftLeft') || this.game.keys?.has('ShiftRight'))) {
      if (!detachMobLead(mob)) return false;
      const leftover = this.game.inventory.addItem('mc:lead', 1);
      if (leftover > 0) this.spawnItemStackAt(new ItemStack(ITEMS.get('mc:lead'), 1), player.x, player.y + 0.5, player.z);
      this.game.ui?.toast('Поводок снят');
      return true;
    }
    if (held?.item?.id !== 'mc:lead' || held.count <= 0) return false;
    if (!attachMobLead(mob)) return false;
    if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
    this.game.ui?.toast('Поводок прикреплён');
    return true;
  }
  tameFromPlayer() {
    const mob = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!mob || !player || !['survival', 'creative'].includes(player.gamemode)) return false;

    if (mob.type === 'wolf' && mob.tamed && (!held || held.isEmpty)) {
      mob.sitting = !mob.sitting;
      this.game.ui?.toast(mob.sitting ? 'Волк сидит' : 'Волк следует за тобой');
      return true;
    }

    if (mob.type === 'wolf' && !mob.tamed && held?.item?.id === 'mc:bone') {
      if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
      mob.tameProgress = (mob.tameProgress || 0) + 1;
      if (mob.tameProgress >= 2) {
        mob.tamed = true;
        mob.owner = 'player';
        mob.health = Math.max(mob.health, 20);
        mob.sitting = false;
        this.game.ui?.toast('Волк приручён!');
      } else this.game.ui?.toast('Волк доверяет тебе больше. Дай ещё кость.');
      return true;
    }

    if (mob.type === 'pig' && held?.item?.id === 'mc:saddle' && canSaddlePig(mob)) {
      if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
      mob.saddled = true;
      this.game.ui?.toast('Седло надето на свинью');
      return true;
    }

    if (mob.type === 'pig' && mob.saddled && (!held || held.isEmpty)) {
      if (player.ridingHorse === mob) {
        player.ridingHorse = null;
        this.game.ui?.toast('Ты слез со свиньи');
      } else if (!player.ridingHorse) {
        player.ridingHorse = mob;
        mob.targetYaw = player.yaw * Math.PI / 180;
        this.game.ui?.toast('Ты сел на свинью. Управляй морковкой на удочке.');
      }
      return true;
    }

    if (mob.type === 'horse' && !mob.tamed && (!held || held.isEmpty)) {
      mob.tameProgress = (mob.tameProgress || 0) + 1;
      if (mob.tameProgress >= 3) {
        mob.tamed = true;
        mob.owner = 'player';
        this.game.ui?.toast('Лошадь приручена! Теперь надень на неё седло.');
      } else this.game.ui?.toast('Лошадь пока не доверяет тебе. Попробуй ещё раз.');
      return true;
    }

    if (mob.type === 'horse' && mob.tamed && held?.item?.id === 'mc:saddle' && !mob.saddled) {
      if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
      mob.saddled = true;
      this.game.ui?.toast('Седло надето на лошадь');
      return true;
    }

    if (mob.type === 'horse' && mob.tamed && mob.saddled && (!held || held.isEmpty)) {
      if (player.ridingHorse === mob) {
        player.ridingHorse = null;
        this.game.ui?.toast('Ты слез с лошади');
      } else if (!player.ridingHorse) {
        player.ridingHorse = mob;
        mob.targetYaw = player.yaw * Math.PI / 180;
        this.game.ui?.toast('Ты сел на лошадь');
      }
      return true;
    }

    if (mob.type === 'horse' && mob.tamed && held?.item?.horseArmor && !mob.horseArmor) {
      mob.horseArmor = held.item.horseArmor;
      if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
      this.game.ui?.toast('Броня надета на лошадь');
      return true;
    }
    return false;
  }

  boostPigFromPlayer() {
    const player = this.game.player;
    const pig = player?.ridingHorse;
    const held = this.game.inventory?.held;
    if (!player || pig?.type !== 'pig' || !pig.saddled || held?.item?.id !== 'mc:carrot_on_a_stick') return false;
    if ((pig.boostCooldown || 0) > 0) {
      this.game.ui?.toast('Морковка на удочке ещё перезаряжается', { duration: 900 });
      return true;
    }
    const impulse = pigBoostImpulse(player.yaw * Math.PI / 180);
    player.vx += impulse.x;
    player.vz += impulse.z;
    pig.boostCooldown = 100;
    this.game.inventory.damageHeld(1);
    this.game.ui?.updateHotbar(this.game.inventory);
    this.game.sounds?.play('reel');
    return true;
  }

  feedAnimalFromPlayer() {
    const animal = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!animal || !player || !['survival', 'creative'].includes(player.gamemode)) return false;
    const creative = player.gamemode === 'creative';
    if (animal.type === 'horse' && held?.item) {
      const effect = horseFoodEffect(held.item.id);
      if (effect && animal.health < 30) {
        if (!creative) this.game.inventory.remove(held.item.id, 1);
        animal.health = Math.min(30, animal.health + effect.heal);
        this.game.ui?.toast('Лошадь восстановила здоровье');
        return true;
      }
      if (effect && animal.ageTicks < 0) {
        if (!creative) this.game.inventory.remove(held.item.id, 1);
        animal.ageTicks = Math.min(0, Math.ceil(animal.ageTicks * (1 - effect.growth)));
        this.game.ui?.toast('Жеребёнок быстрее взрослеет');
        return true;
      }
      if (!effect?.breeding) return false;
    }    if (!held?.item || !canBreedAnimalWith(animal.type, held.item.id)) return false;
    if (animal.ageTicks >= 0 && (animal.breedCooldown > 0 || animal.loveTicks > 0)) {
      this.game.ui?.toast('This animal is not ready to breed');
      return true;
    }
    if (!creative && this.game.inventory.remove(held.item.id, 1) !== 1) return false;
    // In Java 1.12, each feeding removes 10% of a baby's remaining growth time.
    if (animal.ageTicks < 0) {
      animal.ageTicks = Math.min(0, Math.ceil(animal.ageTicks * 0.9));
      this.game.ui?.toast('Baby animal is growing');
      return true;
    }
    animal.loveTicks = 600;
    const partner = this.mobs.find((other) =>
      other !== animal && other.type === animal.type &&
      other.ageTicks >= 0 && other.breedCooldown <= 0 && other.loveTicks > 0 &&
      Math.hypot(other.x - animal.x, other.y - animal.y, other.z - animal.z) <= 8
    );
    if (partner) {
      const baby = this._spawnBaby(animal, partner);
      if (baby) {
        player.recordAdvancementEvent?.('bred_animal', this.game.tickCount || 0);
        animal.loveTicks = 0;
        partner.loveTicks = 0;
        animal.breedCooldown = 6000;
        partner.breedCooldown = 6000;
        if (player.gamemode === 'survival') {
          this.spawnExperienceOrbs(experienceForBreeding(),
            (animal.x + partner.x) / 2, (animal.y + partner.y) / 2 + 0.5, (animal.z + partner.z) / 2);
        }
        this.game.ui?.toast('Animal bred');
      }
    } else {
      this.game.ui?.toast('Animal is ready to breed');
    }
    return true;
  }

  _spawnBaby(first, second) {
    if (this.mobs.length >= 9) {
      this.game.ui?.toast('Too many nearby creatures', { error: true });
      return false;
    }
    const x = (first.x + second.x) / 2;
    const z = (first.z + second.z) / 2;
    const y = this.game.world.getHeight(Math.floor(x), Math.floor(z)) + 1;
    if (y < -60 || !this.game.world.getBlock(Math.floor(x), y - 1, Math.floor(z)).block.solid) return false;
    this.mobs.push({
      id: this.nextId++, type: first.type, x, y, z,
      yaw: first.yaw, targetYaw: first.yaw, speed: first.speed,
      thinkTicks: 0, attackTicks: 0, walkPhase: 0,
      health: ({ cow: 10, pig: 10, chicken: 4, sheep: 8, rabbit: 3, horse: 30 })[first.type] ?? 10,
      sheared: false, hurtTicks: 0, fuseTicks: 0,
      ageTicks: -24000, loveTicks: 0, breedCooldown: 0,
      anim: { walk: 0, idle: 0, attack: 0, hurt: 0, fuse: 0 },
    });
    return true;
  }

  shearFromPlayer() {
    const mob = this.targetedMob();
    const held = this.game.inventory?.held;
    if (!mob || held?.item?.tool !== 'shears') return false;
    let drops = [];
    if (mob.type === 'sheep' && !mob.sheared) drops = shearSheep(mob);
    else if (mob.type === 'mooshroom') drops = shearMooshroom(mob);
    else return false;
    for (const drop of drops) {
      const leftover = this.game.inventory.addItem(drop.id, drop.count);
      if (leftover > 0) this.game.ui?.toast('Inventory full: ' + leftover + ' items not collected', { error: true });
    }
    if (this.game.player?.gamemode !== 'creative') this.game.inventory.damageHeld(1);
    this.game.ui?.toast(mob.type === 'cow' ? 'Mooshroom converted into a cow' : 'Sheep sheared');
    return true;
  }

  milkCowFromPlayer() {
    const mob = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!mob || mob.type !== 'cow' || !held || held.isEmpty || held.item?.id !== 'mc:bucket') return false;
    if (!player || !['survival', 'creative'].includes(player.gamemode)) return false;
    const leftover = this.game.inventory.addItem('mc:milk_bucket', 1);
    if (leftover > 0) {
      this.game.ui?.toast('Нужно свободное место для ведра молока', { error: true });
      return true;
    }
    if (player.gamemode !== 'creative') this.game.inventory.consumeHeld(1);
    this.game.ui?.toast('Получено ведро молока');
    return true;
  }

  _damagePlayer(amount, sourceX = null, sourceZ = null) {
    const player = this.game.player;
    if (!player || player.gamemode !== 'survival' || amount <= 0) return 0;
    const difficulty = this.game.worldMeta?.difficulty || 'normal';
    if (difficulty === 'peaceful') return 0;
    amount *= difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.5 : 1;
    const inventory = this.game.inventory;
    const held = inventory?.held;
    const offhand = inventory?.get(40);
    const shieldSlot = held?.item?.id === 'mc:shield' ? inventory.selectedSlot
      : offhand?.item?.id === 'mc:shield' ? 40 : -1;
    if (shieldSlot >= 0 && this.game.mouseButtons?.has(2) &&
        shieldBlocksAttack(player, sourceX, sourceZ, true)) {
      const shield = inventory.get(shieldSlot);
      const broke = shield.applyDamage(1);
      if (broke) inventory.set(shieldSlot, ItemStack.EMPTY.clone());
      else inventory.version++;
      this.game.ui?.updateHotbar(inventory);
      this.game.sounds?.play('cast');
      return 0;
    }
    let armorPoints = 0;
    let toughness = 0;
    let worn = false;
    const expectedSlots = ['boots', 'leggings', 'chestplate', 'helmet'];

    for (let i = 0; i < expectedSlots.length; i++) {
      const stack = inventory?.get(36 + i);
      if (stack?.isEmpty || stack?.item?.armorSlot !== expectedSlots[i]) continue;
      armorPoints += stack.item.armorPoints || 0;
      toughness += stack.item.armorToughness || 0;
      worn = true;
      const armorWear = unbreakingDamage(stack, Math.max(1, Math.ceil(amount)));
      if (stack.item.isDamageable && armorWear > 0 && stack.applyDamage(armorWear)) {
        inventory.slots[36 + i] = ItemStack.EMPTY.clone();
      }
    }
    if (worn && inventory) inventory.version++;
    const armorStacks = expectedSlots.map((_, i) => inventory?.get(36 + i)).filter((stack) => stack && !stack.isEmpty);
    const finalDamage = calculateArmorDamage(amount, armorPoints, toughness) * protectionDamageMultiplier(armorStacks);
    if (finalDamage > 0) {
      this.game.sounds?.play('hurt');
      // A restrained hit cue: a short red edge tint and sub-pixel camera shake.
      this.game.damageFeedback = Math.min(1, (this.game.damageFeedback || 0) + 0.72);
    }
    player.health = Math.max(0, player.health - finalDamage);
    return finalDamage;
  }

  attackFromPlayer() {
    const mob = this.targetedMob();
    if (!mob) return this.game.multiplayer?.attackFromPlayer() ?? false;
    if (this.attackCooldown > 0) return true;
    const player = this.game.player;
    const held = this.game.inventory?.held;
    const baseDamage = Math.max(1, held?.item?.attackDamage || 1);
    const weaknessPenalty = player.effects?.has('weakness') ? 4 * (player.effects.amplifier('weakness') + 1) : 0;
    const damage = Math.max(0, baseDamage + enchantmentDamageBonus(held, mob.type) +
      (player.effects?.has('strength') ? 3 * (player.effects.amplifier('strength') + 1) : 0) - weaknessPenalty);
    const finalDamage = mob.type === 'horse' ? calculateHorseArmorDamage(damage, mob.horseArmor) : damage;
    const previousHealth = mob.health;
    mob.health = Math.max(0, mob.health - finalDamage);
    if (previousHealth > 0 && mob.health <= 0 && ['zombie','skeleton','stray','creeper','spider','enderman','witch','slime','magma_cube','ghast','blaze','wither_skeleton','drowned','phantom','guardian','elder_guardian','silverfish','cave_spider'].includes(mob.type)) player.recordAdvancementEvent?.('killed_hostile', this.game.tickCount || 0);
    this.game.sounds?.play('hit');
    mob.hurtTicks = 10;
    mob.anim.hurt = 1;
    mob.playerDamageTicks = 100;
    this.attackCooldown = 10;
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    const length = Math.max(0.01, Math.hypot(dx, dz));
    // A visible hit impulse: mobs slide away for several ticks instead of
    // receiving a single tiny position nudge that their AI immediately cancels.
    mob.knockbackX = (dx / length) * 0.16;
    mob.knockbackZ = (dz / length) * 0.16;
    mob.knockbackY = 0.10;
    if (!['zombie','skeleton','stray','creeper','spider','cave_spider','enderman'].includes(mob.type)) {
      mob.fleeTicks = 180;
      mob.moveTicks = 100;
      mob.pauseTicks = 0;
      mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
    }
    if (mob.health <= 0) {
      for (const drop of rollMobDrops(mob.type, Math.random, enchantmentLevel(held, 'looting'))) {
        const leftover = this.game.inventory?.addItem(drop.id, drop.count) ?? drop.count;
        if (leftover > 0) this.game.ui?.toast('Inventory full: ' + leftover + ' ' + drop.id.replace('mc:', '') + ' not collected', { error: true });
      }
      this._dropMobExperience(mob);
      this.mobs.splice(this.mobs.indexOf(mob), 1);
      this.game.ui?.toast(mob.type + ' defeated');
    }
    return true;
  }

  _dropMobExperience(mob) {
    if (!mob || mob.experienceDropped || !(mob.playerDamageTicks > 0)) return 0;
    mob.experienceDropped = true;
    const amount = experienceForMob(mob.type, Math.random, mob);
    if (amount > 0) this.spawnExperienceOrbs(amount, mob.x, mob.y + 0.45, mob.z);
    return amount;
  }

  spawnExperienceOrbs(points, x, y, z) {
    const values = splitExperienceIntoOrbs(points);
    for (const value of values) {
      const angle = Math.random() * Math.PI * 2;
      this.experienceOrbs.push({
        id: this.nextId++, value, x: x + (Math.random() - 0.5) * 0.35,
        y: y + (Math.random() - 0.5) * 0.25, z: z + (Math.random() - 0.5) * 0.35,
        vx: Math.cos(angle) * 0.045, vy: 0.08 + Math.random() * 0.05,
        vz: Math.sin(angle) * 0.045, age: 0, pickupDelay: 0, count: 1,
      });
    }
    return values.length;
  }

  _tickExperienceOrbs() {
    const player = this.game.player, world = this.game.world;
    if (!player || !world) return;
    if (this.experiencePickupCooldown > 0) this.experiencePickupCooldown--;

    // Java 1.17+ coalesces nearby orbs of the same value without increasing
    // their denomination; Count tracks how many individual pickups remain.
    for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
      const orb = this.experienceOrbs[i];
      for (let j = i - 1; j >= 0; j--) {
        const other = this.experienceOrbs[j];
        if (other.value !== orb.value || Math.hypot(other.x - orb.x, other.y - orb.y, other.z - orb.z) > 0.5) continue;
        if (mergeExperienceOrbState(other, orb)) this.experienceOrbs.splice(i, 1);
        break;
      }
    }

    for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
      const orb = this.experienceOrbs[i];
      orb.age++;
      if (orb.age >= 6000) { this.experienceOrbs.splice(i, 1); continue; }
      if (orb.pickupDelay > 0) orb.pickupDelay--;

      const bx = Math.floor(orb.x), by = Math.floor(orb.y), bz = Math.floor(orb.z);
      const contactBlock = world.getBlock(bx, by, bz)?.block?.id;
      if (isExperienceOrbHazard(contactBlock)) { this.experienceOrbs.splice(i, 1); continue; }

      const dx = player.x - orb.x, dy = (player.y + 0.65) - orb.y, dz = player.z - orb.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < 7.25 && distance > 0.001) {
        const pull = 0.012 + (1 - Math.min(1, distance / 7.25)) * 0.045;
        orb.vx += dx / distance * pull;
        orb.vy += dy / distance * pull;
        orb.vz += dz / distance * pull;
        const speed = Math.hypot(orb.vx, orb.vy, orb.vz);
        if (speed > 0.45) {
          const scale = 0.45 / speed;
          orb.vx *= scale; orb.vy *= scale; orb.vz *= scale;
        }
      }

      const nx = orb.x + orb.vx, ny = orb.y + orb.vy, nz = orb.z + orb.vz;
      const nextBlock = world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))?.block?.id;
      if (isExperienceOrbHazard(nextBlock)) { this.experienceOrbs.splice(i, 1); continue; }
      const inWater = nextBlock === 'mc:water';
      if (inWater) {
        // Water buoyancy keeps the orb rising instead of sinking to the floor.
        orb.vy = Math.max(0.025, orb.vy * 0.8);
        orb.vx *= 0.82; orb.vz *= 0.82;
        orb.y = ny;
      } else {
        orb.vy = Math.max(-0.18, orb.vy - 0.012);
        const floor = world.getHeight(Math.floor(nx), Math.floor(nz)) + 1.04;
        if (ny <= floor) {
          orb.y = floor + 0.025;
          orb.vy = Math.abs(orb.vy) * 0.18;
          orb.vx *= 0.82; orb.vz *= 0.82;
        } else orb.y = ny;
      }
      orb.x = nx; orb.z = nz;
      orb.vx *= 0.985; orb.vy *= 0.985; orb.vz *= 0.985;

      if (orb.pickupDelay <= 0 && distance < 0.78 && this.experiencePickupCooldown <= 0 &&
          player.gamemode !== 'spectator' && player.health > 0) {
        const oldLevel = player.experience?.level ?? 0;
        const heldStack = this.game.inventory?.held;
        const mending = repairWithMending(heldStack, orb.value);
        if (mending.repaired > 0) this.game.inventory.version++;
        if (mending.xpRemaining > 0) player.addExperience?.(mending.xpRemaining);
        orb.count = Math.max(1, orb.count || 1) - 1;
        if (orb.count <= 0) this.experienceOrbs.splice(i, 1);
        this.experiencePickupCooldown = 2;
        this.game.sounds?.play((player.experience?.level ?? 0) > oldLevel ? 'levelup' : 'xp');
      }
    }
  }


  /**
   * Tick nearby Java-style monster spawners. Scanning is throttled to once per
   * second; already discovered spawners keep their delay and are saved with mobs.
   */
  _tickSpawners() {
    const world = this.game.world, player = this.game.player;
    if (!world || !player) return;

    this.spawnerScanTicks++;
    if (this.spawnerScanTicks >= 20) {
      this.spawnerScanTicks = 0;
      const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
      for (let y = py - 16; y <= py + 16; y++) {
        for (let z = pz - 16; z <= pz + 16; z++) {
          for (let x = px - 16; x <= px + 16; x++) {
            const dx = x + 0.5 - player.x, dy = y - player.y, dz = z + 0.5 - player.z;
            if (dx * dx + dy * dy + dz * dz >= 256) continue;
            const blockState = world.getBlock(x, y, z);
            if (blockState.block.id !== 'mc:mob_spawner') continue;
            const key = `${x},${y},${z}`;
            if (!this.spawnerStates.has(key) && this.spawnerStates.size < 256) {
              const mobType = blockState.get('spawner_type') === 'silverfish'
                ? 'silverfish'
                : spawnerMobType(world.seed, x, y, z);
              this.spawnerStates.set(key, { x, y, z, mobType, delay: 20 });
            }
          }
        }
      }
    }

    for (const [key, state] of this.spawnerStates) {
      const chunk = world.getChunk(Math.floor(state.x / 16), Math.floor(state.z / 16));
      // An unloaded chunk is not evidence that its spawner was removed.
      if (!chunk) continue;
      if (world.getBlock(state.x, state.y, state.z).block.id !== 'mc:mob_spawner') {
        this.spawnerStates.delete(key);
        continue;
      }
      if (!spawnerPlayerInRange(state, player)) continue;

      if (state.delay > 0) {
        state.delay--;
        continue;
      }

      // Dungeon spawners contain hostile mobs; Peaceful activates the block but
      // suppresses the spawn cycle, matching Java's difficulty rule.
      if (this.game.worldMeta?.difficulty === 'peaceful') {
        state.delay = nextSpawnerDelay();
        continue;
      }

      let spawned = 0;
      let reachedMobCap = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (countSpawnerMobs(this.mobs, state, state.mobType) >= 6) {
          reachedMobCap = true;
          break;
        }
        const position = spawnerSpawnPosition(state);
        if (!world.hasChunk(Math.floor(position.x / 16), Math.floor(position.z / 16))) continue;
        const feet = world.getBlock(position.x, position.y, position.z).block;
        const head = world.getBlock(position.x, position.y + 1, position.z).block;
        const floor = world.getBlock(position.x, position.y - 1, position.z).block;
        if (!floor.solid || feet.solid || head.solid || feet.liquid || head.liquid) continue;
        if (!this._canOccupy(position.x + 0.5, position.y, position.z + 0.5)) continue;
        if (this._spawn(state.mobType, position.x, position.z, { y: position.y })) spawned++;
      }

      if (spawned > 0 || reachedMobCap) {
        state.delay = nextSpawnerDelay();
        if (spawned > 0) this.spawnBlockParticles(state.x, state.y, state.z, 'mc:mob_spawner');
      }
      // If all four positions were invalid, delay remains zero and Java retries
      // on the next tick instead of imposing a fresh 10–40 second wait.
    }
  }

  tick() {
    const world = this.game.world;
    const player = this.game.player;
    if (!world || !player) return;
    this._tickDroppedItems();
    this._tickExperienceOrbs();
    this.spawnTicks++;
    this.villageCheckTicks++;
    if (this.villageCheckTicks >= 200) {
      this.villageCheckTicks = 0;
      this._spawnNearbyVillageResidents();
    }
    if (this.fishing && !this.fishing.bite) {
      const fishing = this.fishing;
      fishing.elapsed++;
      fishing.castProgress = Math.min(1, (fishing.castProgress ?? 0) + 1 / 12);
      fishing.ticks--;
      if (fishing.ticks <= fishing.approachAt) {
        fishing.approach = Math.min(1, (fishing.approach || 0) + 1 / 38);
      }
      if (fishing.ticks <= 0) {
        fishing.bite = true;
        fishing.biteAnim = 0;
        fishing.window = 40;
        this.game.sounds?.play('bite');
        this.game.ui?.toast('ПОКЛЁВКА! Быстро нажми ПКМ!', { duration: 1800 });
      }
    } else if (this.fishing?.bite) {
      this.fishing.biteAnim = Math.min(1, (this.fishing.biteAnim || 0) + 0.12);
      this.fishing.window--;
      if (this.fishing.window <= 0) {
        this.fishing = null;
        this.game.ui?.toast('Рыба сорвалась с крючка');
      }
    }
    if (this.attackCooldown > 0) this.attackCooldown--;
    this._tickArrows();
    this._tickBlockParticles();
    if (this.game.mobSimulationEnabled === false) return;
    this._tickSpawners();
    if (world.dimension === 'nether' && !this.netherFortressWave &&
        Math.hypot(player.x - 52, player.z - 36) < 110) {
      let spawned = 0;
      for (const [x,z] of [[45,36],[58,36],[63,37]]) {
        if (!world.hasChunk(Math.floor(x/16),Math.floor(z/16))) continue;
        if (this._spawn('blaze',x,z,{y:53})) spawned++;
      }
      if (spawned > 0) this.netherFortressWave = true;
    }
    // Populate nearby loaded chunks quickly so a new world does not feel empty.
    if (this.spawnTicks >= 180 && this.mobs.length < 7) {
      this.spawnTicks = 0;
      for (let attempt = 0; attempt < 2 && this.mobs.length < 7; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 9 + Math.random() * 9;
        const x = Math.floor(player.x + Math.cos(angle) * distance);
        const z = Math.floor(player.z + Math.sin(angle) * distance);
        if (!world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
        const roll = Math.random();
        const night = this.game.daylight < 0.55;
        const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
        const localX = ((x % 16) + 16) % 16, localZ = ((z % 16) + 16) % 16;
        const surfaceY = world.getHeight(x, z);
        const biome = chunk?.getBiome(localX, surfaceY, localZ) || 'mc:plains';
        let type;
        if (night && this.game.worldMeta?.difficulty !== 'peaceful') {
          const snowy = ['mc:snowy_plains','mc:snowy_taiga','mc:ice_spikes','mc:frozen_ocean','mc:deep_frozen_ocean'].includes(biome);
          type = snowy
            ? (roll < 0.24 ? 'stray' : roll < 0.43 ? 'skeleton' : roll < 0.62 ? 'zombie' : roll < 0.76 ? 'spider' : roll < 0.86 ? 'creeper' : 'enderman')
            : (roll < 0.17 ? 'zombie' : roll < 0.29 ? 'skeleton' : roll < 0.39 ? 'creeper' : roll < 0.48 ? 'spider' : roll < 0.53 ? 'enderman' : roll < 0.66 ? 'sheep' : roll < 0.78 ? 'pig' : roll < 0.9 ? 'cow' : 'chicken');
        } else {
          const dry = ['mc:desert','mc:mesa','mc:wooded_badlands','mc:eroded_badlands','mc:savanna','mc:savanna_plateau','mc:shattered_savanna'].includes(biome);
          const jungle = ['mc:jungle','mc:sparse_jungle','mc:bamboo_jungle'].includes(biome);
          const cold = ['mc:snowy_plains','mc:snowy_taiga','mc:ice_spikes','mc:taiga','mc:mega_taiga','mc:giant_spruce_taiga'].includes(biome);
          if (biome === 'mc:flower_forest' && roll < 0.28) {
            type = 'bee';
          } else if (biome === 'mc:mushroom_island') {
            // Mooshrooms are the signature inhabitant of the very rare mushroom biome.
            type = roll < 0.78 ? 'mooshroom' : roll < 0.9 ? 'cow' : 'sheep';
          } else if (jungle && roll < 0.22) {
            type = 'rabbit';
          } else if (['mc:mountains','mc:windswept_hills','mc:extreme_hills_edge','mc:extreme_hills_plus'].includes(biome) && roll < 0.34) {
            type = 'goat';
          } else if (cold && roll < 0.18) {
            type = 'polar_bear';
          } else if (dry) {
            type = roll < 0.48 ? 'sheep' : roll < 0.78 ? 'chicken' : 'pig';
          } else if (jungle) {
            type = roll < 0.42 ? 'chicken' : roll < 0.76 ? 'pig' : 'sheep';
          } else if (cold) {
            type = roll < 0.48 ? 'sheep' : roll < 0.76 ? 'pig' : 'chicken';
          } else if (roll < 0.07) {
            type = 'wolf';
          } else if (roll < 0.12) {
            type = 'horse';
          } else {
            type = roll < 0.28 ? 'sheep' : roll < 0.52 ? 'pig' : roll < 0.82 ? 'cow' : 'chicken';
          }
        }
        this._spawn(type, x, z);
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (mob.ageTicks < 0) mob.ageTicks++;
      if (mob.boostCooldown > 0) mob.boostCooldown--;
      if (mob.playerDamageTicks > 0) mob.playerDamageTicks--;
      if (mob.fireTicks > 0) {
        mob.fireTicks--;
        if (mob.fireTicks % 20 === 0) {
          mob.health = Math.max(0, mob.health - 1);
          mob.hurtTicks = Math.max(mob.hurtTicks || 0, 4);
        }
      }
      if (mob.loveTicks > 0) mob.loveTicks--;
      if (mob.breedCooldown > 0) mob.breedCooldown--;
      mob.thinkTicks--;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      if (distance > (this.game.simulationDistance || 6) * 16) continue;
      if (mob.type === 'chicken' && tickChickenEggLaying(mob)) {
        this.spawnItemStackAt(new ItemStack(ITEMS.get('mc:egg'), 1), mob.x, mob.y + 0.35, mob.z);
      }
      if (mob.type === 'sheep') {
        const grazed = tickSheepGrassRegrowth(mob, world);
        if (grazed) this.game.multiplayer?.pushBlockChange(grazed.x, grazed.y, grazed.z, grazed.state);
      }
      mob.anim.idle += 0.045;
      mob.anim.walk = mob.walkPhase;
      if (mob.hurtTicks > 0) mob.hurtTicks--;
      mob.anim.hurt = mob.hurtTicks > 0 ? mob.hurtTicks / 8 : 0;

      // Nearby creatures occasionally vocalize. A shared throttle in GameSounds
      // prevents a crowded pen from turning into a constant wall of audio.
      mob.ambientSoundTicks = Number.isFinite(mob.ambientSoundTicks)
        ? mob.ambientSoundTicks - 1
        : 100 + Math.floor(Math.random() * 220);
      if (mob.ambientSoundTicks <= 0 && distance < 18) {
        const audibleVolume = Math.max(0.12, 1 - distance / 20) * 0.32;
        this.game.sounds?.playMob?.(mob.type, 'ambient', audibleVolume);
        mob.ambientSoundTicks = 140 + Math.floor(Math.random() * 260);
      }

      const above = world.getBlock(Math.floor(mob.x), Math.floor(mob.y + 2), Math.floor(mob.z)).block;
      if (shouldBurnInSunlight(mob.type, this.game.daylight, !above.solid && !above.liquid)) {
        mob.sunBurnTicks = (mob.sunBurnTicks || 0) + 1;
        if (mob.sunBurnTicks >= 20) {
          mob.sunBurnTicks = 0;
          mob.health -= 2;
          mob.hurtTicks = 5;
        }
      } else mob.sunBurnTicks = 0;

      if (player.ridingHorse === mob) {
        mob.x = player.x; mob.y = player.y - 0.15; mob.z = player.z;
        mob.yaw = player.yaw * Math.PI / 180;
        mob.walkPhase += Math.hypot(player.vx || 0, player.vz || 0) * 8;
        mob.anim.walking = Math.hypot(player.vx || 0, player.vz || 0) > 0.01;
        continue;
      }

      if (mob.type === 'bee') {
        const hiveChange = tickBeeForaging(world, mob);
        if (hiveChange) this.game.multiplayer?.pushBlockChange(
          hiveChange.x, hiveChange.y, hiveChange.z, hiveChange.state,
        );
      }

      const profile = MOB_AI_PROFILES[mob.type] ?? null;
      const hostileType = profile !== null && this.game.worldMeta?.difficulty !== 'peaceful';
      const targeted = this.targetedMob(32) === mob;
      const endermanWater = mob.type === 'enderman' && (
        world.getBlock(Math.floor(mob.x), Math.floor(mob.y), Math.floor(mob.z)).block.id === 'mc:water' ||
        world.getBlock(Math.floor(mob.x), Math.floor(mob.y + 1), Math.floor(mob.z)).block.id === 'mc:water'
      );

      // Endermen instantly flee water by teleporting to a nearby dry landing spot.
      if (endermanWater) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const tx = Math.floor(mob.x + (Math.random() - 0.5) * 16);
          const tz = Math.floor(mob.z + (Math.random() - 0.5) * 16);
          const ty = world.getHeight(tx, tz) + 1;
          if (ty > -60 && world.getBlock(tx, ty - 1, tz).block.solid &&
              world.getBlock(tx, ty, tz).block.id !== 'mc:water') {
            mob.x = tx + 0.5; mob.y = ty; mob.z = tz + 0.5;
            mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
            break;
          }
        }
      }

      const creeperNear = mob.type === 'creeper' && player.gamemode === 'survival' && distance < profile.fuseRange && distance > 0.01;
      if (creeperNear) {
        mob.fuseTicks = Math.min(30, mob.fuseTicks + 1);
        mob.anim.fuse = mob.fuseTicks / 30;
        mob.targetYaw = Math.atan2(dx, dz);
        if (mob.fuseTicks >= profile.fuseTicks) {
          const blastRange = mob.charged ? profile.blastRange * 2 : profile.blastRange;
          if (distance < blastRange) {
            const damage = Math.max(0, Math.ceil((blastRange - distance) * 3) * (mob.charged ? 2 : 1));
            this._damagePlayer(damage, mob.x, mob.z);
            const knock = (mob.charged ? 0.22 : 0.11) / Math.max(distance, 0.2);
            player.vx += dx * knock; player.vz += dz * knock;
          }
          const mobImpacts = creeperBlastImpacts(this.mobs, mob, !!mob.charged);
          for (const impact of mobImpacts) {
            const target = impact.mob;
            target.health = Math.max(0, target.health - impact.damage);
            const blastScale = mob.charged ? 2 : 1;
            target.knockbackX = (target.knockbackX || 0) + impact.knockbackX * blastScale;
            target.knockbackZ = (target.knockbackZ || 0) + impact.knockbackZ * blastScale;
            target.vy = (target.vy || 0) + impact.knockbackY * blastScale;
            target.hurtTicks = 10;
            target.anim ||= {};
            target.anim.hurt = 1;
            if (target.health <= 0 && ['zombie','skeleton','stray','creeper','spider','enderman','witch','slime','magma_cube','ghast','blaze','wither_skeleton','drowned','phantom','guardian','elder_guardian','silverfish','cave_spider'].includes(target.type)) {
              this.game.player?.recordAdvancementEvent?.('killed_hostile', this.game.tickCount || 0);
            }
          }
          mob.health = 0;
        }
      } else if (mob.type === 'creeper' && mob.fuseTicks > 0) {
        mob.fuseTicks = Math.max(0, mob.fuseTicks - 2);
        mob.anim.fuse = mob.fuseTicks / 30;
      }

      const endermanAngry = mob.type === 'enderman' && targeted && distance < 16;
      if (mob.type === 'goat' && player.gamemode === 'survival') {
        const ram = nextGoatRamState(mob, distance);
        mob.ramCooldown = ram.cooldown;
        mob.ramWindup = ram.windup;
        mob.ramTicks = ram.active;
        if (ram.start || ram.windup > 0 || ram.active > 0) {
          mob.targetYaw = Math.atan2(dx, dz);
          mob.moveTicks = 2;
          mob.pauseTicks = 0;
        }
      }
      const hostile = hostileType && player.gamemode === 'survival' &&
        distance < profile.detectionRange &&
        (mob.type !== 'enderman' || endermanAngry || distance < 2.5);
      if (hostile && mob.type !== 'skeleton' && mob.type !== 'stray' && !creeperNear) {
        mob.targetYaw = Math.atan2(dx, dz);
      }

      if (mob.fleeTicks > 0) mob.fleeTicks--;
      const tamedWolf = mob.type === 'wolf' && mob.tamed;
      const sittingWolf = tamedWolf && mob.sitting;
      const followingLeash = mob.leashHolder === 'player' && distance > 2.5;
      const fleeing = mob.type !== 'villager' && mob.type !== 'horse' && !tamedWolf &&
        !hostileType && mob.fleeTicks > 0;
      const followingOwner = ((tamedWolf && !sittingWolf) || followingLeash) && distance > 2.5;
      if (fleeing) mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
      else if (followingOwner) mob.targetYaw = Math.atan2(player.x - mob.x, player.z - mob.z);

      // Passive mobs now pause between short wandering bursts instead of
      // sliding and cycling their legs continuously while apparently idle.
      if (sittingWolf) {
        mob.moveTicks = 0;
        mob.pauseTicks = 120;
      } else if (hostile || fleeing || followingOwner) {
        mob.moveTicks = 2;
        mob.pauseTicks = 0;
      } else {
        mob.moveTicks = Math.max(0, (mob.moveTicks || 0) - 1);
        mob.pauseTicks = Math.max(0, (mob.pauseTicks || 0) - 1);
        if (mob.moveTicks === 0 && mob.pauseTicks === 0) {
          if (Math.random() < 0.58) {
            mob.moveTicks = 28 + Math.floor(Math.random() * 52);
            mob.targetYaw += (Math.random() - 0.5) * 2.2;
          } else {
            mob.pauseTicks = 65 + Math.floor(Math.random() * 125);
          }
        }
      }
      const moving = hostile || fleeing || followingOwner || mob.moveTicks > 0 || (mob.type === 'goat' && mob.ramWindup > 0);
      const speed = moving ? (mob.type === 'goat' && mob.ramTicks > 0 ? 0.20 : hostile ? mob.speed * profile.speedMultiplier : fleeing ? 0.105 : followingOwner ? 0.045 : mob.speed) : 0;
      if (moving || Math.abs(mob.knockbackX || 0) + Math.abs(mob.knockbackZ || 0) > 0.005) {
        mob.yaw += Math.atan2(Math.sin(mob.targetYaw - mob.yaw), Math.cos(mob.targetYaw - mob.yaw)) * (fleeing ? 0.38 : 0.12);
      }
      if (!creeperNear && !endermanWater && (moving || mob.knockbackX || mob.knockbackZ)) {
        const nx = mob.x + Math.sin(mob.yaw) * speed + (mob.knockbackX || 0);
        const nz = mob.z + Math.cos(mob.yaw) * speed + (mob.knockbackZ || 0);
        const ground = world.getHeight(Math.floor(nx), Math.floor(nz));
        const nextY = ground + 1;
        // Stop at walls and overhangs instead of moving through solid voxels.
        const canMove = (x, z) => {
          const h = world.getHeight(Math.floor(x), Math.floor(z));
          const y = h + 1;
          return h > -60 && world.getBlock(Math.floor(x), h, Math.floor(z)).block.solid &&
            Math.abs(y - mob.y) <= 1.05 && this._canOccupy(x, y, z);
        };
        if (canMove(nx, nz)) {
          mob.x = nx; mob.z = nz;
          mob.y += (nextY - mob.y) * 0.35;
        } else {
          const xFree = canMove(nx, mob.z), zFree = canMove(mob.x, nz);
          if (xFree) mob.x = nx;
          if (zFree) mob.z = nz;
          if (!xFree) mob.knockbackX *= -0.12;
          if (!zFree) mob.knockbackZ *= -0.12;

          // If both axes are blocked, look for a nearby safe step around the
          // obstacle. This prevents hostile mobs from endlessly pushing into
          // the same wall while pursuing the player.
          if ((!xFree || !zFree) && mob.type === 'goat' && mob.ramTicks > 0 && (mob.hornsDropped || 0) < 2) {
            mob.hornsDropped = (mob.hornsDropped || 0) + 1;
            mob.ramTicks = 0;
            mob.ramCooldown = 600;
            const horn = ITEMS.get('mc:goat_horn');
            if (horn) this.spawnItemStackAt(new ItemStack(horn, 1), mob.x, mob.y + 0.8, mob.z);
            this.game.sounds?.play('hit', 'stone');
          }
          if (!xFree && !zFree && hostile) {
            mob.blockedTicks = (mob.blockedTicks || 0) + 1;
            if (mob.blockedTicks >= 3) {
              const options = [];
              for (const offset of [-Math.PI / 2, Math.PI / 2, -Math.PI / 3, Math.PI / 3, Math.PI]) {
                const yaw = mob.yaw + offset;
                const stepX = mob.x + Math.sin(yaw) * Math.max(speed, 0.045);
                const stepZ = mob.z + Math.cos(yaw) * Math.max(speed, 0.045);
                if (canMove(stepX, stepZ)) {
                  options.push({
                    yaw,
                    distance: Math.hypot(player.x - stepX, player.z - stepZ),
                    walkable: true,
                  });
                }
              }
              const detour = chooseMobDetourYaw(mob.yaw, mob.targetYaw, options);
              mob.targetYaw = detour ?? (mob.targetYaw + (mob.id % 2 ? 1 : -1) * Math.PI / 2);
              mob.blockedTicks = 0;
            }
          } else {
            mob.blockedTicks = 0;
          }
        }
        mob.knockbackX = (mob.knockbackX || 0) * 0.72;
        mob.knockbackZ = (mob.knockbackZ || 0) * 0.72;
        if (Math.abs(mob.knockbackX) < 0.006) mob.knockbackX = 0;
        if (Math.abs(mob.knockbackZ) < 0.006) mob.knockbackZ = 0;
      }
      if (moving) mob.walkPhase += speed * (hostile ? 12 : 8);
      mob.anim.walk = mob.walkPhase;
      mob.anim.walking = moving;

      if (mob.type === 'goat' && mob.ramTicks > 0 && distance < 1.45) {
        this._damagePlayer(4, mob.x, mob.z);
        const force = 0.22 / Math.max(distance, 0.25);
        player.vx += dx * force; player.vz += dz * force;
        mob.ramTicks = 0;
        mob.ramCooldown = 600;
      }

      // Skeletons and strays keep their distance and fire ranged attacks.
      if (profile?.rangedRange && hostile && distance < profile.rangedRange && distance > 3) {
        mob.attackTicks++;
        mob.anim.attack = Math.min(1, mob.attackTicks / 18);
        if (mob.attackTicks >= profile.attackCooldown) {
          mob.attackTicks = 0; mob.anim.attack = 0;
          this._damagePlayer(mob.type === 'blaze' ? 6 : profile.damage, mob.x, mob.z);
          if (mob.type === 'stray') { player.vx *= 0.72; player.vz *= 0.72; }
          const hitMessage = mob.type === 'blaze' ? 'Блейз попал огненным зарядом!' : mob.type === 'stray' ? 'Странник попал в тебя!' : 'Скелет попал в тебя!';
          this.game.ui?.toast(hitMessage, { error: true, duration: 1000 });
        }
        mob.targetYaw = Math.atan2(dx, dz);
      } else if (hostile && distance < (profile?.meleeRange ?? 1.35) && mob.type !== 'creeper') {
        mob.attackTicks++;
        mob.anim.attack = Math.min(1, mob.attackTicks / 10);
        if (mob.attackTicks >= (profile?.attackCooldown ?? 40)) {
          mob.attackTicks = 0; mob.anim.attack = 0;
          this._damagePlayer(profile?.damage ?? 1, mob.x, mob.z);
          player.vx += (dx / Math.max(distance, 0.01)) * 0.12;
          player.vz += (dz / Math.max(distance, 0.01)) * 0.12;
          this.game.ui?.toast(mob.type + ' атаковал тебя!', { error: true, duration: 1100 });
        }
      } else if (!hostile) {
        mob.attackTicks = 0; mob.anim.attack = 0;
      }

      if (mob.health <= 0) {
        for (const drop of rollMobDrops(mob.type)) this.game.inventory?.addItem(drop.id, drop.count);
        this._dropMobExperience(mob);
        this.mobs.splice(i, 1);
        continue;
      }
      if (distance > 42) this.mobs.splice(i, 1);
    }
  }
}

// Channeling and crossbow projectile integrations are validated in ranged_weapons_advancements.test.js.
