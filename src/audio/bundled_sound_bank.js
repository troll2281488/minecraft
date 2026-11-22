const ROOT = new URL('../../assets/audio/', import.meta.url);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function materialOf(value = '') {
  const name = String(value).toLowerCase().replace(/^minecraft:/, '');
  if (/grass|leaves|dirt|mud|earth|podzol/.test(name)) return 'grass';
  if (/wood|plank|log|door/.test(name)) return 'wood';
  if (/snow|ice/.test(name)) return 'snow';
  if (/carpet|wool/.test(name)) return 'carpet';
  if (/sand/.test(name)) return 'sand';
  if (/metal|iron|steel/.test(name)) return 'metal';
  if (/glass/.test(name)) return 'glass';
  return 'concrete';
}

function groupFor(eventId, material) {
  const m = materialOf(material);
  if (eventId === 'block.step') return ['step:' + (m === 'sand' ? 'concrete' : m), 'step:concrete'];
  if (eventId === 'block.break' || eventId === 'block.place' || eventId === 'block.hit') {
    if (m === 'wood') return ['impact:wood', 'impact:generic'];
    if (m === 'metal') return ['impact:metal', 'impact:generic'];
    if (m === 'glass') return ['impact:glass', 'impact:generic'];
    return ['impact:generic'];
  }
  if (eventId.startsWith('block.door') || eventId.startsWith('block.chest')) return ['door'];
  if (eventId.startsWith('ui.')) return ['ui'];
  if (eventId.includes('item.') || eventId.includes('experience') || eventId.includes('levelup') || eventId === 'item.equip') return ['inventory'];
  if (eventId === 'entity.villager.trade') return ['inventory', 'ui'];
  if (eventId.startsWith('entity.')) return ['mob:creature', 'impact:generic'];
  return [];
}


export function classifyBundledSound(file, pack = '') {
  const name = String(file).toLowerCase().split(/[\\/]/).pop() || '';
  const clean = name.replace(/\\.(ogg|opus|wav)$/i, '');
  if (pack === 'oga-creatures' || pack === 'oga-rpg-sfx') return 'mob:creature';
  const step = clean.match(/^footstep_(carpet|concrete|grass|snow|wood)_/);
  if (step) return 'step:' + step[1];
  if (/^footstep\\d+/.test(clean) && pack === 'kenney-footsteps') return 'step:generic';
  if (/impactmining/.test(clean)) return 'impact:generic';
  if (/impact.*(wood|plank)/.test(clean)) return 'impact:wood';
  if (/impact.*glass/.test(clean)) return 'impact:glass';
  if (/impact.*(metal|plate|tin)/.test(clean)) return 'impact:metal';
  if (/impact/.test(clean)) return 'impact:generic';
  if (/door|creak/.test(clean)) return 'door';
  if (/click|confirm|error|select|toggle|open|close|hover|switch|button/.test(clean)) return 'ui';
  if (/coin|pickup|drop|handle|book|cloth|leather|latch|equip/.test(clean)) return 'inventory';
  return null;
}

export class BundledSoundBank {
  constructor() {
    this.context = null;
    this.manifestPromise = null;
    this.groups = new Map();
    this.loading = new Map();
    this.lastChoice = new Map();
  }

  async _manifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(new URL('manifest.json', ROOT))
        .then((response) => {
          if (!response.ok) throw new Error('CC0 sound manifest unavailable: ' + response.status);
          return response.json();
        })
        .catch((error) => {
          this.manifestPromise = null;
          throw error;
        });
    }
    return this.manifestPromise;
  }

  async _loadGroup(group) {
    if (this.groups.has(group)) return this.groups.get(group);
    if (this.loading.has(group)) return this.loading.get(group);
    const promise = (async () => {
      const manifest = await this._manifest();
      const candidates = (manifest.files || []).filter((entry) => entry.group === group);
      if (!candidates.length) return [];
      // Load a small set of varied clips for this event only; other categories
      // remain on the server until the player actually triggers them.
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(group === 'mob:creature' ? 12 : 8, shuffled.length));
      const decoded = await Promise.all(selected.map(async (entry) => {
        try {
          const response = await fetch(new URL(entry.pack + '/' + encodeURIComponent(entry.file), ROOT));
          if (!response.ok) return null;
          return await this.context.decodeAudioData(await response.arrayBuffer());
        } catch (error) {
          console.warn('[audio] Could not decode CC0 sound ' + entry.file, error);
          return null;
        }
      }));
      const buffers = decoded.filter(Boolean);
      this.groups.set(group, buffers);
      return buffers;
    })();
    this.loading.set(group, promise);
    try { return await promise; }
    finally { this.loading.delete(group); }
  }

  play(eventId, material = 'stone', volume = 1) {
    if (!this.context) return false;
    const groups = groupFor(eventId, material);
    if (!groups.length) return false;
    const eventVolume = eventId === 'block.step' ? 0.16
      : eventId === 'block.place' ? 0.28
      : eventId.startsWith('ui.') ? 0.32
      : eventId.startsWith('entity.mob') ? 0.46
      : 0.42;
    const attempt = async () => {
      let choices = [];
      for (const group of groups) {
        choices = await this._loadGroup(group);
        if (choices.length) break;
      }
      if (!choices.length || !this.context) return false;
      const previous = this.lastChoice.get(groups[0]);
      let index = Math.floor(Math.random() * choices.length);
      if (choices.length > 1 && index === previous) index = (index + 1) % choices.length;
      this.lastChoice.set(groups[0], index);
      if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = choices[index];
      if (eventId === 'block.step') source.playbackRate.value = 0.97 + Math.random() * 0.06;
      gain.gain.value = clamp(Number(volume) || 0, 0, 1) * eventVolume;
      source.connect(gain).connect(this.context.destination);
      source.start();
      return true;
    };
    attempt().catch((error) => console.warn('[audio] CC0 playback failed:', error));
    return true;
  }
}
