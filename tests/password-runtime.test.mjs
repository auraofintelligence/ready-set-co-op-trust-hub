import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Miniflare } from 'miniflare';
import * as opaque from '@serenity-kit/opaque';
import { preparePasswordRuntime } from '../scripts/prepare-password-runtime.mjs';
import { getPasswordRuntime } from '../cloudflare/password-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the pinned OPAQUE client completes a real registration and login with a one-character password against static WASM in workerd', { timeout: 30000 }, async t => {
  const { workerDirectory } = await preparePasswordRuntime();
  const fixturePath = path.join(workerDirectory, 'runtime-test.mjs');
  // This test-only service never touches D1, a real account, or the deployed Worker.
  const fixture = `
    import { ready, server } from './opaque-worker.mjs';
    let setup, record;
    const pending = new Map();
    export default { async fetch(request) {
      await ready;
      setup ||= server.createSetup();
      const { method, params } = await request.json();
      try {
        if (method === 'register') return Response.json(server.createRegistrationResponse({
          serverSetup: setup, userIdentifier: 'runtime-test-user', registrationRequest: params.registrationRequest
        }));
        if (method === 'save') { record = params.registrationRecord; return Response.json({ saved: true }); }
        if (method === 'login') {
          const result = server.startLogin({ serverSetup: setup, userIdentifier: 'runtime-test-user',
            registrationRecord: params.unknown ? null : record, startLoginRequest: params.startLoginRequest });
          const attempt = crypto.randomUUID(); pending.set(attempt, result.serverLoginState);
          return Response.json({ attempt, loginResponse: result.loginResponse });
        }
        if (method === 'verify') {
          const state = pending.get(params.attempt); pending.delete(params.attempt);
          if (!state) return Response.json({ authenticated: false }, { status: 401 });
          const result = server.finishLogin({ serverLoginState: state, finishLoginRequest: params.finishLoginRequest });
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.sessionKey));
          return Response.json({ authenticated: true, sessionDigest: [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('') });
        }
        return Response.json({ error: 'invalid' }, { status: 400 });
      } catch { return Response.json({ authenticated: false }, { status: 401 }); }
    }};
  `;
  const mf = new Miniflare({
    modules: [
      { type: 'ESModule', path: fixturePath, contents: fixture },
      { type: 'ESModule', path: path.join(workerDirectory, 'opaque-worker.mjs') },
      { type: 'CompiledWasm', path: path.join(workerDirectory, 'opaque.wasm') },
    ],
    modulesRoot: workerDirectory,
    compatibilityDate: '2026-08-01',
  });
  t.after(() => mf.dispose());
  async function send(method, params) {
    const response = await mf.dispatchFetch('http://localhost/runtime-test', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params }) });
    return { status: response.status, body: await response.json() };
  }

  await opaque.ready;
  assert.equal(typeof (await getPasswordRuntime()).server.startLogin, 'function');
  const password = 'a';
  const registration = opaque.client.startRegistration({ password });
  const registrationResponse = await send('register', { registrationRequest: registration.registrationRequest });
  assert.equal(registrationResponse.status, 200);
  const { registrationRecord } = opaque.client.finishRegistration({
    password, clientRegistrationState: registration.clientRegistrationState,
    registrationResponse: registrationResponse.body.registrationResponse, keyStretching: 'memory-constrained',
  });
  assert.equal((await send('save', { registrationRecord })).status, 200);

  const login = opaque.client.startLogin({ password });
  const response = await send('login', { startLoginRequest: login.startLoginRequest });
  assert.equal(response.status, 200);
  const finished = opaque.client.finishLogin({ password, clientLoginState: login.clientLoginState,
    loginResponse: response.body.loginResponse, keyStretching: 'memory-constrained' });
  assert.ok(finished);
  const verified = await send('verify', { attempt: response.body.attempt, finishLoginRequest: finished.finishLoginRequest });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.authenticated, true);
  assert.equal(verified.body.sessionDigest, createHash('sha256').update(finished.sessionKey).digest('hex'));
  assert.equal((await send('verify', { attempt: response.body.attempt, finishLoginRequest: finished.finishLoginRequest })).status, 401);

  const bad = opaque.client.startLogin({ password: 'different fictional password' });
  const badResponse = await send('login', { startLoginRequest: bad.startLoginRequest });
  assert.equal(opaque.client.finishLogin({ password: 'different fictional password', clientLoginState: bad.clientLoginState,
    loginResponse: badResponse.body.loginResponse, keyStretching: 'memory-constrained' }), undefined);
  const unknown = await send('login', { unknown: true, startLoginRequest: login.startLoginRequest });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.loginResponse.length, response.body.loginResponse.length);
  assert.doesNotMatch(await readFile(path.join(workerDirectory, 'opaque-worker.mjs'), 'utf8'), /WebAssembly\.compile\(/);
});

test('the dedicated password worker keeps secrets private and consumes each client state once', { timeout: 20000 }, async t => {
  const source = await readFile(path.join(root, 'password-crypto-worker.js'), 'utf8');
  // Adapt only the browser message transport/import for a real isolated Node worker.
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.self = globalThis;
    self.addEventListener = (_name, handler) => parentPort.on('message', data => handler({ data }));
    self.postMessage = message => parentPort.postMessage(message);
    ${source.replace("import { client, ready } from './vendor/opaque-browser.js';", "const { client, ready } = require('@serenity-kit/opaque');")}
  `, { eval: true });
  t.after(() => worker.terminate());
  let id = 0;
  const waiting = new Map();
  worker.on('message', response => {
    const pending = waiting.get(response.id);
    if (pending) { clearTimeout(pending.timer); waiting.delete(response.id); pending.resolve(response); }
  });
  worker.on('error', error => {
    for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(error); }
    waiting.clear();
  });
  function send(method, params) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(requestId); reject(new Error('Password worker did not respond.')); }, 10000);
      waiting.set(requestId, { resolve, reject, timer });
      worker.postMessage({ id: requestId, method, params });
    });
  }
  async function result(method, params) {
    const response = await send(method, params);
    assert.equal(response.ok, true, response.error?.message);
    return response.result;
  }

  await opaque.ready;
  const serverSetup = opaque.server.createSetup(), userIdentifier = 'private-worker-test';
  const password = 'e\u0301';
  assert.equal((await send('registration.start', { password: '' })).error.code, 'password_required');
  assert.equal((await send('registration.start', { password: 'a'.repeat(129) })).error.code, 'password_too_long');
  const maximum = await result('registration.start', { password: '\u{1f600}'.repeat(128) });
  await result('cancel', { stateId: maximum.stateId });
  assert.equal((await send('constructor', {})).error.code, 'invalid_request');
  const registration = await result('registration.start', { password });
  assert.deepEqual(Object.keys(registration).sort(), ['registrationRequest', 'stateId']);
  const response = opaque.server.createRegistrationResponse({ serverSetup, userIdentifier,
    registrationRequest: registration.registrationRequest });
  const registered = await result('registration.finish', { stateId: registration.stateId, registrationResponse: response.registrationResponse });
  assert.deepEqual(Object.keys(registered), ['registrationRecord']);
  assert.equal((await send('registration.finish', { stateId: registration.stateId, registrationResponse: response.registrationResponse })).error.code, 'attempt_expired');

  const login = await result('login.start', { password: password.normalize('NFC') });
  assert.deepEqual(Object.keys(login).sort(), ['startLoginRequest', 'stateId']);
  const challenge = opaque.server.startLogin({ serverSetup, userIdentifier,
    registrationRecord: registered.registrationRecord, startLoginRequest: login.startLoginRequest });
  const proof = await result('login.finish', { stateId: login.stateId, loginResponse: challenge.loginResponse });
  assert.deepEqual(Object.keys(proof), ['finishLoginRequest']);
  assert.equal(typeof opaque.server.finishLogin({ serverLoginState: challenge.serverLoginState, finishLoginRequest: proof.finishLoginRequest }).sessionKey, 'string');
  assert.equal((await send('login.finish', { stateId: login.stateId, loginResponse: challenge.loginResponse })).error.code, 'attempt_expired');

  const cancelled = await result('login.start', { password });
  await result('cancel', { stateId: cancelled.stateId });
  assert.equal((await send('login.finish', { stateId: cancelled.stateId, loginResponse: challenge.loginResponse })).error.code, 'attempt_expired');
  const malformed = await result('login.start', { password });
  assert.equal((await send('login.finish', { stateId: malformed.stateId, loginResponse: 123 })).error.code, 'invalid_request');
  assert.equal((await send('login.finish', { stateId: malformed.stateId, loginResponse: challenge.loginResponse })).error.code, 'attempt_expired');
  const cleared = await result('login.start', { password });
  await result('clear', {});
  assert.equal((await send('login.finish', { stateId: cleared.stateId, loginResponse: challenge.loginResponse })).error.code, 'attempt_expired');
});
