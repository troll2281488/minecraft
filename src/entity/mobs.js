/**
 * Lightweight voxel creature simulation. Mobs use deterministic game ticks,
 * ground-following movement and simple species-specific behaviour.
 */
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
    this.spawnTicks = 0;
    this.nextId = 1;
    this.attackCooldown = 0;
    this.fishing = null;
  }

  reset() {
    this.mobs.length = 0;
    this.spawnTicks = 0;
    this.fishing = null;
  }

  _spawn(type, x, z) {
    const world = this.game.world;
    const y = world.getHeight(x, z) + 1;
    if (y < -60 || !world.getBlock(x, y - 1, z).block.solid) return;
    this.mobs.push({
      id: this.nextId++, type, x: x + 0.5, y, z: z + 0.5,
      yaw: Math.random() * Math.PI * 2,
      targetYaw: Math.random() * Math.PI * 2,
      speed: ['zombie','skeleton','stray','spider','creeper'].includes(type) ? 0.035 : type === 'enderman' ? 0.045 : 0.018,
      thinkTicks: 0, attackTicks: 0, walkPhase: Math.random() * 6,
      health: ({ zombie:20, skeleton:20, stray:20, creeper:20, enderman:40, spider:16, cow:10, pig:10, chicken:4, sheep:8 })[type] ?? 10,
      sheared: false, hurtTicks: 0, fuseTicks: 0,
      anim: { walk: 0, idle: Math.random() * Math.PI * 2, attack: 0, hurt: 0, fuse: 0 },
    });
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

  _waterInSight(maxDistance = 6) {
    const player = this.game.player;
    if (!player || !this.game.world) return false;
    const yaw = player.yaw * Math.PI / 180;
    const pitch = player.pitch * Math.PI / 180;
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = -Math.sin(pitch);
    const dz = Math.cos(yaw) * Math.cos(pitch);
    for (let distance = 0.2; distance <= maxDistance; distance += 0.15) {
      const x = Math.floor(player.x + dx * distance);
      const y = Math.floor(player.eyeY + dy * distance);
      const z = Math.floor(player.z + dz * distance);
      const block = this.game.world.getBlock(x, y, z).block;
      if (block.id === 'mc:water') return true;
      if (block.solid) return false;
    }
    return false;
  }

  useFishingRod() {
    const stack = this.game.inventory?.held;
    if (stack?.item?.id !== 'mc:fishing_rod' || this.game.player?.gamemode !== 'survival') return false;
    if (!this.fishing) {
      if (!this._waterInSight()) {
        this.game.ui?.toast('Aim at water to cast the fishing line');
        return true;
      }
      this.fishing = { ticks: 80 + Math.floor(Math.random() * 121) };
      this.game.ui?.toast('Fishing line cast');
      return true;
    }
    if (this.fishing.ticks > 0) {
      this.fishing = null;
      this.game.ui?.toast('Fishing line reeled in too early');
      return true;
    }
    const caught = rollFishingCatch();
    const leftover = this.game.inventory.addItem(caught.id, caught.count);
    if (leftover > 0) this.game.ui?.toast('Inventory full: catch not collected', { error: true });
    this.game.inventory.damageHeld(1);
    this.fishing = null;
    this.game.ui?.toast('Caught ' + caught.id.replace('mc:', ''));
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
      if (stack.item.isDamageable && stack.applyDamage(1)) {
        inventory.slots[36 + i] = inventory.slots[36 + i].constructor.EMPTY.clone();
      }
    }
    if (worn && inventory) inventory.version++;
    const finalDamage = calculateArmorDamage(amount, armorPoints, toughness);
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
    mob.hurtTicks = 8;
    this.attackCooldown = 10;
    const dx = mob.x - player.x;
    const dz = mob.z - player.z;
    const length = Math.max(0.01, Math.hypot(dx, dz));
    mob.x += dx / length * 0.12;
    mob.z += dz / length * 0.12;
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
    this.spawnTicks++;
    if (this.fishing && this.fishing.ticks > 0) this.fishing.ticks--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.spawnTicks >= 240 && this.mobs.length < 9) {
      this.spawnTicks = 0;
      const angle = Math.random() * Math.PI * 2;
      const distance = 7 + Math.random() * 10;
      const x = Math.floor(player.x + Math.cos(angle) * distance);
      const z = Math.floor(player.z + Math.sin(angle) * distance);
      if (world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) {
        const roll = Math.random();
        const night = this.game.daylight < 0.55;
        const type = night
          ? (roll < 0.24 ? 'zombie' : roll < 0.39 ? 'skeleton' : roll < 0.52 ? 'creeper' : roll < 0.62 ? 'spider' : roll < 0.67 ? 'enderman' : roll < 0.79 ? 'sheep' : roll < 0.86 ? 'pig' : roll < 0.94 ? 'cow' : 'chicken')
          : (roll < 0.28 ? 'sheep' : roll < 0.50 ? 'pig' : roll < 0.76 ? 'cow' : 'chicken');
        this._spawn(type, x, z);
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.thinkTicks--;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      mob.anim.idle += 0.045;
      mob.anim.walk = mob.walkPhase;
      if (mob.hurtTicks > 0) mob.hurtTicks--;
      mob.anim.hurt = mob.hurtTicks > 0 ? mob.hurtTicks / 8 : 0;

      const hostileType = ['zombie','skeleton','stray','creeper','spider','enderman'].includes(mob.type);
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

      const creeperNear = mob.type === 'creeper' && player.gamemode === 'survival' && distance < 3 && distance > 0.01;
      if (creeperNear) {
        mob.fuseTicks = Math.min(30, mob.fuseTicks + 1);
        mob.anim.fuse = mob.fuseTicks / 30;
        mob.targetYaw = Math.atan2(dx, dz);
        if (mob.fuseTicks >= 30) {
          if (distance < 4) {
            const damage = Math.max(0, Math.ceil((4 - distance) * 3));
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
        distance < ((mob.type === 'skeleton' || mob.type === 'stray') ? 16 : 12) &&
        (mob.type !== 'enderman' || endermanAngry || distance < 2.5);
      if (hostile && mob.type !== 'skeleton' && mob.type !== 'stray' && !creeperNear) {
        mob.targetYaw = Math.atan2(dx, dz);
      } else if (!hostile && mob.thinkTicks <= 0) {
        mob.targetYaw += (Math.random() - 0.5) * 2.2;
        mob.thinkTicks = 35 + Math.floor(Math.random() * 70);
      }

      const fleeing = !hostileType && distance < 4;
      if (fleeing) mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
      const speed = hostile ? (mob.type === 'spider' ? 0.052 : mob.speed) : fleeing ? 0.045 : mob.speed;
      mob.yaw += Math.atan2(Math.sin(mob.targetYaw - mob.yaw), Math.cos(mob.targetYaw - mob.yaw)) * 0.12;
      if (!creeperNear && !endermanWater) {
        const nx = mob.x + Math.sin(mob.yaw) * speed;
        const nz = mob.z + Math.cos(mob.yaw) * speed;
        const ground = world.getHeight(Math.floor(nx), Math.floor(nz));
        if (ground > -60 && world.getBlock(Math.floor(nx), ground, Math.floor(nz)).block.solid) {
          mob.x = nx; mob.z = nz;
          mob.y += (ground + 1 - mob.y) * 0.35;
        }
      }
      mob.walkPhase += speed * (hostile ? 12 : 8);
      mob.anim.walk = mob.walkPhase;

      // Skeletons and strays keep their distance and fire ranged attacks.
      if ((mob.type === 'skeleton' || mob.type === 'stray') && hostile && distance < 14 && distance > 3) {
        mob.attackTicks++;
        mob.anim.attack = Math.min(1, mob.attackTicks / 18);
        if (mob.attackTicks >= 55) {
          mob.attackTicks = 0; mob.anim.attack = 0;
          this._damagePlayer(2);
          this.game.ui?.toast(mob.type === 'stray' ? 'Странник попал в тебя!' : 'Скелет попал в тебя!', { error: true, duration: 1000 });
        }
        mob.targetYaw = Math.atan2(dx, dz);
      } else if (hostile && distance < 1.35 && mob.type !== 'creeper') {
        mob.attackTicks++;
        mob.anim.attack = Math.min(1, mob.attackTicks / 10);
        if (mob.attackTicks >= (mob.type === 'spider' ? 28 : 40)) {
          mob.attackTicks = 0; mob.anim.attack = 0;
          this._damagePlayer(mob.type === 'enderman' ? 4 : 1);
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
