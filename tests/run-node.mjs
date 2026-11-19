import { run } from './framework.js';

for (const name of ['phase1_containers', 'version_112', 'keybinds', 'mob_systems', 'fishing', 'shearing', 'shears_loot', 'overworld_biomes', 'overworld_villages', 'fishing_visual', 'overworld_underground', 'entity_models', 'resource_pack', 'villager_trades']) {
  await import(`./${name}.test.js`);
}

const result = await run((event) => {
  if (event.type === 'pass') console.log(`PASS ${event.name}`);
  if (event.type === 'fail') console.error(`FAIL ${event.name}: ${event.error?.stack || event.error}`);
});

console.log(`Node test suites: ${result.suites.length}; passed: ${result.passed}; failed: ${result.failed}`);
if (result.failed > 0) process.exitCode = 1;
