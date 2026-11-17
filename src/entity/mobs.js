/**
 * Lightweight voxel creature simulation. Mobs use deterministic game ticks,
 * ground-following movement and simple species-specific behaviour.
 */
export function rollMobDrops(type, random = Math.random) {
  const amount = (min, max) => min + Math.floor(random() * (max - min + 1));
  if (type === 'pig') return [{ id: 'mc:raw_porkchop', count: amount(1, 3) }];
  if (type === 'sheep') return [{ id: 'mc:raw_mutton', count: amount(1, 2) }];
  if (type === 'zombie') {
    const count = amount(0, 2);
    return count ? [{ id: 'mc:rotten_flesh', count }] : [];
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
  }

  reset() {
    this.mobs.length = 0;
    this.spawnTicks = 0;
  }

  _spawn(type, x, z) {
    const world = this.game.world;
    const y = world.getHeight(x, z) + 1;
    if (y < -60 || !world.getBlock(x, y - 1, z).block.solid) return;
    this.mobs.push({
      id: this.nextId++, type, x: x + 0.5, y, z: z + 0.5,
      yaw: Math.random() * Math.PI * 2,
      targetYaw: Math.random() * Math.PI * 2,
      speed: type === 'zombie' ? 0.035 : 0.018,
      thinkTicks: 0, attackTicks: 0, walkPhase: Math.random() * 6,
      health: type === 'zombie' ? 20 : type === 'pig' ? 10 : 8,
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
      const dot = (dx * look[0] + dy * look[1] + dz * look[2]) / distance;
      if (dot < 0.82) continue;
      best = mob;
      bestDistance = distance;
    }
    return best;
  }

  attackFromPlayer() {
    const mob = this.targetedMob();
    if (!mob) return false;
    if (this.attackCooldown > 0) return true;
    const player = this.game.player;
    const held = this.game.inventory?.held;
    const damage = Math.max(1, held?.item?.attackDamage || 1);
    mob.health = Math.max(0, mob.health - damage);
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
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.spawnTicks >= 240 && this.mobs.length < 9) {
      this.spawnTicks = 0;
      const angle = Math.random() * Math.PI * 2;
      const distance = 7 + Math.random() * 10;
      const x = Math.floor(player.x + Math.cos(angle) * distance);
      const z = Math.floor(player.z + Math.sin(angle) * distance);
      if (world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) {
        const type = Math.random() < 0.38 && this.game.daylight < 0.55 ? 'zombie' : (Math.random() < 0.5 ? 'sheep' : 'pig');
        this._spawn(type, x, z);
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.thinkTicks--;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      if (mob.type === 'zombie' && distance < 12) {
        mob.targetYaw = Math.atan2(dx, dz);
      } else if (mob.thinkTicks <= 0) {
        mob.targetYaw += (Math.random() - 0.5) * 2.2;
        mob.thinkTicks = 35 + Math.floor(Math.random() * 70);
      }

      const hostile = mob.type === 'zombie' && player.gamemode === 'survival' && distance < 12;
      const fleeing = mob.type !== 'zombie' && distance < 4;
      if (fleeing) mob.targetYaw = Math.atan2(mob.x - player.x, mob.z - player.z);
      const speed = hostile ? 0.035 : fleeing ? 0.045 : mob.speed;
      mob.yaw += Math.atan2(Math.sin(mob.targetYaw - mob.yaw), Math.cos(mob.targetYaw - mob.yaw)) * 0.12;
      const nx = mob.x + Math.sin(mob.yaw) * speed;
      const nz = mob.z + Math.cos(mob.yaw) * speed;
      const ground = world.getHeight(Math.floor(nx), Math.floor(nz));
      if (ground > -60 && world.getBlock(Math.floor(nx), ground, Math.floor(nz)).block.solid) {
        mob.x = nx;
        mob.z = nz;
        mob.y += (ground + 1 - mob.y) * 0.35;
      }
      mob.walkPhase += speed * 8;

      if (hostile && distance < 1.25) {
        mob.attackTicks++;
        if (mob.attackTicks >= 40) {
          mob.attackTicks = 0;
          player.health = Math.max(0, player.health - 1);
          player.vx += (dx / Math.max(distance, 0.01)) * 0.12;
          player.vz += (dz / Math.max(distance, 0.01)) * 0.12;
          this.game.ui.toast('Зомби атаковал тебя!', { error: true, duration: 1100 });
        }
      } else {
        mob.attackTicks = 0;
      }

      if (distance > 42) this.mobs.splice(i, 1);
    }
  }
}
