import { describe, it, assert } from './framework.js';
import { isAction, isDown, bindKey, resetKeys, actionRows } from '../src/game/keybinds.js';

describe('configurable key bindings', () => {
  it('uses the default movement and action keys', () => {
    resetKeys();
    assert(isAction('KeyE', 'inventory'), 'E should open inventory by default');
    assert(isDown(new Set(['KeyW']), 'forward'), 'W should move forward by default');
  });
  it('rebinds an action and removes the key from its previous action', () => {
    resetKeys();
    assert(bindKey('inventory', 'KeyI'), 'valid binding should succeed');
    assert(isAction('KeyI', 'inventory'), 'I should open inventory after rebinding');
    assert(!isAction('KeyE', 'inventory'), 'E should no longer open inventory');
    assert(!isAction('KeyI', 'forward'), 'one key should not trigger two actions');
  });
  it('rejects invalid actions and the reserved Escape key', () => {
    resetKeys();
    assert(!bindKey('not-an-action', 'KeyZ'), 'unknown action must be rejected');
    assert(!bindKey('inventory', 'Escape'), 'Escape must remain reserved');
    assert(!isAction('KeyZ', 'inventory'), 'rejected binding must not be applied');
  });
  it('exposes every configurable action for the settings screen', () => {
    assert(actionRows().length >= 10, 'expected all gameplay bindings');
    resetKeys();
  });
});
