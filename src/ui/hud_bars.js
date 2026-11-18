/**
 * HUD health, hunger and air bars drawn as 9x9 pixel icons, the way the 1.12.2
 * HUD shows them: ten icons per row, two points each, half icons for odd values.
 *
 * Matching sprites from ItsBrian's Java GUI atlas are used when available;
 * the original SVG pixel icons remain as a fallback. Rows are rebuilt only
 * when their value changes, so this costs nothing per frame.
 */

const SHAPES = {
  heart: [
    '.XX...XX.',
    'XXXX.XXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '.........',
  ],
  food: [
    '....XXX..',
    '...XXXXX.',
    '..XXXXXX.',
    '..XXXXX..',
    '.XXXXX...',
    'XXXXX....',
    'XXXX.....',
    'XXX......',
    '.........',
  ],
  bubble: [
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
  ],
};

const PALETTE = {
  heart: { full: '#e0302e', empty: '#3b3b3b', outline: '#000' },
  food: { full: '#c9803f', empty: '#3b3b3b', outline: '#000' },
  bubble: { full: '#6fc3ff', empty: '#1d3a52', outline: '#000' },
};

const cache = new Map();
let externalSprites = null;

export function setHudSprites(sprites) {
  externalSprites = sprites && Object.keys(sprites).length ? sprites : null;
  cache.clear();
}

function icon(kind, state) {
  const key = kind + ':' + state;
  if (cache.has(key)) return cache.get(key);
  const spriteKey = kind + '_' + state;
  if (externalSprites?.[spriteKey]) {
    const html = `<img src="${externalSprites[spriteKey]}" width="18" height="18" style="image-rendering:pixelated;vertical-align:middle" alt="">`;
    cache.set(key, html);
    return html;
  }
  const shape = SHAPES[kind];
  const pal = PALETTE[kind];
  let rects = '';
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      if (shape[y][x] !== 'X') continue;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => shape[y + dy]?.[x + dx] !== 'X');
      let fill = state === 'empty' || (state === 'half' && x >= 5) ? pal.empty : pal.full;
      if (edge) fill = pal.outline;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  }
  const svg = `<svg viewBox="0 0 9 9" width="18" height="18" shape-rendering="crispEdges">${rects}</svg>`;
  cache.set(key, svg);
  return svg;
}

/**
 * Draw a row of ten icons for a value from 0 to 20 (two points per icon).
 * `kind` is 'heart', 'food' or 'bubble'. Skips the DOM write when unchanged.
 */
export function renderBar(el, value, kind) {
  const v = Math.max(0, Math.min(20, Math.round(value)));
  const key = kind + ':' + v;
  if (el.dataset.bar === key) return;
  el.dataset.bar = key;
  let html = '';
  for (let i = 0; i < 10; i++) {
    const points = v - i * 2;
    const state = points >= 2 ? 'full' : points === 1 ? 'half' : 'empty';
    html += icon(kind, state);
  }
  el.innerHTML = html;
}
