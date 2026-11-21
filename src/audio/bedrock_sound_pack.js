/**
 * Best-effort loader for Bedrock .mcpack/.zip sound packs.
 * Reads OGG files from ZIP archives in-browser and decodes them through Web Audio.
 * Procedural game sounds remain the fallback for events absent from the imported pack.
 */
function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i--) if (view.getUint32(i, true) === 0x06054b50) return i;
  throw new Error('В архиве не найдена таблица ZIP');
}
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('Браузер не поддерживает распаковку ZIP');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(bytes);
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const decoder = new TextDecoder(), entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Повреждён каталог ZIP');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!/\.ogg$/i.test(name)) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const compressed = bytes.subarray(start, start + compressedSize);
    const data = method === 0 ? compressed.slice() : method === 8 ? await inflateRaw(compressed) : null;
    if (data) entries.push([name, data]);
  }
  return entries;
}
function soundBucket(path) {
  const name = path.toLowerCase().replace(/\\/g, '/').split('/').pop().replace(/\.ogg$/, '');
  const rules = [
    ['break', /(^|[._-])(break|destroy)([._-]|$)/], ['place', /(^|[._-])(place|put_down)([._-]|$)/],
    ['hit', /(^|[._-])(hit|impact)([._-]|$)/], ['step', /(^|[._-])(step|footstep)([._-]|$)/],
    ['hurt', /(^|[._-])(hurt|damage)([._-]|$)/], ['death', /(^|[._-])(death|die)([._-]|$)/],
    ['ambient', /(^|[._-])(ambient|idle|living)([._-]|$)/], ['open', /(^|[._-])open([._-]|$)/],
    ['close', /(^|[._-])close([._-]|$)/], ['pickup', /(^|[._-])(pickup|pop)([._-]|$)/],
    ['eat', /(^|[._-])(eat|burp)([._-]|$)/], ['shoot', /(^|[._-])(shoot|fire)([._-]|$)/],
    ['explode', /(^|[._-])(explode|explosion)([._-]|$)/],
  ];
  return rules.find(([, re]) => re.test(name))?.[0] ?? null;
}
export class BedrockSoundPack {
  constructor(context) { this.context = context; this.sounds = new Map(); this.fileCount = 0; }
  async import(file) {
    const entries = await readZip(file);
    if (!entries.length) throw new Error('В архиве не найдены OGG-звуки');
    const buckets = new Map();
    let decoded = 0;
    for (let i = 0; i < entries.length; i += 4) {
      const batch = await Promise.all(entries.slice(i, i + 4).map(async ([path, bytes]) => {
        try {
          const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          return [soundBucket(path), await this.context.decodeAudioData(copy)];
        } catch { return null; }
      }));
      for (const entry of batch) {
        if (!entry) continue;
        decoded++;
        const [bucket, buffer] = entry;
        if (!bucket) continue;
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket).push(buffer);
      }
    }
    if (!decoded) throw new Error('Не удалось декодировать OGG-файлы');
    this.sounds = buckets; this.fileCount = decoded;
    return { files: decoded, categories: buckets.size };
  }
  play(eventId, volume = 0.75) {
    const aliases = {
      'block.break':'break','block.place':'place','block.hit':'hit','block.step':'step',
      'block.door.open':'open','block.door.close':'close','block.chest.open':'open','block.chest.close':'close',
      'entity.player.hurt':'hurt','entity.mob.hurt':'hurt','entity.mob.death':'death','entity.mob.ambient':'ambient',
      'entity.item.pickup':'pickup','item.eat':'eat','entity.arrow.shoot':'shoot','entity.generic.explode':'explode',
    };
    const choices = this.sounds.get(aliases[String(eventId).toLowerCase()]);
    if (!choices?.length) return false;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = choices[Math.floor(Math.random() * choices.length)];
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain).connect(this.context.destination); source.start();
    return true;
  }
}
