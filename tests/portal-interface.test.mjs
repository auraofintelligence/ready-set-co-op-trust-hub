import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleMemberServiceRequest } from '../cloudflare/member-services.mjs';

const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const BASE = 'https://ready-setco.example';
const identity = { accountId: '1096c2bc-e190-4b00-82ba-6e03416e84cc', username: 'test.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', webmaster: false, status: 'active', version: 1, hasPassword: true };
const PASSWORD = 'a';
const site = { id: 'minjerribah', name: 'Fictional island pilot', locality: 'Fictional locality', summary: 'Test group only.', applicationsOpen: true, published: true, version: 1 };
const profile = { accountId: identity.accountId, displayName: identity.displayName, email: identity.email, phone: '', organisation: '', locality: '', about: '', interests: [], consentContact: true, consentFutureHandover: false, version: 1, updatedAt: '2026-11-27T10:00:00.000Z' };
const clone = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(t, { signedIn = true, account = identity, hash = '', override, webauthn = {} } = {}) {
  const dom = new JSDOM(html, { url: `${BASE}/portal.html${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const window = dom.window, calls = [], downloads = [], ceremonies = [], passwordCalls = [], workers = [];
  const data = { authenticated: signedIn, hasPassword: account.hasPassword === true, profile: clone(profile), applications: [], groups: [], sites: [clone(site)] };
  Object.defineProperty(window, 'crypto', { value: crypto });
  window.Blob = Blob; window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test-private-download'; };
  window.URL.revokeObjectURL = () => {};
  window.Worker = class extends window.EventTarget {
    constructor(url, options) { super(); this.url = url; this.options = options; this.terminated = false; this.states = new Set(); workers.push(this); }
    postMessage(message) {
      passwordCalls.push(clone(message));
      queueMicrotask(() => {
        if (this.terminated) return;
        const { id, method, params } = message; let result;
        if (method.endsWith('.start')) { const stateId = `fictional-state-${id}`; this.states.add(stateId); result = { stateId, ...(method === 'registration.start' ? { registrationRequest: 'fictional-registration-request' } : { startLoginRequest: 'fictional-login-request' }) }; }
        else if (method.endsWith('.finish')) { assert.equal(this.states.delete(params.stateId), true); result = method === 'registration.finish' ? { registrationRecord: 'fictional-registration-record' } : { finishLoginRequest: 'fictional-login-proof' }; }
        else if (method === 'cancel') { this.states.delete(params.stateId); result = { cleared: true }; }
        else if (method === 'clear') { this.states.clear(); result = { cleared: true }; }
        else assert.fail(`Unexpected password worker method: ${method}`);
        this.dispatchEvent(new window.MessageEvent('message', { data: { id, ok: true, result } }));
      });
    }
    terminate() { this.terminated = true; this.states.clear(); }
  };
  window.SimpleWebAuthnBrowser = {
    startRegistration: async value => { ceremonies.push({ kind: 'registration', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; },
    startAuthentication: async value => { ceremonies.push({ kind: 'authentication', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; }, ...webauthn,
  };
  window.fetch = async (path, options = {}) => {
    const url = new URL(path, BASE), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, search: url.search, options, body });
    const custom = await override?.({ path: url.pathname, url, options, body, data, calls }); if (custom) return custom;
    if (url.pathname === '/api/auth/session') return json({ authenticated: data.authenticated, identity: data.authenticated ? { ...account, hasPassword: data.hasPassword } : null, authConfigured: true, passwordAvailable: true, bootstrapAvailable: true });
    if (url.pathname === '/api/auth/invitation') return json({ invitation: { displayName: account.displayName, username: account.username, role: 'participant', siteId: null, siteName: null, expiresAt: '2026-11-29T10:00:00.000Z' } });
    const passwordRoute = /^\/api\/auth\/password\/([^/]+)\/(options|verify)$/.exec(url.pathname);
    if (passwordRoute) {
      const registration = ['register', 'bootstrap', 'activate', 'recover', 'change'].includes(passwordRoute[1]);
      if (passwordRoute[2] === 'options') return json({ ceremonyId: 'fictional-password-ceremony', ...(registration ? { registrationResponse: 'fictional-registration-response' } : { loginResponse: 'fictional-login-response' }) });
      data.authenticated = true; if (registration) data.hasPassword = true;
      return json({ identity: { ...account, hasPassword: data.hasPassword }, ...(!['login', 'reauth'].includes(passwordRoute[1]) ? { recoveryCodes: ['TEST-CODE-01', 'TEST-CODE-02', 'TEST-CODE-03', 'TEST-CODE-04', 'TEST-CODE-05', 'TEST-CODE-06', 'TEST-CODE-07', 'TEST-CODE-08'] } : {}) });
    }
    if (/\/api\/auth\/(?:register|bootstrap|activate|recover|login|recovery-codes)\/options$/.test(url.pathname)) return json({ ceremonyId: 'fictional-ceremony', options: { challenge: 'fictional-challenge' } });
    if (/\/api\/auth\/(?:register|bootstrap|activate|recover|login|recovery-codes)\/verify$/.test(url.pathname)) { data.authenticated = true; return json({ identity: account, ...(!url.pathname.includes('/login/') ? { recoveryCodes: ['TEST-CODE-01', 'TEST-CODE-02', 'TEST-CODE-03', 'TEST-CODE-04', 'TEST-CODE-05', 'TEST-CODE-06', 'TEST-CODE-07', 'TEST-CODE-08'] } : {}) }); }
    if (url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/sessions/revoke') { data.authenticated = false; return json({ ok: true }); }
    if (url.pathname === '/api/member/profile') {
      if (options.method === 'PATCH') { data.profile = { ...body, version: body.expectedVersion + 1 }; delete data.profile.expectedVersion; }
      return json({ profile: data.profile });
    }
    if (url.pathname === '/api/member/sites') return json({ sites: data.sites, total: data.sites.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/member/applications') {
      if (options.method === 'POST') { data.applications.push({ ...body, status: 'submitted', version: 1, siteName: site.name }); return json({ application: data.applications.at(-1) }, 201); }
      return json({ applications: data.applications, total: data.applications.length, page: 1, pageSize: 50 });
    }
    if (url.pathname === '/api/member/groups') return json({ groups: data.groups, total: data.groups.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/committee/sites') return json({ sites: account.webmaster ? data.sites : [], total: account.webmaster ? data.sites.length : 0, page: 1, pageSize: 50 });
    if (url.pathname === '/api/webmaster/sites') return json({ sites: data.sites, total: data.sites.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/webmaster/accounts') return json({ accounts: [account], total: 1, page: 1, pageSize: 25 });
    if (url.pathname === '/api/webmaster/committee-invitations') return json({ invitations: [], total: 0, page: 1, pageSize: 25 });
    if (url.pathname === '/api/auth/passkeys') return json({ hasPassword: data.hasPassword, passkeys: [{ id: 'test-key', name: 'Fictional device', createdAt: '2026-11-27' }] });
    if (url.pathname === '/api/member/export') return json({ profile: data.profile, applications: data.applications });
    if (url.pathname === '/api/learning/courses') return json({ courses: [] });
    return json({ error: `Test route not configured: ${url.pathname}`, code: 'not_found' }, 404);
  };
  const $ = id => window.document.getElementById(id);
  const set = (form, name, val) => {
    const element = form.elements.namedItem(name); assert.ok(element, name);
    if (element.type === 'checkbox') element.checked = val; else element.value = val;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  async function until(predicate) {
    for (let i = 0; i < 600; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 4)); }
    assert.fail(`UI timed out: ${$('portal-status').textContent}`);
  }
  const idle = () => until(() => $('main').getAttribute('aria-busy') === 'false');
  const submit = form => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  window.eval(script);
  return { window, $, set, submit, idle, until, calls, downloads, ceremonies, passwordCalls, workers, data };
}

test('signed-out portal keeps private data unloaded and cancelled passkeys do not verify or create accounts', async t => {
  const f = fixture(t, { signedIn: false, webauthn: { startAuthentication: async () => { throw new DOMException('Cancelled', 'NotAllowedError'); } } });
  await f.idle();
  assert.equal(f.$('portal-signed-out').hidden, false); assert.equal(f.$('portal-signed-in').hidden, true);
  assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
  f.set(f.$('portal-passkey-login'), 'username', 'test.participant'); f.submit(f.$('portal-passkey-login')); await f.idle();
  assert.match(f.$('portal-status').textContent, /cancelled or timed out/);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
  assert.equal(f.$('portal-passkey-login').elements.username.value, 'test.participant');
  assert.equal(f.workers.length, 0);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('Learning & work loads privately, saves preferences and clears the view on logout', async t => {
  let profile = { pathways: [], availableFrom: '', availableUntil: '', english: '', skills: '', licences: '', version: 0 };
  const f = fixture(t, { override: ({ path, options, body }) => {
    if (path === '/api/learning/profile') {
      if (options.method === 'PATCH') {
        const { expectedVersion, ...values } = body;
        profile = { ...values, version: expectedVersion + 1 };
      }
      return json({ profile });
    }
    if (path === '/api/learning/completions') return json({ completions: [{ title: 'PLFC officer onboarding and handover', provider: 'PLFC', revision: 1, completedAt: '2026-11-28T10:00:00Z' }] });
    if (path === '/api/learning/evidence') return json({ evidence: [] });
    return null;
  } });
  await f.idle();
  assert.equal(f.calls.some(call => call.path.startsWith('/api/learning/')), false);
  f.$('tab-learning').click();
  await f.idle();
  assert.equal(f.$('panel-learning').hidden, false);
  assert.match(f.$('portal-learning-completions').textContent, /PLFC officer onboarding and handover.*Course version 1/);
  const form = f.$('portal-learning-profile');
  f.set(form, 'skills', 'Fictional media production');
  form.querySelector('[value="volunteering"]').checked = true;
  f.submit(form);
  await f.idle();
  assert.equal(profile.skills, 'Fictional media production');
  assert.deepEqual(profile.pathways, ['volunteering']);
  f.$('portal-logout').click();
  await f.idle();
  assert.equal(form.elements.skills.value, '');
  assert.equal(f.$('portal-learning-completions').textContent, '');
  assert.equal(f.$('portal-learning-content').hidden, true);
});

test('members start a private course, mark a lesson and submit the practical from Learning & work', async t => {
  const course = { id:'plfc-officer-handover', revision:1, title:'PLFC handover', description:'Practise an officer handover.',
    categoryName:'Committee roles and handovers', provider:'PLFC', lessonCount:1, lessonsDone:0, enrolmentId:null,
    lessons:[{ title:'First meeting',body:'Prepare a handover list.' }], practical:'Write a fictional handover.',
    progress:[], assessment:null, practicalStatus:null };
  const target = '/api/learning/courses/plfc-officer-handover/1';
  const f = fixture(t, { override: ({ path,body }) => {
    if (path === '/api/learning/profile') return json({ profile:{ pathways:[],availableFrom:'',availableUntil:'',english:'',skills:'',licences:'',version:0 } });
    if (path === '/api/learning/evidence') return json({ evidence:[] });
    if (path === '/api/learning/completions') return json({ completions:[] });
    if (path === '/api/learning/courses') return json({ courses:[course] });
    if (path === target + '/enrol') course.enrolmentId = 'fictional-enrolment';
    if (path === target + '/progress') { course.progress.push(body.number); course.lessonsDone = 1; }
    if (path === target + '/practical') {
      course.assessment = { status:'submitted',attempt:1,response:body.response };
      course.practicalStatus = 'submitted';
    }
    if (path.startsWith(target)) return json({ course });
    return null;
  } });
  const click = async (container, label) => {
    const buttons = [...f.$(container).querySelectorAll('button')];
    const selected = buttons.find(item => item.textContent === label);
    assert.ok(selected, label);
    selected.click();
    await f.idle();
  };
  await f.idle();
  f.$('tab-learning').click();
  await f.idle();
  await click('portal-courses-catalogue','Open course');
  await click('portal-courses-reader','Start course');
  await click('portal-courses-reader','Mark lesson complete');
  const form = f.$('portal-courses-reader').querySelector('form');
  f.set(form,'response','A fictional handover with named actions.');
  f.submit(form);
  await f.idle();
  assert.match(f.$('portal-courses-reader').textContent,/Awaiting assessment/);
  assert.deepEqual(f.calls.find(call => call.path === target + '/practical').body,
    { response:'A fictional handover with named actions.',previousAttempt:0 });
});

test('the Webmaster can edit a PLFC draft and publish from the scoped course builder', async t => {
  const draft = { id:'plfc-officer-handover',revision:1,title:'PLFC handover',description:'Prepare for an officer handover.',
    state:'draft',editVersion:1,lessons:[{title:'Handover list',body:'Read the minutes.'}],practical:'Draft a fictional handover.' };
  const group = { id:'plfc-training',name:'Point Lookout Fishing Club training' };
  const f = fixture(t, { account:{ ...identity,webmaster:true,authentication:'password' }, override:({path,body}) => {
    if (path === '/api/learning/course-staff/groups') return json({ groups:[group] });
    if (path === '/api/learning/course-staff/groups/plfc-training') return json({group,versions:[draft],categories:[],queue:[]});
    if (path === '/api/learning/course-staff/drafts/plfc-officer-handover/1') {
      assert.equal(body.editVersion,draft.editVersion);
      if (body.action === 'save') { draft.title = body.title; draft.editVersion++; }
      if (body.action === 'publish') draft.state = 'published';
      return json({id:draft.id,revision:1});
    }
    return null;
  } });
  await f.idle();
  f.$('tab-course-staff').click();
  await f.idle();
  const versions = f.$('portal-courses-versions');
  versions.querySelectorAll('button')[1].click();
  const form = f.$('portal-courses-editor').querySelector('form');
  f.set(form,'title','PLFC officer handover');
  f.submit(form);
  await f.idle();
  assert.match(versions.textContent,/PLFC officer handover/);
  versions.querySelector('details').open = true;
  versions.querySelector('details button').click();
  await f.idle();
  assert.match(versions.textContent,/Published/);
});

test('registration accepts a simple one-character password with explicit consent and privately displayed recovery codes', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-register');
  assert.equal(form.elements.consent.checked, false);
  for (const [name, val] of Object.entries({ username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', password: PASSWORD, confirmPassword: PASSWORD, consent: true })) f.set(form, name, val);
  f.submit(form); await f.idle();
  const options = f.calls.find(call => call.path === '/api/auth/password/register/options');
  assert.deepEqual(options.body, { username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', consentAccount: true, consentVersion: '2026-11-27', registrationRequest: 'fictional-registration-request' });
  assert.equal(options.options.credentials, 'same-origin'); assert.equal(options.options.cache, 'no-store');
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.passwordCalls[0].method, 'registration.start');
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(JSON.stringify(PASSWORD))), false);
  assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('portal-code-list').children.length, 8);
  assert.equal(f.downloads.length, 0, 'Recovery codes are downloaded only on request.');
  assert.equal(f.$('tab-webmaster').hidden, true); assert.equal(f.$('tab-committee').hidden, true);
  assert.equal(f.$('portal-participant-view').hidden, true); assert.equal(f.$('portal-title').textContent, 'Member portal');
  assert.equal(f.$('portal-recovery-codes').tagName, 'DETAILS'); assert.equal(f.$('portal-recovery-codes').open, false);
  assert.equal(f.$('recovery-title').textContent, 'Optional recovery codes'); assert.equal(f.$('portal-codes-saved').textContent, 'Dismiss');
  f.$('tab-applications').click(); assert.equal(f.$('panel-applications').hidden, false, 'Recovery codes do not gate the portal.');
  f.$('portal-recovery-codes').open = true;
  f.$('portal-download-codes').click(); assert.equal(f.downloads.length, 1); assert.match(await f.downloads[0].text(), /TEST-CODE-01/);
  f.$('portal-codes-saved').click(); assert.equal(f.$('portal-code-list').children.length, 0); assert.equal(f.$('portal-recovery-codes').hidden, true);
  assert.equal(form.elements.password.value, ''); assert.equal(form.elements.confirmPassword.value, '');
  assert.equal(form.elements.usePasskey.checked, false);
});

test('activation token is removed from the URL, looks up invitation context privately and requires explicit account consent', async t => {
  const f = fixture(t, { signedIn: false, hash: '#invite=fictional-private-token' }); await f.idle();
  assert.equal(f.window.location.hash, ''); assert.equal(f.$('portal-activation').hidden, false);
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/invitation').body, { token: 'fictional-private-token' });
  assert.equal(f.calls.some(call => call.path.endsWith('/options')), false);
  assert.equal(f.$('portal-activate').elements.consent.checked, false);
  for (const [name, value] of Object.entries({ consent: true, password: PASSWORD, confirmPassword: PASSWORD })) f.set(f.$('portal-activate'), name, value);
  f.submit(f.$('portal-activate')); await f.idle();
  const sent = f.calls.find(call => call.path === '/api/auth/password/activate/options');
  assert.deepEqual(sent.body, { token: 'fictional-private-token', consentAccount: true, consentVersion: '2026-11-27', registrationRequest: 'fictional-registration-request' });
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.window.document.body.textContent.includes('fictional-private-token'), false);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('typed password sign-in preserves spaces, normalises Unicode and never invokes a passkey prompt', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle();
  const form = f.$('portal-login'), password = ' e\u0301 ';
  assert.equal(f.workers.length, 0, 'Password cryptography begins only after an explicit submit.');
  f.set(form, 'username', identity.username); f.set(form, 'password', password); f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 0); assert.equal(f.$('portal-signed-in').hidden, false);
  assert.equal(f.workers[0].url, '/password-crypto-worker.js'); assert.equal(f.workers[0].options.type, 'module');
  assert.equal(f.passwordCalls[0].params.password, password.normalize('NFC'));
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/login/options').body, { username: identity.username, startLoginRequest: 'fictional-login-request' });
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/login/verify').body, { ceremonyId: 'fictional-password-ceremony', finishLoginRequest: 'fictional-login-proof' });
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(password.normalize('NFC'))), false);
  assert.equal(form.elements.password.value, ''); assert.equal(f.workers[0].states.size, 0);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('password input rejects over 128 Unicode code points without silently truncating pasted text', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle();
  const form = f.$('portal-login'), password = '😀'.repeat(128);
  assert.equal(form.elements.password.hasAttribute('maxlength'), false);
  f.set(form, 'username', identity.username);
  f.set(form, 'password', password + '😀'); f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /128 characters/);
  assert.equal(f.passwordCalls.length, 0);
  f.set(form, 'password', password); f.submit(form); await f.idle();
  assert.equal(f.passwordCalls[0].params.password, password);
});

test('webmasters land in administration after sign-in or session reload without loading participant records', async t => {
  const admin = { ...identity, webmaster: true };
  for (const signedIn of [false, true]) {
    const f = fixture(t, { account: admin, signedIn }); await f.idle();
    if (!signedIn) { const form = f.$('portal-login'); f.set(form, 'username', admin.username); f.set(form, 'password', PASSWORD); f.submit(form); await f.idle(); }
    assert.equal(f.$('portal-title').textContent, 'Webmaster administration');
    assert.equal(f.$('portal-admin-intro').hidden, false); assert.equal(f.$('portal-member-intro').hidden, true);
    assert.equal(f.$('panel-webmaster').hidden, false); assert.equal(f.$('tab-webmaster').getAttribute('aria-selected'), 'true');
    for (const panel of ['profile', 'learning', 'applications', 'groups']) { assert.equal(f.$(`tab-${panel}`).hidden, true); assert.equal(f.$(`panel-${panel}`).hidden, true); }
    assert.equal(f.$('tab-committee').hidden, false); assert.equal(f.$('tab-security').hidden, false);
    assert.ok(f.$('panel-webmaster').querySelector('a[href="manage.html"]'));
    assert.equal(f.$('portal-participant-view').textContent, 'Open participant view (optional)');
    assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
    assert.ok(f.calls.some(call => call.path === '/api/webmaster/accounts')); assert.ok(f.calls.some(call => call.path === '/api/webmaster/sites'));
    assert.ok(f.calls.some(call => call.path === '/api/committee/sites'));
    assert.equal(f.calls.some(call => /\/api\/auth\/password\/(?:register|bootstrap)\//.test(call.path)), false);
    f.$('tab-security').click(); await f.idle(); assert.equal(f.$('panel-security').hidden, false);
    assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
  }
});

test('webmasters enter and leave the optional participant view without saving or losing edits', async t => {
  const f = fixture(t, { account: { ...identity, webmaster: true } }); await f.idle();
  f.$('portal-participant-view').click(); await f.idle();
  assert.equal(f.$('portal-title').textContent, 'Participant view'); assert.equal(f.$('portal-participant-view').textContent, 'Back to administration');
  assert.equal(f.$('tab-profile').hidden, false); assert.equal(f.$('panel-profile').hidden, false);
  assert.equal(f.$('tab-webmaster').hidden, true);
  for (const path of ['/api/member/profile', '/api/member/sites', '/api/member/applications', '/api/member/groups']) assert.equal(f.calls.filter(call => call.path === path).length, 1);
  const form = f.$('portal-profile'); f.set(form, 'about', 'An optional unsaved participant detail.');
  f.$('portal-participant-view').click(); await f.idle();
  assert.equal(f.$('portal-title').textContent, 'Webmaster administration'); assert.equal(f.$('panel-webmaster').hidden, false); assert.equal(f.$('tab-profile').hidden, true);
  f.$('portal-participant-view').click(); await f.idle();
  assert.equal(form.elements.about.value, 'An optional unsaved participant detail.');
  assert.equal(f.calls.filter(call => call.path === '/api/member/profile').length, 1);
  assert.equal(f.calls.some(call => call.options.method !== 'GET'), false, 'Changing views never saves a profile or changes account access.');
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('slow or failed administration loading never reveals the webmaster participant form', async t => {
  let finishAccounts;
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path }) => path === '/api/webmaster/accounts' ? new Promise(resolve => { finishAccounts = resolve; }) : null });
  await f.until(() => !!finishAccounts);
  assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('panel-webmaster').hidden, false); assert.equal(f.$('panel-profile').hidden, true);
  finishAccounts(json({ error: 'Accounts could not be loaded. Please try again.' }, 503)); await f.idle();
  assert.equal(f.$('panel-webmaster').hidden, false); assert.equal(f.$('panel-profile').hidden, true);
  assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
});

test('inline password controls reveal independent fields without submitting, moving focus or changing values', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle();
  const inputs = [...f.window.document.querySelectorAll('[data-account-password]')];
  for (const input of inputs) {
    const toggle = input.closest('.portal-password-control').querySelector('[data-password-toggle]');
    assert.equal(input.type, 'password'); assert.equal(input.labels.length, 1);
    assert.equal(toggle.type, 'button'); assert.equal(toggle.getAttribute('aria-controls'), input.id);
    assert.equal(toggle.getAttribute('aria-label'), 'Show password'); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.querySelector('svg').getAttribute('aria-hidden'), 'true');
  }
  assert.equal(f.$('portal-bootstrap').elements.bootstrapKey.closest('.portal-password-control'), null);
  assert.equal(f.$('portal-recover').elements.recoveryCode.closest('.portal-password-control'), null);
  const form = f.$('portal-register'), password = form.elements.password, confirmation = form.elements.confirmPassword;
  const first = password.closest('.portal-password-control').querySelector('button'), second = confirmation.closest('.portal-password-control').querySelector('button');
  const requests = f.calls.length; let submissions = 0; form.addEventListener('submit', () => submissions++);
  f.set(form, 'password', ' first value '); f.set(form, 'confirmPassword', 'second value');
  first.focus(); first.click();
  assert.equal(f.window.document.activeElement, first); assert.equal(password.type, 'text'); assert.equal(confirmation.type, 'password');
  assert.equal(first.getAttribute('aria-label'), 'Hide password'); assert.equal(first.getAttribute('aria-pressed'), 'true');
  second.click(); first.click();
  assert.equal(password.type, 'password'); assert.equal(confirmation.type, 'text');
  assert.equal(password.value, ' first value '); assert.equal(confirmation.value, 'second value');
  assert.equal(password.autocomplete, 'new-password'); assert.equal(confirmation.autocomplete, 'new-password');
  assert.equal(submissions, 0); assert.equal(f.calls.length, requests); assert.equal(f.workers.length, 0);
  form.reset();
  assert.equal(password.type, 'password'); assert.equal(confirmation.type, 'password'); assert.equal(confirmation.value, '');
  assert.equal(second.getAttribute('aria-label'), 'Show password'); assert.equal(second.getAttribute('aria-pressed'), 'false');
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('password reveal resets when changing portal views and signing out', async t => {
  const f = fixture(t); await f.idle(); f.$('tab-security').click(); await f.idle();
  const form = f.$('portal-password'), input = form.elements.currentPassword;
  const toggle = input.closest('.portal-password-control').querySelector('button');
  f.set(form, 'currentPassword', 'a'); toggle.click(); assert.equal(input.type, 'text');
  f.$('tab-profile').click(); assert.equal(input.type, 'password'); assert.equal(input.value, 'a');
  f.$('tab-security').click(); await f.idle(); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  toggle.click(); assert.equal(input.type, 'text'); f.$('portal-logout').click(); await f.idle();
  assert.equal(input.type, 'password'); assert.equal(input.value, ''); assert.equal(toggle.getAttribute('aria-label'), 'Show password');
  assert.equal(f.$('portal-signed-in').hidden, true);
});

test('optional passkey registration happens only after selecting it explicitly', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-register');
  for (const [name, value] of Object.entries({ username: 'optional.passkey', displayName: 'Fictional Participant', email: 'fictional@example.test', consent: true, usePasskey: true })) f.set(form, name, value);
  form.elements.usePasskey.dispatchEvent(new f.window.Event('change', { bubbles: true }));
  assert.equal(f.$('register-passwords').hidden, true); assert.equal(form.elements.password.required, false);
  f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 1); assert.equal(f.ceremonies[0].kind, 'registration');
  assert.equal(f.workers.length, 0); assert.ok(f.calls.some(call => call.path === '/api/auth/register/verify'));
  assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
});

test('activation and recovery use passkeys only after an explicit method choice', async t => {
  for (const scenario of [
    { form: 'portal-activate', prefix: 'activate', hash: '#invite=fictional-invitation-token', purpose: 'activate', fields: { consent: true }, expected: { token: 'fictional-invitation-token', consentAccount: true, consentVersion: '2026-11-27' } },
    { form: 'portal-recover', prefix: 'recover', hash: '', purpose: 'recover', fields: { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE' }, expected: { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE' } },
    { form: 'portal-activate', prefix: 'activate', hash: '#recover=fictional-recovery-token', purpose: 'recover', fields: {}, expected: { token: 'fictional-recovery-token' } },
  ]) {
    const f = fixture(t, { signedIn: false, hash: scenario.hash }); await f.idle(); const form = f.$(scenario.form);
    assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
    form.querySelector('details').open = true;
    assert.equal(f.ceremonies.length, 0); assert.equal(f.workers.length, 0);
    for (const [name, value] of Object.entries({ ...scenario.fields, usePasskey: true })) f.set(form, name, value);
    form.elements.usePasskey.dispatchEvent(new f.window.Event('change', { bubbles: true }));
    assert.equal(f.$(`${scenario.prefix}-passwords`).hidden, true); assert.equal(form.elements.password.required, false);
    f.submit(form); await f.idle();
    assert.deepEqual(f.calls.find(call => call.path === `/api/auth/${scenario.purpose}/options`).body, scenario.expected);
    assert.equal(f.ceremonies.length, 1); assert.equal(f.ceremonies[0].kind, 'registration'); assert.equal(f.workers.length, 0);
    assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
  }
});

test('bootstrap accepts a one-character password with matching confirmation and a separate setup authorisation key', async t => {
  const f = fixture(t, { signedIn: false, hash: '#setup' }); await f.idle(); const form = f.$('portal-bootstrap');
  const key = '1'.repeat(64);
  for (const [name, value] of Object.entries({ bootstrapKey: key, username: 'fictional.owner', displayName: 'Fictional Owner', email: 'owner@example.test', consent: true, password: PASSWORD, confirmPassword: 'Different fictional password' })) f.set(form, name, value);
  f.submit(form); await f.idle(); assert.match(f.$('portal-status').textContent, /do not match/); assert.equal(f.workers.length, 0);
  f.set(form, 'password', key); f.set(form, 'confirmPassword', key); f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /separate from the one-time setup authorisation key/);
  assert.equal(f.workers.length, 0); assert.equal(form.elements.bootstrapKey.value, key);
  f.set(form, 'password', PASSWORD); f.set(form, 'confirmPassword', PASSWORD); f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.calls.find(call => call.path === '/api/auth/password/bootstrap/options').body.bootstrapKey, key);
  assert.equal(f.passwordCalls.some(call => JSON.stringify(call.params).includes(key)), false, 'Setup authorisation does not enter password cryptography.');
  assert.equal(form.elements.bootstrapKey.value, '');
});

test('recovery uses a saved code to set a typed password without opening device authentication', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-recover');
  for (const [name, value] of Object.entries({ username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE', password: PASSWORD, confirmPassword: PASSWORD })) f.set(form, name, value);
  f.submit(form); await f.idle();
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/recover/options').body, { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE', registrationRequest: 'fictional-registration-request' });
  assert.equal(f.ceremonies.length, 0); assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('portal-code-list').children.length, 8);
  assert.equal(form.elements.recoveryCode.value, ''); assert.equal(form.elements.password.value, '');
});

test('retryable password errors and unchanged-account reauthentication preserve private drafts', async t => {
  let rejectCode = 'password_invalid';
  const f = fixture(t, { override: ({ path, options }) => {
    if (path === '/api/member/profile' && options.method === 'PATCH') return json({ error: 'Confirm your sign-in.', code: 'reauthentication_required' }, 403);
    if (path === '/api/auth/password/reauth/verify') return rejectCode ? json({ error: 'The password could not be confirmed.', code: rejectCode }, 401) : json({ identity: { ...identity, version: 2 } });
  } });
  await f.idle(); const profileForm = f.$('portal-profile'), form = f.$('portal-reauth-form');
  f.set(profileForm, 'about', 'Keep my private unsaved edit.'); f.submit(profileForm); await f.idle();
  assert.equal(f.$('portal-reauth').hidden, false); assert.equal(form.hidden, false);
  for (const code of ['password_invalid', 'invalid_ceremony']) {
    rejectCode = code; f.set(form, 'password', 'Incorrect fictional password'); f.submit(form); await f.idle();
    assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(profileForm.elements.about.value, 'Keep my private unsaved edit.'); assert.equal(form.elements.password.value, '');
  }
  rejectCode = ''; f.set(form, 'password', PASSWORD); f.submit(form); await f.idle();
  assert.equal(f.$('portal-reauth').hidden, true); assert.equal(profileForm.elements.about.value, 'Keep my private unsaved edit.');
  assert.equal(f.ceremonies.length, 0);
});

test('reauthentication removes previous administrator data when webmaster access has been revoked', async t => {
  const admin = { ...identity, webmaster: true };
  for (const method of ['password', 'passkey']) {
    const path = method === 'password' ? '/api/auth/password/reauth/verify' : '/api/auth/login/verify';
    const f = fixture(t, { account: admin, override: request => request.path === path ? json({ identity: { ...admin, webmaster: false, version: 2 } }) : null }); await f.idle();
    assert.ok(f.$('portal-account-list').children.length > 0);
    f.$('portal-reauth').hidden = false;
    if (method === 'password') { const form = f.$('portal-reauth-form'); f.set(form, 'password', PASSWORD); f.submit(form); }
    else f.$('portal-reauth-button').click();
    await f.idle();
    assert.equal(f.$('portal-title').textContent, 'Member portal'); assert.equal(f.$('tab-webmaster').hidden, true);
    assert.equal(f.$('portal-participant-view').hidden, true); assert.equal(f.$('portal-account-list').textContent, '');
    assert.equal(f.$('portal-account-editor').hidden, true); assert.equal(f.$('panel-profile').hidden, false);
    assert.match(f.$('portal-status').textContent, /Account access has changed/);
  }
});

test('an unexpected account returned by optional passkey reauthentication replaces the prior account view', async t => {
  const admin = { ...identity, webmaster: true };
  const other = { ...identity, accountId: '09fea21e-965b-424b-9de3-78c375b6a0d5', username: 'fictional.other', displayName: 'Fictional Other', email: 'other@example.test' };
  let switched = false;
  const f = fixture(t, { account: admin, override: ({ path }) => {
    if (path === '/api/auth/login/verify') { switched = true; return json({ identity: other }); }
    if (switched && path === '/api/member/profile') return json({ profile: { ...profile, accountId: other.accountId, displayName: other.displayName, email: other.email } });
    if (switched && path === '/api/committee/sites') return json({ sites: [], total: 0, page: 1, pageSize: 50 });
  } }); await f.idle();
  assert.ok(f.$('portal-account-list').children.length > 0); f.$('portal-reauth').hidden = false; f.$('portal-reauth-button').click(); await f.idle();
  assert.equal(f.$('portal-account-name').textContent, other.displayName); assert.match(f.$('portal-account-label').textContent, /@fictional\.other/);
  assert.equal(f.$('portal-profile').elements.email.value, other.email); assert.equal(f.$('portal-account-list').textContent, '');
  assert.equal(f.$('tab-webmaster').hidden, true); assert.equal(f.$('portal-title').textContent, 'Member portal');
  assert.match(f.$('portal-status').textContent, /Review the current account/);
});

test('expired or revoked sessions clear private data during password reauthentication or code renewal', async t => {
  for (const [path, formId] of [['/api/auth/password/reauth/options', 'portal-reauth-form'], ['/api/auth/password/recovery-codes/verify', 'portal-recovery-password']]) {
    const f = fixture(t, { override: request => request.path === path ? json({ error: 'Sign in to your account first.', code: 'sign_in_required' }, 401) : null }); await f.idle();
    f.set(f.$('portal-profile'), 'about', 'Private text from the expired session.');
    const form = f.$(formId); f.set(form, 'password', PASSWORD); f.submit(form); await f.idle();
    assert.equal(f.$('portal-signed-in').hidden, true); assert.equal(f.$('portal-signed-out').hidden, false);
    assert.equal(f.$('portal-profile').elements.about.value, ''); assert.equal(f.$('portal-profile').elements.email.value, '');
    assert.equal(f.$('portal-account-name').textContent, ''); assert.equal(f.$('portal-reauth').hidden, true);
    assert.equal(f.$('portal-recovery-codes').hidden, true); assert.equal(form.elements.password.value, '');
  }
});

test('changing a password confirms the current password first and rotates recovery codes without touching passkeys', async t => {
  const f = fixture(t); await f.idle(); f.$('tab-security').click(); await f.idle();
  const form = f.$('portal-password');
  for (const [name, value] of Object.entries({ currentPassword: 'Current fictional password', password: PASSWORD, confirmPassword: PASSWORD })) f.set(form, name, value);
  f.submit(form); await f.idle();
  assert.deepEqual(f.calls.filter(call => call.path.startsWith('/api/auth/password/')).map(call => call.path), ['/api/auth/password/reauth/options', '/api/auth/password/reauth/verify', '/api/auth/password/change/options', '/api/auth/password/change/verify']);
  assert.equal(f.ceremonies.length, 0); assert.equal(f.calls.some(call => call.options.method === 'DELETE'), false);
  assert.equal(f.$('portal-code-list').children.length, 8); assert.equal(form.elements.currentPassword.value, ''); assert.equal(form.elements.password.value, '');
  assert.equal(f.$('portal-passkey-list').querySelector('button').textContent, 'Remove this passkey', 'An optional last passkey can be removed when a password exists.');
  const recoveryForm = f.$('portal-recovery-password'); f.set(recoveryForm, 'password', PASSWORD); f.submit(recoveryForm); await f.idle();
  assert.ok(f.calls.some(call => call.path === '/api/auth/password/recovery-codes/verify')); assert.equal(f.ceremonies.length, 0);
});

test('a failed password options request discards worker state and clears typed credentials', async t => {
  const f = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/password/login/options' ? json({ error: 'Please try again shortly.' }, 503) : null }); await f.idle();
  const form = f.$('portal-login'); f.set(form, 'username', identity.username); f.set(form, 'password', PASSWORD); f.submit(form); await f.idle();
  assert.deepEqual(f.passwordCalls.map(call => call.method), ['login.start', 'cancel']);
  assert.equal(f.workers[0].states.size, 0); assert.equal(form.elements.password.value, ''); assert.equal(form.elements.username.value, identity.username);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
});

test('leaving during a password exchange terminates private worker state and cannot repopulate the page', async t => {
  let finishOptions;
  const f = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/password/login/options' ? new Promise(resolve => { finishOptions = resolve; }) : null }); await f.idle();
  const form = f.$('portal-login'); f.set(form, 'username', identity.username); f.set(form, 'password', PASSWORD); f.submit(form);
  await f.until(() => !!finishOptions);
  f.window.dispatchEvent(new f.window.Event('pagehide'));
  finishOptions(json({ ceremonyId: 'fictional-password-ceremony', loginResponse: 'fictional-login-response' })); await f.idle();
  assert.equal(f.workers[0].terminated, true); assert.equal(f.workers[0].states.size, 0); assert.equal(f.workers.length, 1);
  assert.equal(form.elements.password.value, ''); assert.equal(f.$('portal-signed-in').hidden, true);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
});

test('profile conflicts preserve unsaved text and use the previously loaded version', async t => {
  const f = fixture(t, { override: ({ path, options }) => path === '/api/member/profile' && options.method === 'PATCH' ? json({ error: 'This profile changed in another session.', code: 'record_conflict' }, 409) : null });
  await f.idle(); const form = f.$('portal-profile');
  f.set(form, 'about', 'My private unsaved edit.'); f.submit(form); await f.idle();
  const sent = f.calls.find(call => call.path === '/api/member/profile' && call.options.method === 'PATCH');
  assert.equal(sent.body.expectedVersion, 1); assert.equal(sent.body.about, 'My private unsaved edit.');
  assert.equal(form.elements.about.value, 'My private unsaved edit.'); assert.match(f.$('portal-status').textContent, /unsaved text is still here/);
  assert.equal(form.elements.about.disabled, false);
});

test('uncertain application saves retry the identical submission identifier and report only confirmed saves', async t => {
  let first = true;
  const f = fixture(t, { override: ({ path, options }) => { if (path === '/api/member/applications' && options.method === 'POST' && first) { first = false; throw new TypeError('Network response lost'); } } });
  await f.idle(); f.$('tab-applications').click();
  const form = f.$('portal-application');
  for (const [name, val] of Object.entries({ siteId: site.id, motivation: 'Help prepare a fictional community event.', skills: 'Fictional organising experience', availability: 'One morning a week', consentParticipation: true })) f.set(form, name, val);
  f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /did not confirm/); assert.equal(form.elements.motivation.value, 'Help prepare a fictional community event.');
  f.submit(form); await f.idle();
  const writes = f.calls.filter(call => call.path === '/api/member/applications' && call.options.method === 'POST');
  assert.equal(writes.length, 2); assert.equal(writes[0].body.id, writes[1].body.id); assert.deepEqual(writes[0].body, writes[1].body);
  assert.equal(writes[0].body.consentParticipation, true); assert.equal(writes[0].body.consentFutureHandover, false);
  assert.match(f.$('portal-status').textContent, /application has been saved/); assert.equal(f.data.applications.length, 1);
});

test('group content is rendered as text, unsafe document links are excluded and logout clears private values', async t => {
  const f = fixture(t, { override: ({ path }) => {
    if (path === '/api/member/groups') return json({ groups: [{ ...site, role: 'participant', legalMembershipStatus: 'not_admitted' }], total: 1, page: 1, pageSize: 50 });
    if (path === `/api/member/groups/${site.id}/bulletins`) return json({ bulletins: [{ id: 'test-post', title: '<img src=x onerror=alert(1)>', body: 'Private text <script>bad()</script>', label: 'Notice', link: 'javascript:alert(1)', version: 1 }], total: 1, page: 1, pageSize: 50 });
  } });
  await f.idle(); f.$('tab-groups').click(); f.$('portal-groups-list').querySelector('button').click(); await f.idle();
  assert.match(f.$('portal-post-list').textContent, /<script>bad\(\)<\/script>/);
  assert.equal(f.$('portal-post-list').querySelectorAll('script,img,a').length, 0);
  assert.match(f.$('portal-group-membership').textContent, /admission has not been recorded/);
  f.$('portal-logout').click(); await f.idle();
  assert.equal(f.$('portal-post-list').textContent, ''); assert.equal(f.$('portal-profile').elements.email.value, '');
  assert.equal(f.$('portal-signed-in').hidden, true); assert.equal(f.$('portal-signed-out').hidden, false);
});

test('public group selection loads subsequent pages rather than silently hiding groups after the first page', async t => {
  const f = fixture(t, { override: ({ path, url }) => {
    if (path !== '/api/member/sites') return null;
    const page = Number(url.searchParams.get('page') || 1);
    return json({ sites: [{ ...site, id: page === 1 ? 'first' : 'second', name: page === 1 ? 'First group' : 'Second group' }], total: 2, page, pageSize: 1 });
  } });
  await f.idle(); assert.ok(f.$('portal-application-details-more'));
  f.$('portal-application-details-more').click(); await f.idle();
  assert.deepEqual([...f.$('portal-application-workspace').options].map(option => option.value), ['', 'first', 'second']);
  assert.equal(f.$('portal-application-details-more'), null);
});

test('webmaster role editor fetches the exact selected account assignment and uses its version', async t => {
  const admin = { ...identity, webmaster: true };
  const f = fixture(t, { account: admin, override: ({ path, options, body }) => {
    if (path === `/api/webmaster/sites/${site.id}/roles/${identity.accountId}`) return json({ assignment: { accountId: identity.accountId, role: 'committee', version: 7 } });
    if (path === `/api/webmaster/sites/${site.id}/roles` && options.method === 'PUT') { assert.equal(body.expectedVersion, 7); assert.equal(body.role, 'none'); return json({ assignment: { ...body, version: 8 } }); }
  } });
  await f.idle(); f.$('tab-webmaster').click(); await f.idle();
  f.$('portal-account-list').querySelector('button').click();
  const selector = f.$('portal-role-workspace'); selector.value = site.id; selector.dispatchEvent(new f.window.Event('change', { bubbles: true })); await f.idle();
  assert.equal(f.$('portal-role').elements.role.value, 'committee');
  f.set(f.$('portal-role'), 'role', 'none'); f.submit(f.$('portal-role')); await f.idle();
  assert.ok(f.calls.some(call => call.path === `/api/webmaster/sites/${site.id}/roles` && call.options.method === 'PUT'));
});


test('portal profile and application forms persist through the real SQLite member service and reload correctly', async t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const name of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql', '0004_governance.sql', '0005_member_accounts.sql', '0006_member_services.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO member_accounts(id,username,display_name,email,status,webmaster,consent_account,consent_version,created_at,updated_at,created_by,original_payload_json,last_operation_id) VALUES(?,?,?,?, 'active',0,1,'2026-11-27',?,?,?,'{}',?)`).run(identity.accountId,identity.username,identity.displayName,identity.email,'2026-11-27T10:00:00.000Z','2026-11-27T10:00:00.000Z','fictional-test',crypto.randomUUID());
  const env = { DB: createSqliteD1(sqlite) };
  const override = async ({ path, url, options, body }) => {
    if (!path.startsWith('/api/member/') && !path.startsWith('/api/committee/')) return null;
    const request = new Request(url, { method: options.method, headers: { Origin: BASE, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return handleMemberServiceRequest(request, env, { identity, now: '2026-11-27T10:05:00.000Z', readJSON: async () => body });
  };
  const f = fixture(t, { override }); await f.idle();
  const form = f.$('portal-profile'); f.set(form, 'organisation', 'Fictional learning circle'); f.set(form, 'about', 'Help with practical learning.'); f.set(form, 'consentContact', true); f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /saved on the server/);
  assert.equal(sqlite.prepare('SELECT version FROM member_profiles WHERE account_id=?').get(identity.accountId).version, 1);
  f.$('tab-applications').click(); const applicationForm = f.$('portal-application');
  f.set(applicationForm, 'siteId', 'minjerribah'); f.set(applicationForm, 'motivation', 'Fictional test participation request.'); f.set(applicationForm, 'consentParticipation', true); f.submit(applicationForm); await f.idle();
  assert.match(f.$('portal-status').textContent, /application has been saved/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM member_applications WHERE account_id=?').get(identity.accountId).count, 1);
  const fresh = fixture(t, { override }); await fresh.idle();
  assert.equal(fresh.$('portal-profile').elements.organisation.value, 'Fictional learning circle');
  assert.match(fresh.$('portal-application-list').textContent, /Fictional test participation request/);
  assert.equal(fresh.$('portal-profile').elements.consentFutureHandover.checked, false);
});


test('explicit unconfigured owner setup generates a private key only on request and preserves edits when checking configuration', async t => {
  let configured = false;
  const override = ({ path }) => path === '/api/auth/session' ? json({ authenticated: false, identity: null, authConfigured: configured, bootstrapAvailable: configured, setupComplete: false }) : null;
  const f = fixture(t, { signedIn: false, hash: '#setup', override }); await f.idle();
  const form = f.$('portal-bootstrap');
  assert.equal(f.$('portal-setup').hidden, false); assert.equal(f.$('portal-signed-out').hidden, false);
  assert.equal(form.elements.bootstrapKey.value, '', 'No key is created before the owner requests one.');
  f.$('portal-generate-key').click(); const key = form.elements.bootstrapKey.value;
  assert.match(key, /^[a-f0-9]{64}$/); assert.equal(f.$('portal-generate-key').disabled, true);
  assert.equal(f.window.document.body.textContent.includes(key), false);
  assert.equal(f.window.location.href.includes(key), false);
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(key)), false);
  f.set(form, 'displayName', 'Fictional Owner'); configured = true;
  f.$('portal-check-setup').click(); await f.idle();
  assert.equal(form.elements.bootstrapKey.value, key); assert.equal(form.elements.displayName.value, 'Fictional Owner');
  assert.equal(f.$('portal-setup-help').hidden, true); assert.match(f.$('portal-status').textContent, /setup is ready/);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
  const publicView = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/session' ? json({ authenticated: false, identity: null, authConfigured: false, bootstrapAvailable: false }) : null });
  await publicView.idle(); assert.equal(publicView.$('portal-signed-out').hidden, true); assert.equal(publicView.$('portal-unavailable').hidden, false);
});


test('private recovery links stay with their named recipient and webmaster access is an explicit versioned change', async t => {
  const admin = { ...identity, webmaster: true };
  const alice = { ...identity, accountId: 'c08eb7cf-729b-4834-a5c0-28b17c6927f7', username: 'fictional.alice', displayName: 'Fictional Alice', email: 'alice@example.test' };
  const bob = { ...identity, accountId: '696d9634-3e36-47cb-9d0d-7a667dfcf3a8', username: 'fictional.bob', displayName: 'Fictional Bob', email: 'bob@example.test' };
  const f = fixture(t, { account: admin, override: ({ path, options, body }) => {
    if (path === '/api/webmaster/accounts' && options.method === 'GET') return json({ accounts: [alice, bob], total: 2, page: 1, pageSize: 25 });
    if (path === `/api/webmaster/accounts/${alice.accountId}/recovery-link`) { alice.version++; return json({ account: alice, token: 'fictional-alice-only-link', purpose: 'recovery', expiresAt: '2026-11-27T11:00:00.000Z' }); }
    if (path === `/api/webmaster/accounts/${bob.accountId}` && options.method === 'PATCH') { assert.deepEqual(body, { expectedVersion: 1, status: 'active', webmaster: true }); bob.webmaster = true; bob.version = 2; return json({ account: bob }); }
  } });
  await f.idle(); f.$('tab-webmaster').click(); await f.idle();
  f.$('portal-account-list').querySelectorAll('button')[0].click();
  f.$('portal-account-reset').click(); await f.idle();
  assert.equal(f.$('portal-private-link').hidden, false);
  assert.match(f.$('portal-private-link-help').textContent, /Fictional Alice \(@fictional.alice\)/);
  assert.match(f.$('portal-private-link-value').value, /fictional-alice-only-link/);
  f.$('portal-account-list').querySelectorAll('button')[1].click();
  assert.equal(f.$('account-editor-title').textContent, 'Fictional Bob');
  assert.equal(f.$('portal-private-link').hidden, true); assert.equal(f.$('portal-private-link-value').value, ''); assert.equal(f.$('portal-private-link-help').textContent, '');
  const form = f.$('portal-account-state'); assert.equal(form.elements.webmaster.checked, false);
  f.set(form, 'webmaster', true); f.submit(form); await f.idle();
  assert.equal(form.elements.webmaster.checked, true); assert.match(f.$('portal-account-info').textContent, /Version 2/);
  assert.ok(f.calls.some(call => call.path === `/api/webmaster/accounts/${bob.accountId}` && call.options.method === 'PATCH'));
});

const committeeInvite = overrides => ({ id: 'cc1b1286-73cc-45c8-bf02-e6b8dc9d1f36', accountId: 'fd125ef2-f0d7-47f7-a6e9-89dcf9e0f8b3', username: 'test.committee', displayName: 'Fictional Committee Person', email: 'committee@example.test', siteId: site.id, siteName: site.name, role: 'committee', status: 'pending', version: 1, createdAt: '2026-11-28T10:00:00.000Z', updatedAt: '2026-11-28T10:00:00.000Z', expiresAt: '2026-11-29T10:00:00.000Z', acceptedAt: null, cancelledAt: null, createdBy: `account:${identity.accountId}`, ...overrides });
const invitationAccount = invitation => ({ accountId: invitation.accountId, username: invitation.username, displayName: invitation.displayName, email: invitation.email, status: invitation.status === 'accepted' ? 'active' : 'invited', webmaster: false, version: 6 });
const invitationButton = (f, id, label) => [...f.$('portal-invitation-list').querySelector(`[data-invitation-id="${id}"]`).querySelectorAll('button')].find(button => button.textContent === label);
function completeCommitteeForm(f) {
  const form = f.$('portal-committee-invite');
  for (const [key, val] of Object.entries({ displayName: 'Fictional Committee Person', username: 'test.committee', email: 'committee@example.test', siteId: site.id })) f.set(form, key, val);
  return form;
}

test('webmaster creates a group-specific committee invitation without sending messages or opening account-editing forms', async t => {
  let saved;
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path, options, body }) => {
    if (path !== '/api/webmaster/committee-invitations') return;
    if (options.method === 'POST') { saved = committeeInvite({ id: body.id, ...body }); return json({ invitation: saved, account: invitationAccount(saved), token: 'fictional-committee-link', purpose: 'activation', expiresAt: saved.expiresAt, sent: false }, 201); }
    return json({ invitations: saved ? [saved] : [], total: saved ? 1 : 0, page: 1, pageSize: 25 });
  } });
  await f.idle();
  assert.equal(f.$('panel-webmaster').hidden, false); assert.equal(f.$('portal-committee-invite-details').open, false);
  assert.equal(f.$('committee-invitations-title').closest('details'), null);
  f.$('portal-committee-invite-details').open = true;
  const form = completeCommitteeForm(f); f.submit(form); await f.idle();
  const request = f.calls.find(call => call.path === '/api/webmaster/committee-invitations' && call.options.method === 'POST');
  assert.match(request.body.id, /^[a-f0-9-]{36}$/); assert.equal(request.body.siteId, site.id); assert.equal('webmaster' in request.body, false);
  assert.equal(f.$('portal-account-editor').hidden, true); assert.equal(f.$('portal-committee-invite-details').open, false);
  assert.equal(f.$('portal-private-link').hidden, false); assert.equal(f.$('portal-private-link-value').value, `${BASE}/portal.html#invite=fictional-committee-link`);
  assert.match(f.$('portal-private-link-help').textContent, /Committee access for Fictional island pilot/);
  assert.match(f.$('portal-status').textContent, /No message has been sent/);
  assert.match(f.$('portal-invitation-list').textContent, /Fictional Committee Person/);
  assert.equal(f.$('portal-invitation-list').textContent.includes('fictional-committee-link'), false);
  assert.equal(f.calls.some(call => /send|mail|notification/.test(call.path)), false); assert.equal(f.ceremonies.length, 0);
  let copied; Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  f.$('portal-copy-link').click(); await f.idle(); assert.equal(copied, `${BASE}/portal.html#invite=fictional-committee-link`);
  f.$('portal-logout').click(); await f.idle();
  assert.equal(f.$('portal-invitation-list').children.length, 0); assert.equal(f.$('portal-private-link-value').value, ''); assert.equal(form.elements.email.value, '');
});

test('committee invitation controls use saved versions for renewal, cancellation and explicit reopening', async t => {
  let invitation = committeeInvite();
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path, options, body }) => {
    if (path === '/api/webmaster/committee-invitations') return json({ invitations: [invitation], total: 1, page: 1, pageSize: 25 });
    if (!path.startsWith(`/api/webmaster/committee-invitations/${invitation.id}/`)) return;
    assert.equal(options.method, 'POST'); assert.equal(body.expectedVersion, invitation.version);
    const action = path.split('/').at(-1); invitation = { ...invitation, version: invitation.version + 1, status: action === 'cancel' ? 'cancelled' : 'pending', cancelledAt: action === 'cancel' ? '2026-11-28T11:00:00.000Z' : null };
    return json({ invitation, account: invitationAccount(invitation), ...(action === 'cancel' ? {} : { token: `fictional-${action}-link`, purpose: 'activation', expiresAt: invitation.expiresAt, sent: false }) });
  } });
  await f.idle();
  invitationButton(f, invitation.id, 'Renew private link').click(); await f.idle();
  assert.match(f.$('portal-private-link-value').value, /#invite=fictional-renew-link$/); assert.equal(invitation.version, 2);
  invitationButton(f, invitation.id, 'Cancel invitation').click(); await f.idle();
  assert.equal(invitation.status, 'cancelled'); assert.equal(f.$('portal-private-link').hidden, true); assert.equal(f.$('portal-private-link-value').value, '');
  assert.equal(invitationButton(f, invitation.id, 'Renew private link'), undefined); assert.equal(invitationButton(f, invitation.id, 'Cancel invitation'), undefined);
  invitationButton(f, invitation.id, 'Reopen invitation').click(); await f.idle();
  assert.equal(invitation.version, 4); assert.match(f.$('portal-private-link-value').value, /#invite=fictional-reopen-link$/);
  assert.ok(invitationButton(f, invitation.id, 'Cancel invitation'));
});

test('accepted committee invitations open the current account and exact group even beyond the loaded group page', async t => {
  const invitation = committeeInvite({ status: 'accepted', acceptedAt: '2026-11-28T11:00:00.000Z', siteId: 'later-group', siteName: 'Another local group' });
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path }) => {
    if (path === '/api/webmaster/committee-invitations') return json({ invitations: [invitation], total: 1, page: 1, pageSize: 25 });
    if (path === `/api/webmaster/committee-invitations/${invitation.id}`) return json({ invitation, account: invitationAccount(invitation) });
    if (path === `/api/webmaster/sites/${invitation.siteId}/roles/${invitation.accountId}`) return json({ assignment: { accountId: invitation.accountId, siteId: invitation.siteId, role: 'committee', version: 3 } });
  } });
  await f.idle();
  assert.equal(invitationButton(f, invitation.id, 'Renew private link'), undefined); assert.equal(invitationButton(f, invitation.id, 'Cancel invitation'), undefined);
  invitationButton(f, invitation.id, 'Manage account').click(); await f.idle();
  assert.match(f.$('portal-account-info').textContent, /Version 6/); assert.equal(f.$('portal-account-role-details').open, true);
  assert.equal(f.$('portal-role-workspace').value, invitation.siteId); assert.equal(f.$('portal-role').elements.role.value, 'committee');
  assert.equal(f.$('portal-private-link').hidden, true);
});

test('committee invitation pagination and search keep all returned records reachable and render names as text', async t => {
  const first = committeeInvite({ displayName: '<img src=x onerror=alert(1)>', status: 'expired' });
  const last = committeeInvite({ id: crypto.randomUUID(), displayName: 'Last test invitation', username: 'last.invitation' });
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path, url }) => {
    if (path !== '/api/webmaster/committee-invitations') return;
    const page = Number(url.searchParams.get('page')), search = url.searchParams.get('search');
    return json({ invitations: search || page === 2 ? [last] : [first], total: search ? 1 : 26, page, pageSize: 25 });
  } });
  await f.idle();
  assert.ok(invitationButton(f, first.id, 'Renew private link')); assert.equal(f.$('portal-invitation-list').querySelector('img'), null);
  assert.equal(f.$('portal-invitations-prev').disabled, true); assert.equal(f.$('portal-invitations-next').disabled, false);
  f.$('portal-invitations-next').click(); await f.idle();
  assert.match(f.$('portal-invitation-list').textContent, /Last test invitation/); assert.match(f.$('portal-invitations-page').textContent, /Page 2/);
  assert.equal(f.$('portal-invitations-next').disabled, true);
  f.set(f.$('portal-invitation-search'), 'search', 'last.invitation'); f.submit(f.$('portal-invitation-search')); await f.idle();
  const search = f.calls.filter(call => call.path === '/api/webmaster/committee-invitations').at(-1);
  assert.match(search.search, /page=1/); assert.match(search.search, /search=last.invitation/);
  assert.equal(f.$('portal-invitations-prev').disabled, true); assert.equal(f.$('portal-invitations-next').disabled, true);
});

test('committee invitation drafts and retry identity survive reauthentication and an uncertain create response', async t => {
  let attempts = 0, saved;
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path, options, body }) => {
    if (path !== '/api/webmaster/committee-invitations') return;
    if (options.method !== 'POST') return json({ invitations: saved ? [saved] : [], total: saved ? 1 : 0, page: 1, pageSize: 25 });
    attempts++;
    if (attempts === 1) return json({ code: 'reauthentication_required', error: 'Confirm your identity.' }, 403);
    saved = committeeInvite({ id: body.id, ...body });
    if (attempts === 2) throw new TypeError('Connection lost after save');
    return json({ invitation: saved, account: invitationAccount(saved) });
  } });
  await f.idle();
  const form = completeCommitteeForm(f); f.submit(form); await f.idle();
  assert.equal(f.$('portal-reauth').hidden, false); assert.equal(form.elements.email.value, 'committee@example.test');
  f.set(f.$('portal-reauth-form'), 'password', PASSWORD); f.submit(f.$('portal-reauth-form')); await f.idle();
  f.submit(form); await f.idle(); assert.match(f.$('portal-status').textContent, /server did not confirm/); assert.equal(form.elements.siteId.value, site.id);
  f.submit(form); await f.idle();
  const writes = f.calls.filter(call => call.path === '/api/webmaster/committee-invitations' && call.options.method === 'POST');
  assert.equal(new Set(writes.map(call => call.body.id)).size, 1); assert.equal(writes.length, 3);
  assert.equal(f.$('portal-private-link-value').value, ''); assert.equal(f.$('portal-private-link').hidden, true); assert.match(f.$('portal-status').textContent, /already saved/);
  assert.ok(invitationButton(f, saved.id, 'Renew private link')); assert.equal(form.elements.email.value, '');
});

test('committee recipient sees the group before accepting and invalid invitations never start credentials', async t => {
  const invitation = committeeInvite({ siteName: '<script>fictional()</script>' });
  for (const valid of [true, false]) {
    const f = fixture(t, { signedIn: false, hash: '#invite=fictional-committee-private-token', override: ({ path, body, options }) => {
      if (path !== '/api/auth/invitation') return;
      assert.deepEqual(body, { token: 'fictional-committee-private-token' }); assert.equal(options.method, 'POST'); assert.equal(options.cache, 'no-store');
      return valid ? json({ invitation }) : json({ error: 'This invitation has expired or been cancelled. Ask the webmaster for a new link.', code: 'invitation_unavailable' }, 401);
    } });
    await f.idle();
    assert.equal(f.window.location.hash, ''); assert.equal(f.$('portal-activate').hidden, !valid); assert.equal(f.ceremonies.length, 0); assert.equal(f.workers.length, 0);
    assert.equal(f.$('portal-activate').elements.consent.checked, false);
    assert.equal(f.calls.some(call => call.path.endsWith('/options') || call.path.endsWith('/verify')), false);
    assert.equal(f.$('portal-invitation-group').querySelector('script'), null);
    if (valid) { assert.match(f.$('portal-invitation-group').textContent, /Committee access/); assert.match(f.$('portal-invitation-explanation').textContent, /Activating this account accepts committee access/); }
    else { assert.match(f.$('portal-status').textContent, /expired or been cancelled/); assert.equal(f.$('portal-invitation-context').hidden, true); }
    f.$('portal-activation').querySelector('[data-auth-cancel]').click();
    assert.equal(f.$('portal-invitation-person').textContent, ''); assert.equal(f.$('portal-activation').hidden, true);
  }
});

test('invitation lists and draft personal details are cleared on role loss and late reads cannot repopulate a closed page', async t => {
  const invitation = committeeInvite();
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path }) => {
    if (path === '/api/webmaster/committee-invitations') return json({ invitations: [invitation], total: 1, page: 1, pageSize: 25 });
    if (path === '/api/auth/password/reauth/verify') return json({ identity });
  } });
  await f.idle(); const form = completeCommitteeForm(f);
  f.set(f.$('portal-reauth-form'), 'password', PASSWORD); f.submit(f.$('portal-reauth-form')); await f.idle();
  assert.equal(f.$('tab-webmaster').hidden, true); assert.equal(f.$('portal-invitation-list').children.length, 0); assert.equal(form.elements.email.value, '');
  let finish;
  const pending = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path }) => path === '/api/webmaster/committee-invitations' ? new Promise(resolve => { finish = resolve; }) : null });
  await pending.until(() => Boolean(finish)); pending.window.dispatchEvent(new pending.window.Event('pagehide'));
  finish(json({ invitations: [invitation], total: 1, page: 1, pageSize: 25 })); await pending.idle();
  assert.equal(pending.$('portal-invitation-list').children.length, 0); assert.equal(pending.$('portal-signed-in').hidden, true);
  assert.equal(pending.window.document.body.textContent.includes(invitation.email), false);
});

test('a direct webmaster permission denial clears invitation records, private links and unfinished drafts', async t => {
  let denied = false;
  const invitation = committeeInvite();
  const f = fixture(t, { account: { ...identity, webmaster: true }, override: ({ path, options }) => {
    if (path !== '/api/webmaster/committee-invitations') return;
    if (denied) return json({ error: 'Webmaster access is required.', code: 'webmaster_required' }, 403);
    if (options.method === 'POST') return json({ invitation, account: invitationAccount(invitation), token: 'fictional-private-committee-link', purpose: 'activation', expiresAt: invitation.expiresAt, sent: false });
    return json({ invitations: [invitation], total: 1, page: 1, pageSize: 25 });
  } });
  await f.idle();
  f.submit(completeCommitteeForm(f)); await f.idle();
  assert.equal(f.$('portal-private-link').hidden, false);
  const form = completeCommitteeForm(f); denied = true; f.$('portal-refresh-invitations').click(); await f.idle();
  assert.equal(f.$('portal-signed-in').hidden, true); assert.equal(f.$('portal-invitation-list').children.length, 0);
  assert.equal(f.$('portal-private-link-value').value, ''); assert.equal(form.elements.email.value, '');
  assert.equal(f.window.document.body.textContent.includes(invitation.email), false);
});
