import { ItemStack } from '../world/item.js';
import { SPAWNER_MOB_TYPES, spawnerMobType, spawnerPlayerInRange, countSpawnerMobs, nextSpawnerDelay, spawnerSpawnPosition } from './spawners.js';
import { experienceForMob, experienceForFishing, experienceForBreeding, splitExperienceIntoOrbs, mergeExperienceOrbState, isExperienceOrbHazard } from './experience.js';
import { TerrainGenerator, villageCandidateForCell } from '../world/gen/terrain.js';
import { createVillagerProfile } from './villager_trades.js';
import { drawPower, canFire } from '../game/bow.js';
import { aimVector, createArrow, stepArrow } from './arrows.js';
import { tickBeeForaging } from '../game/bee_hives.js';

/**
 * Lightweight voxel creature simulation. Mobs use deterministic game ticks,
 * ground-following movement and simple species-specific behaviour.
 */
/**
 * Per-species combat and awareness tuning. These are game-only creature rules:
 * each hostile has a readable counterplay window instead of sharing one generic AI.
 */
/** Pick a walkable local detour that still trends toward the target. */
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
});

export const MOB_TYPES_112 = Object.freeze([
  'bat','bee','blaze','cave_spider','chicken','cow','creeper','donkey','elder_guardian',
  'ender_dragon','enderman','endermite','evoker','ghast','guardian','horse','husk','illusioner',
  'llama','magma_cube','mooshroom','mule','ocelot','parrot','pig','polar_bear',
  'rabbit','sheep','shulker','silverfish','skeleton','skeleton_horse','slime',
  'snow_golem','spider','squid','stray','vex','villager','vindicator','witch',
  'wither','wither_skeleton','wolf','zombie','zombie_horse','zombie_villager',
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

export function rollFishingCatch(random = Math.random) {
  const roll = random();
  if (roll < 0.60) return { id: 'mc:raw_cod', count: 1 };
  if (roll < 0.85) return { id: 'mc:raw_salmon', count: 1 };
  if (roll < 0.90) return { id: 'mc:pufferfish', count: 1 };
  if (roll < 0.95) return { id: 'mc:tropical_fish', count: 1 };
  if (roll < 0.98) return { id: 'mc:bone', count: 1 };
  return { id: 'mc:leather', count: 1 };
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

export function rollMobDrops(type, random = Math.random) {
  const amount = (min, max) => min + Math.floor(random() * (max - min + 1));
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
    if (random() < 0.025) drops.push({ id: random() < 0.5 ? 'mc:carrot' : 'mc:potato', count: 1 });
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
    if (!creative && inventory.remove('mc:arrow', 1) !== 1) {
      this.game.ui?.toast('Нужны стрелы!', { error: true });
      return true;
    }
    const player = this.game.player;
    const direction = aimVector(player.yaw, player.pitch);
    const power = drawPower(ticks);
    this.arrows.push(createArrow(
      player.x + direction[0] * 0.45,
      player.eyeY + direction[1] * 0.45,
      player.z + direction[2] * 0.45,
      direction, power,
    ));
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
      const result = stepArrow(arrow,
        (x, y, z) => world.getBlock(x, y, z).block.solid,
        this.mobs,
      );
      if (result.hit === 'mob' && result.mob) {
        const mob = result.mob;
        mob.health = Math.max(0, mob.health - (mob.type === 'horse' ? calculateHorseArmorDamage(arrow.damage, mob.horseArmor) : arrow.damage));
        mob.hurtTicks = 10;
        mob.anim.hurt = 1;
        mob.playerDamageTicks = 100;
        arrow.stuckMobId = mob.id;
        arrow.offsetX = arrow.x - mob.x; arrow.offsetY = arrow.y - mob.y; arrow.offsetZ = arrow.z - mob.z;
        arrow.done = false;
      } else if (result.hit === 'block') {
        arrow.stuck = true;
        arrow.stuckYaw = Math.atan2(-arrow.vx, arrow.vz);
        arrow.stuckPitch = Math.atan2(-arrow.vy, Math.hypot(arrow.vx, arrow.vz));
        arrow.vx = arrow.vy = arrow.vz = 0;
        arrow.done = false;
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
      beePollenTicks: Number.isFinite(mob.beePollenTicks) ? mob.beePollenTicks : 0,
      beeHiveWorkTicks: Number.isFinite(mob.beeHiveWorkTicks) ? mob.beeHiveWorkTicks : 0,
      beeSearchTicks: Number.isFinite(mob.beeSearchTicks) ? mob.beeSearchTicks : 0,
      sheared: !!mob.sheared,
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
        beePollenTicks: Number.isFinite(mob.beePollenTicks) ? Math.max(0, Math.min(600, mob.beePollenTicks)) : 0,
        beeHiveWorkTicks: Number.isFinite(mob.beeHiveWorkTicks) ? Math.max(0, Math.min(200, mob.beeHiveWorkTicks)) : 0,
        beeSearchTicks: Number.isFinite(mob.beeSearchTicks) ? Math.max(0, Math.min(20, mob.beeSearchTicks)) : 0,
        beeTarget: null,
        sheared: !!mob.sheared,
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
      health: ({ bee:10, zombie:20, husk:20, zombie_villager:20, skeleton:20, stray:20, wither_skeleton:20, creeper:20, enderman:40, spider:16, cave_spider:12, silverfish:8, endermite:8, slime:16, magma_cube:16, vex:14, vindicator:24, evoker:24, witch:26, blaze:20, ghast:10, guardian:30, elder_guardian:80, wither:300, cow:10, pig:10, chicken:4, sheep:8, mooshroom:10, rabbit:3, wolf:8, horse:30, polar_bear:30, villager:20 })[type] ?? 10,
      sheared: false, hurtTicks: 0, fuseTicks: 0,
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
    if (!['cow','pig','sheep','chicken','mooshroom','rabbit','wolf','horse','polar_bear','zombie','husk','zombie_villager','skeleton','stray','wither_skeleton','creeper','enderman','spider','cave_spider','silverfish','endermite','slime','magma_cube','vex','vindicator','evoker','witch','blaze','ghast','guardian','elder_guardian','wither','villager','bee'].includes(type)) return false;
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
        ticks: 110 + Math.floor(Math.random() * 100),
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
    const caught = rollFishingCatch();
    if (player.gamemode !== 'creative') {
      const leftover = this.game.inventory.addItem(caught.id, caught.count);
      if (leftover > 0) this.game.ui?.toast('Инвентарь заполнен: улов потерян', { error: true });
      this.game.inventory.damageHeld(1);
    }
    player.attackTime = 8;
    if (player.gamemode === 'survival') {
      this.spawnExperienceOrbs(experienceForFishing(), player.x, player.y + 0.65, player.z);
    }
    this.game.sounds?.play('reel');
    this.game.sounds?.play('catch');
    this.fishing = null;
    this.game.ui?.toast('Поймано: ' + caught.id.replace('mc:', ''));
    return true;
  }


  tameFromPlayer() {
    const mob = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!mob || !player || !['survival', 'creative'].includes(player.gamemode)) return false;

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

  feedAnimalFromPlayer() {
    const animal = this.targetedMob();
    const held = this.game.inventory?.held;
    const player = this.game.player;
    if (!animal || !player || !['survival', 'creative'].includes(player.gamemode)) return false;
    const creative = player.gamemode === 'creative';
    const foods = {
      cow: ['mc:wheat'], sheep: ['mc:wheat'],
      pig: ['mc:carrot', 'mc:potato'],
      chicken: ['mc:wheat_seeds', 'mc:pumpkin_seeds', 'mc:melon_seeds'],
    };
    const accepted = foods[animal.type];
    if (!accepted || !held?.item || !accepted.includes(held.item.id)) return false;
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
      health: ({ cow: 10, pig: 10, chicken: 4, sheep: 8 })[first.type] ?? 10,
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
      if (stack.item.isDamageable && stack.applyDamage(Math.max(1, Math.ceil(amount)))) {
        inventory.slots[36 + i] = ItemStack.EMPTY.clone();
      }
    }
    if (worn && inventory) inventory.version++;
    const finalDamage = calculateArmorDamage(amount, armorPoints, toughness);
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
    const damage = Math.max(1, held?.item?.attackDamage || 1);
    const finalDamage = mob.type === 'horse' ? calculateHorseArmorDamage(damage, mob.horseArmor) : damage;
    mob.health = Math.max(0, mob.health - finalDamage);
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
      for (const drop of rollMobDrops(mob.type)) {
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
        player.addExperience?.(orb.value);
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
      if (mob.playerDamageTicks > 0) mob.playerDamageTicks--;
      if (mob.loveTicks > 0) mob.loveTicks--;
      if (mob.breedCooldown > 0) mob.breedCooldown--;
      mob.thinkTicks--;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      if (distance > (this.game.simulationDistance || 6) * 16) continue;
      mob.anim.idle += 0.045;
      mob.anim.walk = mob.walkPhase;
      if (mob.hurtTicks > 0) mob.hurtTicks--;
      mob.anim.hurt = mob.hurtTicks > 0 ? mob.hurtTicks / 8 : 0;

      if (this.game.daylight > 0.82 && ['zombie', 'skeleton', 'stray'].includes(mob.type)) {
        const above = world.getBlock(Math.floor(mob.x), Math.floor(mob.y + 2), Math.floor(mob.z)).block;
        if (!above.solid && !above.liquid) {
          mob.sunBurnTicks = (mob.sunBurnTicks || 0) + 1;
          if (mob.sunBurnTicks >= 20) {
            mob.sunBurnTicks = 0;
            mob.health -= 2;
            mob.hurtTicks = 5;
          }
        } else mob.sunBurnTicks = 0;
      }

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
          if (distance < profile.blastRange) {
            const damage = Math.max(0, Math.ceil((profile.blastRange - distance) * 3));
            this._damagePlayer(damage, mob.x, mob.z);
            const knock = 0.11 / Math.max(distance, 0.2);
            player.vx += dx * knock; player.vz += dz * knock;
          }
          mob.health = 0;
        }
      } else if (mob.type === 'creeper' && mob.fuseTicks > 0) {
        mob.fuseTicks = Math.max(0, mob.fuseTicks - 2);
        mob.anim.fuse = mob.fuseTicks / 30;
      }

      const endermanAngry = mob.type === 'enderman' && targeted && distance < 16;
      const hostile = hostileType && player.gamemode === 'survival' &&
        distance < profile.detectionRange &&
        (mob.type !== 'enderman' || endermanAngry || distance < 2.5);
      if (hostile && mob.type !== 'skeleton' && mob.type !== 'stray' && !creeperNear) {
        mob.targetYaw = Math.atan2(dx, dz);
      }

      if (mob.fleeTicks > 0) mob.fleeTicks--;
      const tamedWolf = mob.type === 'wolf' && mob.tamed;
      const fleeing = mob.type !== 'villager' && mob.type !== 'horse' && !tamedWolf &&
        !hostileType && mob.fleeTicks > 0;
      const followingOwner = tamedWolf && distance > 2.5;
      if (fleeing) mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
      else if (followingOwner) mob.targetYaw = Math.atan2(player.x - mob.x, player.z - mob.z);

      // Passive mobs now pause between short wandering bursts instead of
      // sliding and cycling their legs continuously while apparently idle.
      if (hostile || fleeing || followingOwner) {
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
      const moving = hostile || fleeing || followingOwner || mob.moveTicks > 0;
      const speed = moving ? (hostile ? mob.speed * profile.speedMultiplier : fleeing ? 0.105 : followingOwner ? 0.045 : mob.speed) : 0;
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
