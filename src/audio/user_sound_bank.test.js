import { describe, it, assert, assertEqual } from '../../tests/framework.js';
import { UserSoundBank } from './user_sound_bank.js';

describe('User supplied sound bank', () => {
  it('maps material-specific footsteps and block breaks', () => {
    const bank = new UserSoundBank(null);
    assert(bank.has('step'));
    assert(bank.has('break'));
  });
  it('does not invent a clip for unknown mobs', async () => {
    const bank = new UserSoundBank(null);
    assertEqual(await bank.playMob('unknown_mob', 'ambient'), false);
  });
});
