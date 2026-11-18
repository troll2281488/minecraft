import { run } from './framework.js';

for (const name of ['phase1_containers', 'version_112', 'keybinds']) {
  await import(`./${name}.test.js`);
}

const result = await run((event) => {
  if (event.type === 'pass') console.log(`PASS ${event.name}`);
  if (event.type === 'fail') console.error(`FAIL ${event.name}: ${event.error?.stack || event.error}`);
});

console.log(`Node test suites: ${result.suites.length}; passed: ${result.passed}; failed: ${result.failed}`);
if (result.failed > 0) process.exitCode = 1;
