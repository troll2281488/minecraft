/**
 * Lazy, local sound bank for the WAV files supplied in assets/sound_library.
 * Each clip is fetched and decoded only when first needed, then kept in memory.
 */
const ROOT = new URL('../../assets/sound_library/', import.meta.url);

const FILES = Object.freeze({
  break: { wood: 'block_break_wood.ogg', grass: 'block_break_grass.ogg', sand: 'block_break_sand.ogg', stone: 'block_break_stone.ogg' },
  place: 'block_place.ogg',
  hit: 'block_hit.ogg',
  step: { wood: 'step_wood.ogg', grass: 'step_grass.ogg', dirt: 'step_grass.ogg', sand: 'step_sand.ogg', stone: 'step_stone.ogg' },
  hurt: 'player_hurt.ogg', mobHurt: 'mob_hurt.ogg', mobDeath: 'mob_death.ogg',
  pickup: 'item_pickup.ogg', drop: 'item_drop.ogg', xp: 'xp_orb.ogg', levelup: 'level_up.ogg',
  shoot: 'bow_shoot.ogg', bow: 'bow_shoot.ogg', arrowHit: 'arrow_hit.ogg',
  explode: 'explosion.ogg', chestOpen: 'chest_open.ogg', doorOpen: 'door_open.ogg',
  equip: 'equip.ogg', eat: 'eat.ogg', cast: 'fishing_cast.ogg', reel: 'fishing_catch.ogg',
  bite: 'fishing_bite.ogg', catch: 'fishing_catch.ogg', note: 'note_block.ogg',
  trade: 'villager_trade.ogg', thunder: 'thunder.ogg', water: 'water_splash.ogg',
  click: 'ui_click.ogg', toast: 'ui_toast.ogg', creeper: 'creeper_fuse.ogg',
  portal: 'portal_ambient.ogg',
});
const MOB_FILES = Object.freeze({
  zombie: 'zombie_ambient.ogg', skeleton: 'skeleton_ambient.ogg', spider: 'spider_ambient.ogg',
  wolf: 'wolf_ambient.ogg', horse: 'horse_ambient.ogg', villager: 'villager_ambient.ogg',
  pig: 'pig_ambient.ogg', chicken: 'chicken_ambient.ogg', cow: 'cow_ambient.ogg',
  sheep: 'sheep_ambient.ogg', cat: 'cat_ambient.ogg', bee: 'bee_ambient.ogg',
  rabbit: 'rabbit_ambient.ogg',
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
