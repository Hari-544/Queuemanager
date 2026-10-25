/* QueueManager - zero-dependency test runner. Usage: node tests/run-tests.js
 * Test functions may be sync or async (async is awaited).
 */
'use strict';

const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, message) {
  if (!cond) { throw new Error(message || 'assertion failed'); }
}
assert.equal = function (a, b, message) {
  if (a !== b) { throw new Error((message || 'not equal') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
};
assert.deepEqual = function (a, b, message) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) { throw new Error((message || 'not deep-equal') + ' (got ' + sa + ', want ' + sb + ')'); }
};
assert.match = function (s, re, message) {
  if (!re.test(String(s))) { throw new Error((message || 'no match') + ' (' + JSON.stringify(s) + ' vs ' + re + ')'); }
};

async function suite(name, cases) {
  console.log('\n== ' + name + ' ==');
  for (const c of cases) {
    try {
      await c.fn();
      passed += 1;
      console.log('  ok   ' + c.name);
    } catch (err) {
      failed += 1;
      failures.push(name + ' / ' + c.name + ': ' + (err && err.message));
      console.log('  FAIL ' + c.name + '\n       ' + (err && err.message));
    }
  }
}

async function main() {
  const ctx = { assert, suite };
  for (const file of ['queue.test.js', 'storage.test.js', 'verify-pages.js', 'api.test.js']) {
    await require(path.join(__dirname, file))(ctx);
  }

  console.log('\n----------------------------------------');
  console.log('passed: ' + passed + ', failed: ' + failed);
  if (failures.length) {
    console.log('failures:');
    for (const f of failures) { console.log(' - ' + f); }
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
  }
}

main().catch((err) => {
  console.error('runner error: ' + (err && err.stack || err));
  process.exit(2);
});
