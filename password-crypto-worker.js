import { client, ready } from './vendor/opaque-browser.js';

const states = new Map();
const lifetimeMs = 5 * 60 * 1000;
const maximumStates = 4;
const stretching = 'memory-constrained';
const safeId = id => (typeof id === 'string' && id.length >= 1 && id.length <= 80) ||
  (Number.isSafeInteger(id) && id >= 0);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { const error = new Error(code); error.code = code; throw error; };

function text(value, maximum) {
  if (typeof value !== 'string' || !value.length || value.length > maximum) fail('invalid_request');
  return value;
}

function encoded(value, length) {
  if (typeof value !== 'string' || value.length !== length || !/^[A-Za-z0-9_-]+$/.test(value)) fail('invalid_request');
  return value;
}

function passwordValue(value, registration) {
  if (typeof value !== 'string' || value.length > 1024) fail('invalid_password');
  const password = value.normalize('NFC');
  const points = [...password];
  if (points.length < (registration ? 15 : 1) || points.length > 128 ||
      points.some(point => { const code = point.codePointAt(0); return code >= 0xd800 && code <= 0xdfff; })) {
    fail('invalid_password');
  }
  return password;
}

function discard(stateId) {
  const state = states.get(stateId);
  if (state) {
    clearTimeout(state.timer);
    state.password = '';
    state.clientState = '';
    states.delete(stateId);
  }
}

function remember(kind, password, clientState) {
  if (states.size >= maximumStates) fail('too_many_attempts');
  const stateId = crypto.randomUUID();
  const timer = setTimeout(() => discard(stateId), lifetimeMs);
  states.set(stateId, { kind, password, clientState, expiresAt: Date.now() + lifetimeMs, timer });
  return stateId;
}

function take(stateId, kind) {
  text(stateId, 80);
  const state = states.get(stateId);
  if (!state || state.kind !== kind || state.expiresAt <= Date.now()) {
    discard(stateId);
    fail('attempt_expired');
  }
  const captured = { password: state.password, clientState: state.clientState };
  discard(stateId);
  return captured;
}

const methods = {
  'registration.start'(params) {
    const password = passwordValue(params.password, true);
    if (states.size >= maximumStates) fail('too_many_attempts');
    const result = client.startRegistration({ password });
    return { stateId: remember('registration', password, result.clientRegistrationState), registrationRequest: result.registrationRequest };
  },
  'registration.finish'(params) {
    const state = take(params.stateId, 'registration');
    try {
      const { registrationRecord } = client.finishRegistration({
        password: state.password,
        clientRegistrationState: state.clientState,
        registrationResponse: encoded(params.registrationResponse, 86),
        keyStretching: stretching,
      });
      return { registrationRecord };
    } finally {
      state.password = '';
      state.clientState = '';
    }
  },
  'login.start'(params) {
    const password = passwordValue(params.password, false);
    if (states.size >= maximumStates) fail('too_many_attempts');
    const result = client.startLogin({ password });
    return { stateId: remember('login', password, result.clientLoginState), startLoginRequest: result.startLoginRequest };
  },
  'login.finish'(params) {
    const state = take(params.stateId, 'login');
    try {
      const result = client.finishLogin({
        password: state.password,
        clientLoginState: state.clientState,
        loginResponse: encoded(params.loginResponse, 427),
        keyStretching: stretching,
      });
      if (!result) fail('password_signin_failed');
      return { finishLoginRequest: result.finishLoginRequest };
    } finally {
      state.password = '';
      state.clientState = '';
    }
  },
  cancel(params) { discard(text(params.stateId, 80)); return { cleared: true }; },
  clear() { for (const stateId of states.keys()) discard(stateId); return { cleared: true }; },
};

const messages = {
  invalid_password: 'Use a password of 15 to 128 characters when creating an account.',
  too_many_attempts: 'Please finish or cancel the current sign-in attempt, then try again.',
  attempt_expired: 'This sign-in attempt has expired. Please try again.',
  invalid_request: 'This sign-in attempt could not be completed. Please try again.',
  password_signin_failed: 'The username or password could not be verified. Please try again.',
  password_runtime_unavailable: 'Password sign-in could not start. Please reload the page and try again.',
};

self.addEventListener('message', async ({ data }) => {
  if (!plainObject(data) || !safeId(data.id)) return;
  const { id, method } = data;
  try {
    if (typeof method !== 'string' || !Object.hasOwn(methods, method) || !plainObject(data.params)) fail('invalid_request');
    try { await ready; } catch { fail('password_runtime_unavailable'); }
    const result = methods[method](data.params);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    const code = Object.hasOwn(messages, error?.code) ? error.code :
      method === 'login.finish' ? 'password_signin_failed' : 'invalid_request';
    self.postMessage({ id, ok: false, error: { code, message: messages[code] } });
  }
});
