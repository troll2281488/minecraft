/**
 * Java Edition 1.19 animated texture metadata helpers.
 *
 * This module validates the resource-pack .png.mcmeta animation section and
 * resolves the active frame at a game tick. Pixel interpolation and renderer
 * upload are deliberately handled by the renderer, not by this pure module.
 */

function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function frameEntry(entry, defaultTime, frameCount) {
  const object = typeof entry === 'object' && entry !== null;
  const index = object ? entry.index : entry;
  const time = object ? positiveInt(entry.time, defaultTime) : defaultTime;
  if (!Number.isInteger(index) || index < 0 || index >= frameCount) return null;
  return { index, time };
}

/**
 * Validate animation metadata for a decoded PNG.
 * Returns null for static/invalid textures; invalid frame entries are ignored.
 */
export function parseTextureAnimation(metadata, imageWidth, imageHeight) {
  const animation = metadata?.animation;
  if (!animation || !Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) ||
      imageWidth < 1 || imageHeight < 1) return null;

  const minDimension = Math.min(imageWidth, imageHeight);
  const width = positiveInt(animation.width,
    Number.isInteger(animation.height) ? imageHeight : minDimension);
  const height = positiveInt(animation.height,
    Number.isInteger(animation.width) ? imageWidth : minDimension);
  if (imageWidth % width !== 0 || imageHeight % height !== 0) return null;

  const columns = imageWidth / width;
  const rows = imageHeight / height;
  const frameCount = columns * rows;
  const frametime = positiveInt(animation.frametime, 1);
  const sourceFrames = Array.isArray(animation.frames)
    ? animation.frames
    : Array.from({ length: frameCount }, (_, index) => index);
  const frames = sourceFrames
    .map((entry) => frameEntry(entry, frametime, frameCount))
    .filter(Boolean);
  if (frames.length === 0) return null;

  const duration = frames.reduce((total, frame) => total + frame.time, 0);
  return Object.freeze({
    width, height, columns, rows, frameCount, frametime,
    interpolate: animation.interpolate === true,
    frames: Object.freeze(frames),
    duration,
  });
}

/** Return the sprite-sheet frame index visible at an integer game tick. */
export function textureFrameAt(animation, tick) {
  if (!animation?.frames?.length) return 0;
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  let cursor = safeTick % animation.duration;
  for (const frame of animation.frames) {
    if (cursor < frame.time) return frame.index;
    cursor -= frame.time;
  }
  return animation.frames[animation.frames.length - 1].index;
}
