import { describe, it, assert, assertEqual } from './framework.js';
import { GameSounds, SOUND_EVENTS, SOUND_PRESETS } from '../src/game/sounds.js';
describe('Procedural sound event bank',()=>{
  it('maps every event to an existing preset',()=>{
    for(const [id,preset] of Object.entries(SOUND_EVENTS))assert(SOUND_PRESETS[preset], 'Missing preset: '+id);
  });
  it('uses stable namespaced event identifiers',()=>{
    for(const id of Object.keys(SOUND_EVENTS))assert(/^[a-z]+[.][a-z0-9_.]+$/.test(id),'Invalid event: '+id);
  });
  it('rejects unknown events without throwing',()=>{
    assertEqual(new GameSounds().playEvent('unknown.event'),false);
  });
  it('clamps volume and supports disabling audio',()=>{
    const sounds=new GameSounds();sounds.setVolume(3);assertEqual(sounds.masterVolume,1);
    sounds.setVolume(-1);assertEqual(sounds.masterVolume,0);
    sounds.setEnabled(false);assertEqual(sounds.enabled,false);
  });
});
