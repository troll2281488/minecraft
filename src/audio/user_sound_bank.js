/**
 * Lazy, local sound bank for the WAV files supplied in assets/sound_library.
 * Each clip is fetched and decoded only when first needed, then kept in memory.
 */
const ROOT = new URL('../../assets/sound_library/', import.meta.url);

const FILES = Object.freeze({
  break: { wood: 'block_break_wood.wav', grass: 'block_break_grass.wav', sand: 'block_break_sand.wav', stone: 'block_break_stone.wav' },
  place: 'block_place.wav',
  hit: 'block_hit.wav',
  step: { wood: 'step_wood.wav', grass: 'step_grass.wav', dirt: 'step_grass.wav', sand: 'step_sand.wav', stone: 'step_stone.wav' },
  hurt: 'player_hurt.wav', mobHurt: 'mob_hurt.wav', mobDeath: 'mob_death.wav',
  pickup: 'item_pickup.wav', drop: 'item_drop.wav', xp: 'xp_orb.wav', levelup: 'level_up.wav',
  shoot: 'bow_shoot.wav', bow: 'bow_shoot.wav', arrowHit: 'arrow_hit.wav',
  explode: 'explosion.wav', chestOpen: 'chest_open.wav', doorOpen: 'door_open.wav',
  equip: 'equip.wav', eat: 'eat.wav', cast: 'fishing_cast.wav', reel: 'fishing_catch.wav',
  bite: 'fishing_bite.wav', catch: 'fishing_catch.wav', note: 'note_block.wav',
  trade: 'villager_trade.wav', thunder: 'thunder.wav', water: 'water_splash.wav',
  click: 'ui_click.wav', toast: 'ui_toast.wav', creeper: 'creeper_fuse.wav',
  portal: 'portal_ambient.wav',
});
const MOB_FILES = Object.freeze({
  zombie: 'zombie_ambient.wav', skeleton: 'skeleton_ambient.wav', spider: 'spider_ambient.wav',
  wolf: 'wolf_ambient.wav', horse: 'horse_ambient.wav', villager: 'villager_ambient.wav',
  pig: 'pig_ambient.wav', chicken: 'chicken_ambient.wav', cow: 'cow_ambient.wav',
  sheep: 'sheep_ambient.wav', cat: 'cat_ambient.wav', bee: 'bee_ambient.wav',
  rabbit: 'rabbit_ambient.wav',
});

export class UserSoundBank {
  constructor(context, getVolume = () => 1) {
    this.context = context;
    this.getVolume = getVolume;
    this.buffers = new Map();
    this.loading = new Map();
    this.missing = new Set();
  }

  async _buffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    if (this.missing.has(file)) return null;
    if (!this.loading.has(file)) {
      const promise = (async () => {
        const response = await fetch(new URL(file, ROOT));
        if (!response.ok) throw new Error('Sound file unavailable: ' + file + ' (' + response.status + ')');
        const data = await response.arrayBuffer();
        return await this.context.decodeAudioData(data);
      })().then((buffer) => {
        this.buffers.set(file, buffer);
        return buffer;
      }).catch((error) => {
        this.missing.add(file);
        console.warn('[sound-bank] Could not load ' + file, error);
        return null;
      }).finally(() => this.loading.delete(file));
      this.loading.set(file, promise);
    }
    return this.loading.get(file);
  }

  async playFile(file, volume = 1, rate = 1) {
    if (!file || !this.context) return false;
    const buffer = await this._buffer(file);
    if (!buffer) return false;
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = Math.max(0, Math.min(1, Number(volume) || 0)) * Math.max(0, Math.min(1, this.getVolume()));
    source.connect(gain).connect(this.context.destination);
    source.start();
    return true;
  }

  play(kind, material = 'stone', volume = 1) {
    const entry = FILES[kind];
    const file = typeof entry === 'string' ? entry : entry?.[String(material).toLowerCase()] || entry?.stone;
    return this.playFile(file, volume);
  }

  playMob(type, action = 'ambient', volume = 0.35) {
    const mob = String(type || '').toLowerCase().replace(/^minecraft:/, '');
    if (action === 'ambient') return this.playFile(MOB_FILES[mob], volume);
    if (action === 'hurt') return this.play('mobHurt', 'stone', volume);
    if (action === 'death') return this.play('mobDeath', 'stone', volume);
    return false;
  }

  has(kind) { return Object.prototype.hasOwnProperty.call(FILES, kind); }
}
