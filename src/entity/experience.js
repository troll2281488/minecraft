/** Java Edition experience level curve and per-player XP progress. */
export function experienceToNextLevel(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  if (value < 16) return 2 * value + 7;
  if (value < 32) return 5 * value - 38;
  return 9 * value - 158;
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
