const ROOT = new URL('../../assets/audio/', import.meta.url);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const materialOf = (name) => {
  if (/grass|leaf|leaves|dirt|mud|earth/.test(name)) return 'grass';
  if (/wood|plank|log|door/.test(name)) return 'wood';
  if (/stone|rock|brick|concrete|gravel/.test(name)) return 'stone';
  if (/sand/.test(name)) return 'sand';
  if (/snow|ice/.test(name)) return 'snow';
  if (/metal|iron|steel/.test(name)) return 'metal';
  if (/glass/.test(name)) return 'glass';
  return 'generic';
};

export function classifyBundledSound(file, pack) {
  const normalized = String(file).toLowerCase().replace(/\\\\/g, '/');
  const name = normalized.split('/').pop() ?? '';
  const cleanName = name.replace(/\\.(ogg|opus|wav)$/i, '');
  const material = materialOf(cleanName);
  if (pack === 'kenney-footsteps') return `step:${material}`;
  if (pack === 'kenney-impact') {
    if (/footstep|step/.test(cleanName)) return `step:${material}`;
    if (/impact|collision|thud|hit|mining/.test(cleanName)) return `impact:${material}`;
  }
  if (pack === 'oga-rpg-sfx' && /creature|monster|beast/.test(cleanName)) return 'mob:creature';
  return null;
}

export class BundledSoundBank {
  constructor() {
    this.groups = new Map();
    this.ready = false;
    this.loadPromise = null;
    this.context = null;
    this.lastAmbientAt = 0;
  }

  async load(context) {
    if (this.ready) return true;
    if (this.loadPromise) return this.loadPromise;
    this.context = context;
    this.loadPromise = (async () => {
      const response = await fetch(new URL('manifest.json', ROOT));
      if (!response.ok) throw new Error(`Built-in sound manifest unavailable (${response.status})`);
      const manifest = await response.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      let cursor = 0;
      const workers = Array.from({ length: 4 }, async () => {
        while (cursor < files.length) {
          const entry = files[cursor++];
          const bucket = classifyBundledSound(entry.file, entry.pack);
          if (!bucket) continue;
          try {
            const audioResponse = await fetch(new URL(`${entry.pack}/${entry.file}`, ROOT));
            if (!audioResponse.ok) continue;
            const bytes = await audioResponse.arrayBuffer();
            const buffer = await context.decodeAudioData(bytes);
            if (!this.groups.has(bucket)) this.groups.set(bucket, []);
            this.groups.get(bucket).push(buffer);
          } catch (error) {
            console.warn('[audio] Skipped bundled sound:', entry.file, error);
          }
        }
      });
      await Promise.all(workers);
      this.ready = true;
      return true;
    })();
    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  play(eventId, material = 'stone', volume = 0.75) {
    if (!this.ready || !this.context) return false;
    const materialKey = materialOf(String(material).toLowerCase());
    let keys = [];
    if (eventId === 'block.step') {
      keys = [`step:${materialKey}`, 'step:generic'];
    } else if (['block.break', 'block.place', 'block.hit'].includes(eventId)) {
      keys = [`impact:${materialKey}`, 'impact:generic'];
    } else if (['entity.mob.ambient', 'entity.mob.hurt', 'entity.mob.death'].includes(eventId)) {
      keys = ['mob:creature'];
    }
    let choices = null;
    for (const key of keys) {
      if (this.groups.get(key)?.length) { choices = this.groups.get(key); break; }
    }
    if (!choices?.length) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = choices[Math.floor(Math.random() * choices.length)];
    const eventGain = eventId === 'block.step' ? 0.34 : 0.72;
    gain.gain.value = clamp(Number(volume) || 0, 0, 1) * eventGain;
    source.connect(gain).connect(this.context.destination);
    source.start();
    return true;
  }
}
