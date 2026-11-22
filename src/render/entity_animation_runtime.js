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
  const find = (tokens) => {
    for (const token of tokens) {
      const found = names.find(name => name.toLowerCase() === token)
        ?? names.find(name => name.toLowerCase().includes(token));
      if (found) return found;
    }
    return null;
  };

  // Specific actions win over locomotion, and locomotion wins over idle.
  // The source pack uses names such as walk_cycle, walk_cycle_armor,
  // look_at_target, fly, swim, attack and unhappy across different species.
  if (state.hurt) {
    const clip = find(['hurt', 'damage', 'hit', 'stun']);
    if (clip) return clip;
  }
  if (state.attacking || state.fuse || state.ramming) {
    const clip = find(state.fuse
      ? ['fuse', 'swelling', 'explode', 'attack']
      : state.ramming
        ? ['ram', 'charge', 'attack']
        : ['attack', 'melee', 'bite', 'shoot', 'cast', 'strike']);
    if (clip) return clip;
  }
  if (state.sitting) {
    const clip = find(['sit', 'sitting', 'rest']);
    if (clip) return clip;
  }
  if (state.sleeping) {
    const clip = find(['sleep', 'sleeping']);
    if (clip) return clip;
  }
  if (state.eating) {
    const clip = find(['eat', 'eating', 'graze']);
    if (clip) return clip;
  }
  if (state.inWater) {
    const clip = find(['swim', 'water', 'paddle']);
    if (clip) return clip;
  }
  if (state.flying || state.airborne) {
    const clip = find(['fly', 'flying', 'glide', 'hover']);
    if (clip) return clip;
  }
  if (state.walking || state.sprinting) {
    const variants = [
      ...(state.hasArmor ? ['walk_cycle_armor'] : []),
      ...(state.saddled ? ['walk_cycle_saddle'] : []),
      ...(state.baby ? ['walk_cycle_baby'] : []),
      state.sprinting ? 'run' : 'walk_cycle',
      'walk', 'run', 'move', 'locomotion',
    ];
    const clip = find(variants);
    if (clip) return clip;
  }
  if (state.angry) {
    const clip = find(['angry', 'aggressive', 'unhappy']);
    if (clip) return clip;
  }
  const idle = find(['idle', 'look_at_target', 'stand', 'standing', 'rest']);
  // Do not play a walking cycle on a stationary mob just because it is the
  // only clip available in its source file.
  return idle;
}

/**
 * Blend state changes instead of snapping between idle, locomotion, attack and
 * hurt poses. Missing target channels fade back to their neutral transforms.
 */
export function blendEntityAnimationBones(previous, target, amount = 1) {
  if (!previous && !target) return null;
  const alpha = clamp(Number.isFinite(amount) ? amount : 1, 0, 1);
  const boneNames = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(target ?? {}),
  ]);
  const result = {};
  for (const boneName of boneNames) {
    const from = previous?.[boneName] ?? {};
    const to = target?.[boneName] ?? {};
    const channels = {};
    for (const channel of ['rotation', 'position', 'scale']) {
      if (!from[channel] && !to[channel]) continue;
      const neutral = channel === 'scale' ? [1, 1, 1] : [0, 0, 0];
      const a = from[channel] ?? neutral;
      const b = to[channel] ?? neutral;
      channels[channel] = neutral.map((fallback, axis) => {
        const start = Number.isFinite(a[axis]) ? a[axis] : fallback;
        const end = Number.isFinite(b[axis]) ? b[axis] : fallback;
        return start + (end - start) * alpha;
      });
    }
    if (Object.keys(channels).length) result[boneName] = channels;
  }
  return result;
}

export function sampleVanillaEntityAnimation(animationFile, state = {}, elapsedSeconds = 0) {
  const animations = animationFile?.animations;
  if (!animations || typeof animations !== 'object') return null;
  const name = chooseAnimation(animations, state);
  const clip = name ? animations[name] : null;
  if (!clip?.bones || !Number.isFinite(clip.length) || clip.length <= 0) return null;
  // Locomotion is phase-locked to actual movement; idle, attack, hurt and other
  // one-shot clips must advance with world time instead of freezing at phase 0.
  const syncToMovement = /walk|run|locomotion|cycle/i.test(name);
  const oneShotProgress = state.hurt
    ? (Number.isFinite(state.hurtProgress) ? 1 - clamp(state.hurtProgress, 0, 1) : null)
    : (state.attacking || state.fuse || state.ramming)
      ? (Number.isFinite(state.actionProgress) ? clamp(state.actionProgress, 0, 1) : null)
      : null;
  // One-shot clips must use the action's own progress, not world time. Otherwise
  // an attack sampled after the clip duration starts and stays frozen at its end.
  const phaseTime = syncToMovement && Number.isFinite(state.cyclePhase)
    ? ((state.cyclePhase % 1 + 1) % 1) * clip.length
    : oneShotProgress !== null
      ? oneShotProgress * clip.length
      : elapsedSeconds;
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


/** True only when a sampled source clip actually drives at least one bone. */
export function hasEntityAnimationPose(animationPose) {
  return !!animationPose?.bones && Object.keys(animationPose.bones).length > 0;
}
