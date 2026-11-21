/**
 * Configurable keys. Every gameplay action names its keys here; the rest of the
 * game asks `isAction(code, 'inventory')` or `isDown(keys, 'forward')` rather than
 * comparing against a literal such as 'KeyE'.
 *
 * Each action holds a list of key codes. Rebinding replaces the first code and
 * keeps any extra codes, so sneak and sprint keep their secondary key. Escape,
 * F3, F5, F11 and F12 are fixed: they are system or debug keys, not gameplay.
 */

const STORAGE_KEY = 'mc-keybinds';

const DEFAULTS = Object.freeze({
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sneak: ['ShiftLeft', 'ShiftRight'],
  sprint: ['ControlLeft', 'KeyR'],
  inventory: ['KeyE'],
  chat: ['KeyT'],
  drop: ['KeyQ'],
  swapOffhand: ['KeyF'],
  fly: ['KeyG'],
});

const LABELS = {
  forward: 'Вперёд', back: 'Назад', left: 'Влево', right: 'Вправо',
  jump: 'Прыжок', sneak: 'Присесть', sprint: 'Бег',
  inventory: 'Инвентарь', chat: 'Чат', drop: 'Выбросить',
  swapOffhand: 'Поменять руки', fly: 'Полёт (креатив)',
};

function clone(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, [...v]]));
}

function load() {
  const bindings = clone(DEFAULTS);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      for (const action of Object.keys(DEFAULTS)) {
        const codes = stored[action];
        if (Array.isArray(codes) && codes.length && codes.every((c) => typeof c === 'string')) {
          bindings[action] = codes.slice(0, 4);
        }
      }
    }
  } catch {
    // A corrupt entry falls back to the defaults.
  }
  return bindings;
}

let bindings = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Storage full or disabled: the binding still works for this session.
  }
}

/** True when `code` is bound to `action`. */
export function isAction(code, action) {
  return Array.isArray(bindings[action]) && bindings[action].includes(code);
}

/** True when any key bound to `action` is in the set of held keys. */
export function isDown(keys, action) {
  return Array.isArray(bindings[action]) && bindings[action].some((code) => keys.has(code));
}

/** Rebind an action's primary key. Removes the key from any other action first. */
export function bindKey(action, code) {
  if (!Object.hasOwn(DEFAULTS, action) || typeof code !== 'string' || !code || code === 'Escape') return false;
  for (const other of Object.keys(bindings)) {
    bindings[other] = bindings[other].filter((c) => c !== code);
    if (bindings[other].length === 0) bindings[other] = [...DEFAULTS[other]].slice(0, 1);
  }
  bindings[action] = [code, ...bindings[action].slice(1)];
  save();
  return true;
}

export function resetKeys() {
  bindings = clone(DEFAULTS);
  save();
}

/** Human-readable key name, e.g. 'KeyE' -> 'E', 'ShiftLeft' -> 'Left Shift'. */
export function keyLabel(code) {
  if (code === 'Space') return 'Пробел';
  if (code === 'ControlLeft') return 'Left Ctrl';
  if (code === 'ControlRight') return 'Right Ctrl';
  if (code === 'ShiftLeft') return 'Left Shift';
  if (code === 'ShiftRight') return 'Right Shift';
  if (code === 'AltLeft') return 'Left Alt';
  if (code === 'AltRight') return 'Right Alt';
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

export function actionRows() {
  return Object.keys(DEFAULTS).map((action) => ({
    action,
    label: LABELS[action],
    code: bindings[action][0],
  }));
}
