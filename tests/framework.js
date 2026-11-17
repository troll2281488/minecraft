/**
 * A minimal test framework.
 *
 * Written rather than installed because the project has no dependencies and no
 * build step -- pulling in a runner would mean pulling in npm, which is exactly
 * the thing being avoided. It needs to do very little: group tests, run them in
 * order, catch failures with a useful message, and report.
 */

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  if (!current) throw new Error(`it("${name}") called outside describe()`);
  current.tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Assertions
//
// Every failure message includes the actual value. "Expected true" tells you
// nothing when a test fails six months from now; "expected 17, got 16" tells
// you where to look.
// ---------------------------------------------------------------------------

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual(actual, expected, message = '') {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${message ? message + '\n  ' : ''}expected ${format(expected)}, got ${format(actual)}`,
    );
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError(
      `${message ? message + '\n  ' : ''}expected ${b}\n  got      ${a}`,
    );
  }
}

/** Byte-for-byte comparison, reporting the first differing index. */
export function assertBytesEqual(actual, expected, message = '') {
  if (actual.length !== expected.length) {
    throw new AssertionError(
      `${message ? message + '\n  ' : ''}length differs: expected ${expected.length} bytes, ` +
      `got ${actual.length}`,
    );
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new AssertionError(
        `${message ? message + '\n  ' : ''}bytes differ at index ${i}: ` +
        `expected 0x${expected[i].toString(16).padStart(2, '0')}, ` +
        `got 0x${actual[i].toString(16).padStart(2, '0')}`,
      );
    }
  }
}

/**
 * Assert that `fn` throws, optionally with a specific error name.
 *
 * Returns a promise ONLY when `fn` is async. An unconditionally-async version
 * is a trap: every call site that forgets `await` turns a failing test into an
 * unhandled rejection and a false pass, which is worse than having no test at
 * all. Synchronous functions therefore fail synchronously here.
 */
export function assertThrows(fn, expectedName = null, message = '') {
  const prefix = message ? message + '\n  ' : '';

  const checkError = (err) => {
    if (
      expectedName &&
      err.name !== expectedName &&
      err.constructor?.name !== expectedName
    ) {
      throw new AssertionError(
        `${prefix}expected ${expectedName}, got ${err.name}: ${err.message}`,
      );
    }
  };
  const noThrow = () => {
    throw new AssertionError(`${prefix}expected a throw, but none occurred`);
  };

  let result;
  try {
    result = fn();
  } catch (err) {
    checkError(err);
    return undefined;
  }

  if (result && typeof result.then === 'function') {
    return result.then(noThrow, checkError);
  }
  return noThrow();
}

function format(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') return `${v}n`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function run(onEvent) {
  const results = { passed: 0, failed: 0, suites: [] };

  for (const suite of suites) {
    const suiteResult = { name: suite.name, tests: [] };
    results.suites.push(suiteResult);
    onEvent?.({ type: 'suite', name: suite.name });

    for (const test of suite.tests) {
      const started = performance.now();
      try {
        await test.fn();
        const ms = performance.now() - started;
        results.passed++;
        suiteResult.tests.push({ name: test.name, ok: true, ms });
        onEvent?.({ type: 'pass', name: test.name, ms });
      } catch (err) {
        const ms = performance.now() - started;
        results.failed++;
        suiteResult.tests.push({ name: test.name, ok: false, ms, error: err });
        onEvent?.({ type: 'fail', name: test.name, ms, error: err });
      }
    }
  }

  onEvent?.({ type: 'done', ...results });
  return results;
}

export function suiteCount() {
  return suites.length;
}

export function testCount() {
  return suites.reduce((n, s) => n + s.tests.length, 0);
}
