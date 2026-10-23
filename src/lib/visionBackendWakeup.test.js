import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND_WAKE_MESSAGE, waitForVisionBackend } from './visionBackendWakeup.js';

const ready = () => ({ ok: true, json: async () => ({ status: 'ok' }) });

test('a ready backend skips the waking message', async () => {
  let waking = 0;
  let calls = 0;
  const result = await waitForVisionBackend({
    healthUrl: 'https://api.example.test/api/health',
    fetchImpl: async url => { calls++; assert.equal(url, 'https://api.example.test/api/health'); return ready(); },
    onWaking: () => waking++,
    wait: async () => {},
  });
  assert.equal(result.wakingShown, false);
  assert.equal(calls, 1);
  assert.equal(waking, 0);
});

test('an unavailable health check shows waking once and resumes after recovery', async () => {
  let calls = 0;
  let waking = 0;
  const result = await waitForVisionBackend({
    attempts: 3,
    fetchImpl: async () => (++calls === 1 ? Promise.reject(new TypeError('offline')) : ready()),
    onWaking: () => waking++,
    wait: async () => {},
  });
  assert.equal(result.wakingShown, true);
  assert.equal(calls, 2);
  assert.equal(waking, 1);
  assert.equal(BACKEND_WAKE_MESSAGE.title, 'Preparing Squad Registration');
  assert.equal(BACKEND_WAKE_MESSAGE.body, 'Our squad registration system is waking up. This may take a little while. Please wait while we get everything ready.');
  assert.equal(BACKEND_WAKE_MESSAGE.reminder, "Please don't refresh the page or submit your screenshots again.");
});

test('failed wake attempts are bounded and do not submit registration requests', async () => {
  let calls = 0;
  await assert.rejects(waitForVisionBackend({
    attempts: 3,
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.method, 'GET');
      return { ok: false, json: async () => ({}) };
    },
    wait: async () => {},
  }), error => error.code === 'BACKEND_UNAVAILABLE' && error.wakingShown);
  assert.equal(calls, 3);
});
