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


/** Java 1.19 experience released by mining eligible ore blocks. */
export function experienceForBlock(blockId, random = Math.random) {
  const ranges = {
    'mc:coal_ore': [0, 2], 'mc:deepslate_coal_ore': [0, 2],
    'mc:lapis_ore': [2, 5], 'mc:deepslate_lapis_ore': [2, 5],
    'mc:redstone_ore': [1, 5], 'mc:deepslate_redstone_ore': [1, 5],
    'mc:diamond_ore': [3, 7], 'mc:deepslate_diamond_ore': [3, 7],
    'mc:emerald_ore': [3, 7], 'mc:deepslate_emerald_ore': [3, 7],
    'mc:nether_quartz_ore': [2, 5], 'mc:nether_gold_ore': [0, 1],
  };
  const range = ranges[blockId];
  if (!range) return 0;
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return range[0] + Math.floor(roll * (range[1] - range[0] + 1));
}

/** Merge only equal-value orbs, retaining the newest lifetime and total pickup count. */
export function mergeExperienceOrbState(primary, other) {
  if (!primary || !other || primary === other || primary.value !== other.value) return false;
  primary.count = Math.min(32767, Math.max(1, primary.count || 1) + Math.max(1, other.count || 1));
  primary.age = Math.min(Math.max(0, primary.age || 0), Math.max(0, other.age || 0));
  return true;
}

/** XP orbs are destroyed by fire, lava and cactus contact in Java Edition. */
export function isExperienceOrbHazard(blockId) {
  return blockId === 'mc:fire' || blockId === 'mc:soul_fire' ||
    blockId === 'mc:lava' || blockId === 'mc:cactus';
}


function randomExperienceInRange(min, max, random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

/** XP awarded for a successful fishing catch in Java Edition. */
export function experienceForFishing(random = Math.random) {
  return randomExperienceInRange(1, 6, random);
}

/** XP orbs released when two adult animals successfully breed. */
export function experienceForBreeding(random = Math.random) {
  return randomExperienceInRange(1, 7, random);
}

/** XP released for a completed villager trade (before any breeding bonus). */
export function experienceForVillagerTrade(random = Math.random, leveledUp = false) {
  return randomExperienceInRange(3, 6, random) + (leveledUp ? 5 : 0);
}
