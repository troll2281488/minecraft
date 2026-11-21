/**
 * Player status effects and drinkable potion definitions.
 * Durations use the Java 20-TPS tick clock and are persisted with player data.
 */
export const POTION_ITEMS = Object.freeze({
  'mc:potion_swiftness': Object.freeze({ effect: 'swiftness', duration: 3600, amplifier: 0 }),
  'mc:potion_strength': Object.freeze({ effect: 'strength', duration: 3600, amplifier: 0 }),
  'mc:potion_regeneration': Object.freeze({ effect: 'regeneration', duration: 900, amplifier: 0 }),
  'mc:potion_fire_resistance': Object.freeze({ effect: 'fire_resistance', duration: 3600, amplifier: 0 }),
  'mc:potion_healing': Object.freeze({ effect: 'instant_health', duration: 1, amplifier: 0, instant: 'healing' }),
  'mc:potion_poison': Object.freeze({ effect: 'poison', duration: 900, amplifier: 0 }),
  'mc:potion_water_breathing': Object.freeze({ effect: 'water_breathing', duration: 3600, amplifier: 0 }),
  'mc:potion_slow_falling': Object.freeze({ effect: 'slow_falling', duration: 1800, amplifier: 0 }),
  'mc:potion_leaping': Object.freeze({ effect: 'jump_boost', duration: 3600, amplifier: 0 }),
  'mc:potion_weakness': Object.freeze({ effect: 'weakness', duration: 1800, amplifier: 0 }),
});

const VALID_EFFECTS = new Set(['swiftness', 'strength', 'regeneration', 'fire_resistance', 'poison', 'water_breathing', 'slow_falling', 'jump_boost', 'weakness']);

export class PlayerStatusEffects {
  constructor() {
    this.active = new Map();
  }

  get size() { return this.active.size; }

  has(type) { return this.active.has(type); }

  amplifier(type) { return this.active.get(type)?.amplifier ?? 0; }

  apply(type, duration, amplifier = 0) {
    if (!VALID_EFFECTS.has(type) || !Number.isFinite(duration) || duration <= 0) return false;
    const next = {
      duration: Math.min(20 * 60 * 60, Math.floor(duration)),
      amplifier: Math.max(0, Math.min(4, Math.floor(amplifier) || 0)),
      ticks: 0,
    };
    const current = this.active.get(type);
    if (current && (current.amplifier > next.amplifier ||
        (current.amplifier === next.amplifier && current.duration >= next.duration))) return false;
    this.active.set(type, next);
    return true;
  }

  clear() {
    const changed = this.active.size > 0;
    this.active.clear();
    return changed;
  }

  tick(player) {
    for (const [type, effect] of this.active) {
      effect.duration--;
      effect.ticks++;
      if (type === 'poison' && effect.ticks % Math.max(1, 25 >> effect.amplifier) === 0 &&
          player.health > 1) {
        player.health = Math.max(1, player.health - 1);
      }
      if (type === 'regeneration' && effect.ticks % Math.max(1, 50 >> effect.amplifier) === 0 &&
          player.health > 0 && player.health < 20) {
        player.health = Math.min(20, player.health + 1);
      }
      if (effect.duration <= 0) this.active.delete(type);
    }
  }

  toJSON() {
    return [...this.active].map(([type, effect]) => ({
      type, duration: effect.duration, amplifier: effect.amplifier, ticks: effect.ticks,
    }));
  }

  loadFrom(records) {
    this.active.clear();
    if (!Array.isArray(records)) return this;
    for (const record of records.slice(0, 16)) {
      if (!VALID_EFFECTS.has(record?.type) || !Number.isFinite(record.duration) ||
          record.duration <= 0 || !Number.isFinite(record.amplifier)) continue;
      this.apply(record.type, record.duration, record.amplifier);
      const effect = this.active.get(record.type);
      if (effect) effect.ticks = Math.max(0, Math.min(1_000_000, Math.floor(record.ticks) || 0));
    }
    return this;
  }
}
