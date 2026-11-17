/**
 * Lightweight voxel creature simulation. Mobs use deterministic game ticks,
 * ground-following movement and simple species-specific behaviour.
 */
export class MobSystem {
  constructor(game) {
    this.game = game;
    this.mobs = [];
    this.spawnTicks = 0;
    this.nextId = 1;
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
    });
  }

  tick() {
    const world = this.game.world;
    const player = this.game.player;
    if (!world || !player) return;
    this.spawnTicks++;
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

      const hostile = mob.type === 'zombie' && distance < 12;
      const speed = hostile ? 0.035 : mob.speed;
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
