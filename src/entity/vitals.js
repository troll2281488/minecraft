/**
 * Survival food, saturation and exhaustion.
 *
 * This is the player-side vanilla food loop. Food restoration items are added
 * separately; until then new players start with a full bar.
 */
export const FOOD = Object.freeze({
  MAX: 20,
  MAX_SATURATION: 20,
  EXHAUSTION_THRESHOLD: 4,
  SPRINT_PER_BLOCK: 0.1,
  SPRINT_JUMP: 0.2,
  JUMP: 0.05,
  REGEN_FOOD: 18,
  REGEN_INTERVAL: 80,
  FAST_REGEN_INTERVAL: 10,
  STARVE_INTERVAL: 80,
});

export class PlayerVitals {
  constructor() {
    this.food = FOOD.MAX;
    this.saturation = FOOD.MAX;
    this.exhaustion = 0;
    this.regenTicks = 0;
    this.starveTicks = 0;
  }

  addExhaustion(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.exhaustion = Math.min(40, this.exhaustion + amount);
  }

  tick(player, distance = 0, sprinting = false, jumped = false) {
    if (player.gamemode !== 'survival') return;
    if (sprinting) this.addExhaustion(distance * FOOD.SPRINT_PER_BLOCK);
    if (jumped) this.addExhaustion(sprinting ? FOOD.SPRINT_JUMP : FOOD.JUMP);

    while (this.exhaustion >= FOOD.EXHAUSTION_THRESHOLD) {
      this.exhaustion -= FOOD.EXHAUSTION_THRESHOLD;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }

    if (this.food >= FOOD.REGEN_FOOD && player.health < 20) {
      this.regenTicks++;
      const interval = this.food === 20 && this.saturation > 0
        ? FOOD.FAST_REGEN_INTERVAL : FOOD.REGEN_INTERVAL;
      if (this.regenTicks >= interval) {
        player.health = Math.min(20, player.health + 1);
        this.addExhaustion(6);
        this.regenTicks = 0;
      }
    } else {
      this.regenTicks = 0;
    }

    if (this.food === 0) {
      this.starveTicks++;
      if (this.starveTicks >= FOOD.STARVE_INTERVAL) {
        // Normal difficulty: starvation cannot reduce health below half a heart.
        player.health = Math.max(1, player.health - 1);
        this.starveTicks = 0;
      }
    } else {
      this.starveTicks = 0;
    }
  }

  toJSON() {
    return {
      food: this.food, saturation: this.saturation,
      exhaustion: this.exhaustion, regenTicks: this.regenTicks,
      starveTicks: this.starveTicks,
    };
  }

  loadFrom(data) {
    if (!data) return this;
    this.food = Math.max(0, Math.min(20, data.food ?? 20));
    this.saturation = Math.max(0, Math.min(this.food, data.saturation ?? this.food));
    this.exhaustion = Math.max(0, Math.min(40, data.exhaustion ?? 0));
    this.regenTicks = Math.max(0, data.regenTicks ?? 0);
    this.starveTicks = Math.max(0, data.starveTicks ?? 0);
    return this;
  }
}
