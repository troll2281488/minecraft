/** Java Edition experience level curve and per-player XP progress. */
export function experienceToNextLevel(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  if (value < 16) return 2 * value + 7;
  if (value < 31) return 5 * value - 38;
  return 9 * value - 158;
}

const ORB_VALUES = Object.freeze([2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1]);

/** Split an XP award into vanilla orb denominations, largest first. */
export function splitExperienceIntoOrbs(points) {
  let remaining = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const result = [];
  for (const value of ORB_VALUES) {
    while (remaining >= value) {
      result.push(value);
      remaining -= value;
    }
  }
  return result;
}

/** Java-like XP drops for the common mobs currently simulated by this project. */
export function experienceForMob(type, random = Math.random, mob = null) {
  if (mob?.baby === true || mob?.ageTicks < 0) return 0;
  const fixed = {
    zombie: 5, husk: 5, zombie_villager: 5, skeleton: 5, stray: 5,
    wither_skeleton: 5, creeper: 5, spider: 5, cave_spider: 5,
    enderman: 5, witch: 5, silverfish: 5, blaze: 10, ghast: 5,
    guardian: 10, elder_guardian: 10, evoker: 10, vindicator: 5,
    pillager: 5, ravager: 20, vex: 3, endermite: 3,
  };
  if (Object.hasOwn(fixed, type)) return fixed[type];
  if (['cow','pig','sheep','chicken','rabbit','mooshroom','horse','donkey','mule','wolf','polar_bear'].includes(type)) {
    return 1 + Math.floor(Math.max(0, Math.min(0.999999, random())) * 3);
  }
  if (type === 'slime' || type === 'magma_cube') {
    const size = Math.max(1, Math.min(4, Number(mob?.size) || 1));
    return size === 1 ? 1 : size === 2 ? 2 : 4;
  }
  return 0;
}

export class PlayerExperience {
  constructor() {
    this.level = 0;
    this.progress = 0;
    this.total = 0;
  }

  /** Add experience points and carry overflow through as many levels as needed. */
  add(points) {
    if (!Number.isFinite(points) || points <= 0) return 0;
    const awarded = Math.min(2147483647 - this.total, points);
    if (awarded <= 0) return 0;
    this.total += awarded;
    let remaining = this.progress * experienceToNextLevel(this.level) + awarded;
    while (this.level < 21863) {
      const required = experienceToNextLevel(this.level);
      if (remaining < required) break;
      remaining -= required;
      this.level++;
    }
    this.progress = this.level >= 21863
      ? 0
      : Math.max(0, Math.min(0.999999, remaining / experienceToNextLevel(this.level)));
    return awarded;
  }

  toJSON() {
    return { level: this.level, progress: this.progress, total: this.total };
  }

  loadFrom(data) {
    if (!data || typeof data !== 'object') return this;
    this.level = Number.isSafeInteger(data.level) ? Math.max(0, Math.min(21863, data.level)) : 0;
    this.progress = Number.isFinite(data.progress)
      ? Math.max(0, Math.min(0.999999, data.progress)) : 0;
    this.total = Number.isSafeInteger(data.total) ? Math.max(0, Math.min(2147483647, data.total)) : 0;
    return this;
  }
}
