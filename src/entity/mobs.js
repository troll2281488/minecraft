import { ItemStack } from '../world/item.js';

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
});

export const MOB_TYPES_112 = Object.freeze([
  'bat','blaze','cave_spider','chicken','cow','creeper','donkey','elder_guardian',
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
  if (type === 'skeleton' || type === 'stray') return [{ id: 'mc:bone', count: amount(0, 2) }];
  if (type === 'creeper') return [{ id: 'mc:gunpowder', count: amount(0, 2) }];
  if (type === 'spider' || type === 'cave_spider') return [{ id: 'mc:string', count: amount(0, 2) }];
  if (type === 'enderman') return [{ id: 'mc:ender_pearl', count: amount(0, 1) }];
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
    this.droppedItems = [];
    this.spawnTicks = 0;
    this.nextId = 1;
    this.attackCooldown = 0;
    this.fishing = null;
  }

  reset() {
    this.mobs.length = 0;
    this.droppedItems.length = 0;
    this.spawnTicks = 0;
    this.nextId = 1;
    this.fishing = null;
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
    return this.mobs.map((mob) => ({
      id: mob.id,
      type: mob.type,
      x: mob.x, y: mob.y, z: mob.z,
      yaw: mob.yaw,
      targetYaw: mob.targetYaw,
      health: mob.health,
      sheared: !!mob.sheared,
      fuseTicks: mob.fuseTicks || 0,
      walkPhase: mob.walkPhase || 0,
      ageTicks: Number.isFinite(mob.ageTicks) ? mob.ageTicks : 0,
      loveTicks: mob.loveTicks || 0,
      breedCooldown: mob.breedCooldown || 0,
    }));
  }

  /** Restore only known, finite mob state; malformed save entries are ignored. */
  loadFrom(entries) {
    this.mobs.length = 0;
    if (!Array.isArray(entries)) {
      this.nextId = 1;
      return;
    }
    const valid = entries.slice(0, 128).filter((mob) =>
      mob && MOB_TYPES_112.includes(mob.type) &&
      ['x', 'y', 'z', 'yaw', 'health'].every((key) => Number.isFinite(mob[key])) &&
      mob.y >= -64 && mob.y <= 320 && mob.health > 0 && mob.health <= 2048
    );
    for (const mob of valid) {
      this.mobs.push({
        id: Number.isSafeInteger(mob.id) && mob.id > 0 ? mob.id : this.mobs.length + 1,
        type: mob.type,
        x: mob.x, y: mob.y, z: mob.z,
        yaw: mob.yaw,
        targetYaw: Number.isFinite(mob.targetYaw) ? mob.targetYaw : mob.yaw,
        speed: ['zombie','skeleton','stray','creeper','spider'].includes(mob.type) ? 0.035 : mob.type === 'enderman' ? 0.045 : 0.018,
        thinkTicks: 0, attackTicks: 0,
        walkPhase: Number.isFinite(mob.walkPhase) ? mob.walkPhase : 0,
        moveTicks: Number.isFinite(mob.moveTicks) ? Math.max(0, mob.moveTicks) : 0,
        pauseTicks: Number.isFinite(mob.pauseTicks) ? Math.max(0, mob.pauseTicks) : 0,
        ageTicks: Number.isFinite(mob.ageTicks) ? Math.max(-24000, Math.min(0, mob.ageTicks)) : 0,
        loveTicks: Number.isFinite(mob.loveTicks) ? Math.max(0, Math.min(600, mob.loveTicks)) : 0,
        breedCooldown: Number.isFinite(mob.breedCooldown) ? Math.max(0, Math.min(6000, mob.breedCooldown)) : 0,
        health: mob.health,
        sheared: !!mob.sheared,
        hurtTicks: 0,
        knockbackX: 0, knockbackZ: 0,
        fuseTicks: Number.isFinite(mob.fuseTicks) ? Math.max(0, Math.min(30, mob.fuseTicks)) : 0,
        anim: { walk: 0, idle: 0, attack: 0, hurt: 0, fuse: 0 },
      });
    }
    this.nextId = this.mobs.reduce((next, mob) => Math.max(next, mob.id + 1), 1);
  }

  _spawn(type, x, z) {
    const world = this.game.world;
    const y = world.getHeight(x, z) + 1;
    if (y < -60 || !world.getBlock(x, y - 1, z).block.solid) return false;
    const feet = world.getBlock(x, y, z).block;
    const head = world.getBlock(x, y + 1, z).block;
    if (feet.solid || head.solid || feet.id === 'mc:water' || head.id === 'mc:water') return false;
    this.mobs.push({
      id: this.nextId++, type, x: x + 0.5, y, z: z + 0.5,
      yaw: Math.random() * Math.PI * 2,
      targetYaw: Math.random() * Math.PI * 2,
      speed: ['zombie','skeleton','stray','spider','creeper'].includes(type) ? 0.035 : type === 'enderman' ? 0.045 : 0.018,
      thinkTicks: 0, attackTicks: 0, walkPhase: Math.random() * 6,
      moveTicks: 0, pauseTicks: 45 + Math.floor(Math.random() * 100),
      health: ({ zombie:20, skeleton:20, stray:20, creeper:20, enderman:40, spider:16, cow:10, pig:10, chicken:4, sheep:8 })[type] ?? 10,
      sheared: false, hurtTicks: 0, fuseTicks: 0,
      ageTicks: 0, loveTicks: 0, breedCooldown: 0,
      anim: { walk: 0, idle: Math.random() * Math.PI * 2, attack: 0, hurt: 0, fuse: 0 },
    });
    return true;
  }


  /** Spawn a supported creature from a creative egg on the clicked block. */
  spawnFromEgg(type, x, z) {
    if (!['cow','pig','sheep','chicken','zombie','skeleton','stray','creeper','enderman','spider','cave_spider'].includes(type)) return false;
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
    this.game.sounds?.play('reel');
    this.game.sounds?.play('catch');
    this.fishing = null;
    this.game.ui?.toast('Поймано: ' + caught.id.replace('mc:', ''));
    return true;
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
    if (!mob || mob.type !== 'sheep' || mob.sheared || held?.item?.tool !== 'shears') return false;
    const drops = shearSheep(mob);
    for (const drop of drops) {
      const leftover = this.game.inventory.addItem(drop.id, drop.count);
      if (leftover > 0) this.game.ui?.toast('Inventory full: ' + leftover + ' wool not collected', { error: true });
    }
    if (this.game.player?.gamemode !== 'creative') this.game.inventory.damageHeld(1);
    this.game.ui?.toast('Sheep sheared');
    return true;
  }

  _damagePlayer(amount) {
    const player = this.game.player;
    if (!player || player.gamemode !== 'survival' || amount <= 0) return 0;
    const inventory = this.game.inventory;
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
    if (finalDamage > 0) this.game.sounds?.play('hurt');
    player.health = Math.max(0, player.health - finalDamage);
    return finalDamage;
  }

  attackFromPlayer() {
    const mob = this.targetedMob();
    if (!mob) return false;
    if (this.attackCooldown > 0) return true;
    const player = this.game.player;
    const held = this.game.inventory?.held;
    const damage = Math.max(1, held?.item?.attackDamage || 1);
    mob.health = Math.max(0, mob.health - damage);
    this.game.sounds?.play('hit');
    mob.hurtTicks = 10;
    mob.anim.hurt = 1;
    this.attackCooldown = 10;
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    const length = Math.max(0.01, Math.hypot(dx, dz));
    // A visible hit impulse: mobs slide away for several ticks instead of
    // receiving a single tiny position nudge that their AI immediately cancels.
    mob.knockbackX = (dx / length) * 0.82;
    mob.knockbackZ = (dz / length) * 0.82;
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
      this.mobs.splice(this.mobs.indexOf(mob), 1);
      this.game.ui?.toast(mob.type + ' defeated');
    }
    return true;
  }

  tick() {
    const world = this.game.world;
    const player = this.game.player;
    if (!world || !player) return;
    this._tickDroppedItems();
    this.spawnTicks++;
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
        if (night) {
          const snowy = ['mc:snowy_plains','mc:snowy_taiga','mc:ice_spikes','mc:frozen_ocean','mc:deep_frozen_ocean'].includes(biome);
          type = snowy
            ? (roll < 0.24 ? 'stray' : roll < 0.43 ? 'skeleton' : roll < 0.62 ? 'zombie' : roll < 0.76 ? 'spider' : roll < 0.86 ? 'creeper' : 'enderman')
            : (roll < 0.17 ? 'zombie' : roll < 0.29 ? 'skeleton' : roll < 0.39 ? 'creeper' : roll < 0.48 ? 'spider' : roll < 0.53 ? 'enderman' : roll < 0.66 ? 'sheep' : roll < 0.78 ? 'pig' : roll < 0.9 ? 'cow' : 'chicken');
        } else {
          const dry = ['mc:desert','mc:mesa','mc:wooded_badlands','mc:eroded_badlands','mc:savanna','mc:savanna_plateau','mc:shattered_savanna'].includes(biome);
          const jungle = ['mc:jungle','mc:sparse_jungle','mc:bamboo_jungle'].includes(biome);
          const cold = ['mc:snowy_plains','mc:snowy_taiga','mc:ice_spikes','mc:taiga','mc:mega_taiga','mc:giant_spruce_taiga'].includes(biome);
          if (biome === 'mc:mushroom_island') {
            type = roll < 0.78 ? 'cow' : roll < 0.9 ? 'sheep' : 'chicken';
          } else if (dry) {
            type = roll < 0.48 ? 'sheep' : roll < 0.78 ? 'chicken' : 'pig';
          } else if (jungle) {
            type = roll < 0.42 ? 'chicken' : roll < 0.76 ? 'pig' : 'sheep';
          } else if (cold) {
            type = roll < 0.48 ? 'sheep' : roll < 0.76 ? 'pig' : 'chicken';
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
      if (mob.loveTicks > 0) mob.loveTicks--;
      if (mob.breedCooldown > 0) mob.breedCooldown--;
      mob.thinkTicks--;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      mob.anim.idle += 0.045;
      mob.anim.walk = mob.walkPhase;
      if (mob.hurtTicks > 0) mob.hurtTicks--;
      mob.anim.hurt = mob.hurtTicks > 0 ? mob.hurtTicks / 8 : 0;

      const profile = MOB_AI_PROFILES[mob.type] ?? null;
      const hostileType = profile !== null;
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
            this._damagePlayer(damage);
            const knock = 0.35 / Math.max(distance, 0.2);
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
      const fleeing = !hostileType && (distance < 4 || mob.fleeTicks > 0);
      if (fleeing) mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);

      // Passive mobs now pause between short wandering bursts instead of
      // sliding and cycling their legs continuously while apparently idle.
      if (hostile || fleeing) {
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
      const moving = hostile || fleeing || mob.moveTicks > 0;
      const speed = moving ? (hostile ? mob.speed * profile.speedMultiplier : fleeing ? 0.105 : mob.speed) : 0;
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
          this._damagePlayer(profile.damage);
          if (mob.type === 'stray') { player.vx *= 0.72; player.vz *= 0.72; }
          this.game.ui?.toast(mob.type === 'stray' ? 'Странник попал в тебя!' : 'Скелет попал в тебя!', { error: true, duration: 1000 });
        }
        mob.targetYaw = Math.atan2(dx, dz);
      } else if (hostile && distance < (profile?.meleeRange ?? 1.35) && mob.type !== 'creeper') {
        mob.attackTicks++;
        mob.anim.attack = Math.min(1, mob.attackTicks / 10);
        if (mob.attackTicks >= (profile?.attackCooldown ?? 40)) {
          mob.attackTicks = 0; mob.anim.attack = 0;
          this._damagePlayer(profile?.damage ?? 1);
          player.vx += (dx / Math.max(distance, 0.01)) * 0.12;
          player.vz += (dz / Math.max(distance, 0.01)) * 0.12;
          this.game.ui?.toast(mob.type + ' атаковал тебя!', { error: true, duration: 1100 });
        }
      } else if (!hostile) {
        mob.attackTicks = 0; mob.anim.attack = 0;
      }

      if (mob.health <= 0) {
        for (const drop of rollMobDrops(mob.type)) this.game.inventory?.addItem(drop.id, drop.count);
        this.mobs.splice(i, 1);
        continue;
      }
      if (distance > 42) this.mobs.splice(i, 1);
    }
  }
}
