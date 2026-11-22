/**
 * Runtime sampler for the vanilla entity animation JSON format.
 * Keyframes are authored by the pinned Minecraft entity-model dataset.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sampleTrack(track, time) {
  if (!Array.isArray(track) || !track.length) return null;
  if (track.length === 1 || time <= track[0].time) return track[0].value;
  const last = track[track.length - 1];
  if (time >= last.time) return last.value;
  let index = 0;
  while (index < track.length - 1 && track[index + 1].time < time) index++;
  const a = track[index], b = track[index + 1];
  const span = Math.max(1e-8, b.time - a.time);
  const t = clamp((time - a.time) / span, 0, 1);
  const dimensions = Math.max(a.value?.length ?? 0, b.value?.length ?? 0);
  const result = [];
  for (let axis = 0; axis < dimensions; axis++) {
    const p1 = a.value?.[axis] ?? 0, p2 = b.value?.[axis] ?? 0;
    if (b.interpolation !== 'catmullrom') {
      result.push(p1 + (p2 - p1) * t);
      continue;
    }
    const p0 = track[Math.max(0, index - 1)].value?.[axis] ?? p1;
    const p3 = track[Math.min(track.length - 1, index + 2)].value?.[axis] ?? p2;
    const t2 = t * t, t3 = t2 * t;
    result.push(0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
  }
  return result;
}

function chooseAnimation(animations, state) {
  const names = Object.keys(animations ?? {});
  const prefer = state.inWater ? ['swim', 'water', 'walk_cycle']
    : state.airborne ? ['fly', 'air', 'walk_cycle']
    : state.attacking ? ['attack', 'walk_cycle']
    : state.walking ? ['walk_cycle', 'walk', 'move']
    : ['idle', 'look_at_target', 'walk_cycle'];
  for (const token of prefer) {
    const found = names.find(name => name.toLowerCase().includes(token));
    if (found) return found;
  }
  return names.find(name => name.toLowerCase().includes('idle')) ?? names[0] ?? null;
}

export function sampleVanillaEntityAnimation(animationFile, state = {}, elapsedSeconds = 0) {
  const animations = animationFile?.animations;
  if (!animations || typeof animations !== 'object') return null;
  const name = chooseAnimation(animations, state);
  const clip = name ? animations[name] : null;
  if (!clip?.bones || !Number.isFinite(clip.length) || clip.length <= 0) return null;
  const phaseTime = Number.isFinite(state.cyclePhase) ? ((state.cyclePhase % 1 + 1) % 1) * clip.length : elapsedSeconds;
  const time = clip.loop ? (Math.max(0, phaseTime) % clip.length) : clamp(phaseTime, 0, clip.length);
  const bones = {};
  for (const [boneName, channels] of Object.entries(clip.bones)) {
    const sampled = {};
    for (const channel of ['rotation', 'position', 'scale']) {
      const value = sampleTrack(channels?.[channel], time);
      if (value) sampled[channel] = value;
    }
    if (Object.keys(sampled).length) bones[boneName] = sampled;
  }
  return { name, time, bones };
}
