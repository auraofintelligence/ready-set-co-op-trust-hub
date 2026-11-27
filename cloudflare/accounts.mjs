import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CONSENT_VERSION = '2026-11-27';
const SESSION_SECONDS = 8 * 60 * 60;
const CEREMONY_SECONDS = 5 * 60;
const BODY_LIMIT = 12 * 1024;
const MAX_PASSKEYS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
class AccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function fail(status, code, message) { throw new AccountError(status, code, message); }
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}
function rows(result) { return result?.results ?? []; }
function iso(value) { return new Date(typeof value === 'function' ? value() : value ?? Date.now()).toISOString(); }
function after(now, seconds) { return new Date(Date.parse(now) + seconds * 1000).toISOString(); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'invalid_fields', 'Check the fields in this request.');
}
function text(value, label, min = 1, max = 120) {
  if (typeof value !== 'string') fail(400, 'invalid_field', 'Enter ' + label + '.');
  const result = value.trim();
  if ([...result].length < min || [...result].length > max || /[\u0000-\u001f\u007f]/u.test(result)) fail(400, 'invalid_field', 'Check ' + label + '.');
  return result;
}
function username(value) {
  const result = text(value, 'a username', 3, 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(result)) fail(400, 'invalid_username', 'Use 3 to 40 letters, numbers, full stops, underscores or hyphens for your username.');
  return result;
}
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_id', 'Use a valid record identifier.');
  return value.toLowerCase();
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'invalid_version', 'Include the current account version.');
  return value;
}
function registration(data, { consent = true } = {}) {
  const email = text(data.email, 'a contact email address', 3, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) fail(400, 'invalid_email', 'Enter a contact email address.');
  if (consent && (data.consentAccount !== true || data.consentVersion !== CONSENT_VERSION)) fail(400, 'account_consent_required', 'Read and accept the account privacy information before continuing.');
  return { username: username(data.username), displayName: text(data.displayName, 'your name'), email,
    consentAccount: consent, consentVersion: consent ? CONSENT_VERSION : '' };
}
function secret(env) {
  return typeof env.READY_AUTH_SECRET === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(env.READY_AUTH_SECRET) ? env.READY_AUTH_SECRET : null;
}
function requireSecret(env) {
  const value = secret(env);
  if (!value) fail(503, 'auth_unavailable', 'Account sign-in needs its private setup key configured by the webmaster.');
  return value;
}
function location(request, env) {
  const url = new URL(request.url);
  const local = env.LOCAL_DEV === 'true' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) fail(403, 'secure_origin_required', 'Open the secure version of this website.');
  return { url, local };
}
function cookieName(kind, local) { return local ? 'ready_' + kind + '_local' : '__Host-ready_' + kind; }
function cookie(request, name) {
  const matches = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}
function cookieHeader(kind, value, local, seconds) {
  return cookieName(kind, local) + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + seconds + (local ? '' : '; Secure');
}
function randomHex(bytes = 32) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function unbase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(400, 'invalid_credential', 'The passkey response was not valid.');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(n => n.toString(16).padStart(2, '0')).join(''); }
async function keyed(env, domain, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(requireSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('ready-setco/' + domain + '/' + value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function missingSchema(error) { return /no such table:\s*(?:main\.)?member_/i.test(String(error?.message ?? error)); }
function conflict() { fail(409, 'account_conflict', 'This account changed. Reload its current details and try again.'); }
function invalidCeremony() { fail(401, 'invalid_ceremony', 'This sign-in request has expired or could not be verified. Start again.'); }
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) fail(415, 'json_required', 'Send application/json.');
  if (Number(request.headers.get('Content-Length')) > BODY_LIMIT) fail(413, 'body_too_large', 'The request is too large.');
  if (!request.body) fail(400, 'invalid_json', 'Send a JSON object.');
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > BODY_LIMIT) { await reader.cancel(); fail(413, 'body_too_large', 'The request is too large.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!object(value)) fail(400, 'invalid_json', 'Send a JSON object.');
    return value;
  } catch (error) {
    if (error instanceof AccountError) throw error;
    fail(400, 'invalid_json', 'Send a valid JSON object.');
  } finally { reader.releaseLock(); }
}
function mutation(request, origin) {
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, 'origin_not_allowed', 'Use the account page on this website.');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) fail(415, 'json_required', 'Send application/json.');
}
function trustedExternal(identity) { return identity?.webmaster === true && ['access', 'local'].includes(identity.authentication); }
function requireNative(identity, now, recent = false) {
  if (!identity || identity.authentication !== 'passkey' || identity.status !== 'active') fail(401, 'sign_in_required', 'Sign in to your account first.');
  if (recent && (!identity.sessionCreatedAt || Date.parse(now) - Date.parse(identity.sessionCreatedAt) > CEREMONY_SECONDS * 1000)) fail(403, 'reauthentication_required', 'Sign in with your passkey again before changing account security.');
}
function requireWebmaster(identity, now, recent = false) {
  if (!identity) fail(401, 'sign_in_required', 'Sign in to your account first.');
  if (!identity.webmaster || identity.status !== 'active') fail(403, 'webmaster_required', 'This action is available to the webmaster.');
  if (!trustedExternal(identity)) requireNative(identity, now, recent);
}
function actor(identity) { return trustedExternal(identity) ? identity.authentication + ':' + identity.accountId : 'account:' + identity.accountId; }
function actorGuard(identity, now, webmaster = false) {
  if (trustedExternal(identity)) return { sql: '1=1', values: [] };
  return { sql: "EXISTS (SELECT 1 FROM member_accounts actor_account JOIN member_sessions actor_session ON actor_session.account_id=actor_account.id WHERE actor_account.id=? AND actor_account.status='active' AND actor_account.auth_version=? AND actor_session.token_hash=? AND actor_session.auth_version=actor_account.auth_version AND actor_session.expires_at>?" + (webmaster ? ' AND actor_account.webmaster=1' : '') + ')',
    values: [identity.accountId, identity.authVersion, identity.sessionHash, now] };
}
function accountGuard(id, op) { return { sql: 'EXISTS (SELECT 1 FROM member_accounts WHERE id=? AND last_operation_id=?)', values: [id, op] }; }
function ceremonyGuard(id, op) { return { sql: 'EXISTS (SELECT 1 FROM member_auth_ceremonies WHERE id=? AND claim_id=?)', values: [id, op] }; }
function audit(db, id, who, action, now, details, guard) {
  return db.prepare('INSERT INTO member_auth_audit(id,account_id,actor,action,created_at,details_json) SELECT ?,?,?,?,?,? WHERE ' + guard.sql)
    .bind(crypto.randomUUID(), id, who, action, now, JSON.stringify(details), ...guard.values);
}
function rowIdentity(row, session = {}) {
  return { accountId: row.id, username: row.username, displayName: row.display_name, email: row.email,
    emailVerified: false, webmaster: row.webmaster === 1, status: row.status, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at,
    authVersion: row.auth_version, authentication: 'passkey', ...session };
}
export function publicAccount(value) {
  if (!value) return null;
  const v = value.id ? rowIdentity(value) : value;
  return { accountId: v.accountId, username: v.username, displayName: v.displayName, email: v.email,
    emailVerified: false, webmaster: Boolean(v.webmaster), status: v.status, version: v.version,
    createdAt: v.createdAt, updatedAt: v.updatedAt, lastLoginAt: v.lastLoginAt ?? null, authentication: v.authentication ?? 'passkey' };
}
export async function resolveAccountSession(request, env, { now } = {}) {
  let loc; try { loc = location(request, env); } catch { return null; }
  const token = cookie(request, cookieName('session', loc.local));
  if (!token || !TOKEN.test(token) || !secret(env) || !env.DB?.prepare) return null;
  try {
    const hash = await digest(token);
    const row = await env.DB.prepare("SELECT a.*,s.created_at AS session_created_at FROM member_sessions s JOIN member_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.status='active' AND s.auth_version=a.auth_version")
      .bind(hash, iso(now)).first();
    return row ? rowIdentity(row, { sessionHash: hash, sessionCreatedAt: row.session_created_at }) : null;
  } catch (error) { if (missingSchema(error)) return null; throw error; }
}
async function throttle(db, request, env, now, label, subject = '') {
  const { local } = location(request, env);
  const ip = request.headers.get('CF-Connecting-IP') ?? (local ? 'local-development' : null);
  if (!ip || ip.length > 64) fail(503, 'auth_unavailable', 'Account sign-in is temporarily unavailable.');
  const window = Math.floor(Date.parse(now) / (15 * 60 * 1000));
  const expiry = new Date((window + 1) * 15 * 60 * 1000).toISOString();
  const groups = [[label + '/ip/' + ip, 80]];
  if (subject) groups.push([label + '/subject/' + subject, 30], [label + '/pair/' + ip + '/' + subject, 20]);
  const statements = [];
  for (const [value] of groups) {
    statements.push(db.prepare('INSERT INTO member_auth_limits(bucket_hash,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET hits=hits+1 RETURNING hits')
      .bind(await keyed(env, 'rate', window + '/' + value), expiry));
  }
  const result = await db.batch(statements);
  if (result.some((item, index) => rows(item)[0]?.hits > groups[index][1])) fail(429, 'too_many_attempts', 'There have been too many attempts. Wait 15 minutes before trying again.');
}
async function cleanup(db, now) {
  await db.batch([
    db.prepare('DELETE FROM member_auth_limits WHERE bucket_hash IN (SELECT bucket_hash FROM member_auth_limits WHERE expires_at<=? LIMIT 200)').bind(now),
    db.prepare('DELETE FROM member_auth_ceremonies WHERE id IN (SELECT id FROM member_auth_ceremonies WHERE expires_at<=? LIMIT 100)').bind(now),
    db.prepare('DELETE FROM member_sessions WHERE token_hash IN (SELECT token_hash FROM member_sessions WHERE expires_at<=? LIMIT 100)').bind(now),
  ]);
}
async function getAccount(db, id) {
  const row = await db.prepare('SELECT * FROM member_accounts WHERE id=?').bind(id).first();
  if (!row) fail(404, 'account_not_found', 'The account was not found.');
  return row;
}
async function recoveryCodes(env, id) {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const raw = randomHex(20).toUpperCase(); const display = 'RSC-' + raw.match(/.{1,8}/g).join('-');
    codes.push({ id: crypto.randomUUID(), display, hash: await keyed(env, 'recovery-code', id + '/RSC' + raw) });
  }
  return codes;
}
function codeStatements(db, accountId, codes, now, guard) {
  return codes.map(code => db.prepare('INSERT INTO member_recovery_codes(id,account_id,code_hash,created_at) SELECT ?,?,?,? WHERE ' + guard.sql)
    .bind(code.id, accountId, code.hash, now, ...guard.values));
}
function revokeStatements(db, id, now, guard, { passkeys = false, codes = false, links = false, sessions = false } = {}) {
  const result = [];
  if (passkeys) result.push(db.prepare('UPDATE member_passkeys SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL AND ' + guard.sql).bind(now, id, ...guard.values));
  if (codes) result.push(db.prepare('UPDATE member_recovery_codes SET revoked_at=? WHERE account_id=? AND used_at IS NULL AND revoked_at IS NULL AND ' + guard.sql).bind(now, id, ...guard.values));
  if (links) result.push(db.prepare('UPDATE member_auth_links SET revoked_at=? WHERE account_id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND ' + guard.sql).bind(now, id, ...guard.values));
  if (sessions) result.push(db.prepare('DELETE FROM member_sessions WHERE account_id=? AND ' + guard.sql).bind(id, ...guard.values));
  return result;
}
async function makeSession(db, id, now, guard) {
  const token = randomHex();
  return { token, statement: db.prepare('INSERT INTO member_sessions(token_hash,account_id,auth_version,created_at,expires_at) SELECT ?,id,auth_version,?,? FROM member_accounts WHERE id=? AND ' + guard.sql)
    .bind(await digest(token), now, after(now, SESSION_SECONDS), id, ...guard.values) };
}
function addPasskey(db, id, info, label, rpID, now, op, guard) {
  const transports = (info.credential.transports ?? []).filter(value => ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(value));
  return db.prepare('INSERT INTO member_passkeys(id,account_id,rp_id,credential_id,public_key,counter,transports_json,device_type,backed_up,label,created_at,last_operation_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ' + guard.sql)
    .bind(crypto.randomUUID(), id, rpID, info.credential.id, base64url(info.credential.publicKey), info.credential.counter,
      JSON.stringify(transports), info.credentialDeviceType, Number(info.credentialBackedUp), label, now, op, ...guard.values);
}
async function createOptions(request, env, identity, purpose, data, now, loc) {
  const db = env.DB; let account = null; let payload = {}; let id = null;
  await throttle(db, request, env, now, purpose + '-options', typeof data.username === 'string' ? data.username.trim().toLowerCase().slice(0, 40) : '');
  if (purpose === 'register' || purpose === 'bootstrap') {
    fields(data, ['username', 'displayName', 'email', 'consentAccount', 'consentVersion', ...(purpose === 'bootstrap' ? ['bootstrapKey'] : [])]);
    payload = registration(data); id = crypto.randomUUID();
    if (purpose === 'bootstrap') {
      const supplied = typeof data.bootstrapKey === 'string' ? data.bootstrapKey : '';
      if (!equal(await keyed(env, 'bootstrap-check', supplied), await keyed(env, 'bootstrap-check', requireSecret(env)))) fail(403, 'setup_key_invalid', 'The private setup key was not accepted.');
      if (await db.prepare('SELECT id FROM member_auth_bootstrap WHERE id=1').first()) fail(409, 'setup_closed', 'The initial webmaster has already been established.');
    }
    if (await db.prepare('SELECT id FROM member_accounts WHERE username=?').bind(payload.username).first()) fail(409, 'username_unavailable', 'Choose another username or sign in to the existing account.');
  } else if (purpose === 'activate' || purpose === 'recover') {
    fields(data, purpose === 'activate' ? ['token', 'consentAccount', 'consentVersion'] : ['token', 'username', 'recoveryCode']);
    if (purpose === 'activate' && (data.consentAccount !== true || data.consentVersion !== CONSENT_VERSION)) fail(400, 'account_consent_required', 'Read and accept the account privacy information before continuing.');
    if (typeof data.token === 'string' && TOKEN.test(data.token)) {
      if (data.username !== undefined || data.recoveryCode !== undefined) fail(400, 'invalid_fields', 'Use one recovery method at a time.');
      const link = await db.prepare('SELECT * FROM member_auth_links WHERE token_hash=? AND purpose=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?')
        .bind(await keyed(env, 'account-link', data.token), purpose === 'activate' ? 'activation' : 'recovery', now).first();
      if (!link) fail(401, 'link_invalid', 'This private link has expired or has already been used.');
      account = await getAccount(db, link.account_id); payload.linkId = link.id;
    } else if (purpose === 'recover' && data.token === undefined && typeof data.recoveryCode === 'string') {
      const name = username(data.username);
      const code = data.recoveryCode.replace(/[\s-]/g, '').toUpperCase();
      account = await db.prepare('SELECT * FROM member_accounts WHERE username=?').bind(name).first();
      if (!account || !/^RSC[A-F0-9]{40}$/.test(code)) fail(401, 'recovery_invalid', 'The username and recovery code were not accepted.');
      const saved = await db.prepare('SELECT id FROM member_recovery_codes WHERE account_id=? AND code_hash=? AND used_at IS NULL AND revoked_at IS NULL')
        .bind(account.id, await keyed(env, 'recovery-code', account.id + '/' + code)).first();
      if (!saved) fail(401, 'recovery_invalid', 'The username and recovery code were not accepted.');
      payload.codeId = saved.id;
    } else fail(401, 'link_invalid', 'Use a valid private link or recovery code.');
    if (account.status !== (purpose === 'activate' ? 'invited' : 'active')) fail(401, 'account_unavailable', 'This account cannot use this link or recovery code.');
    id = account.id; payload.accountVersion = account.version; payload.authVersion = account.auth_version;
    if (purpose === 'activate') payload.consentVersion = CONSENT_VERSION;
  } else if (purpose === 'passkeys' || purpose === 'recovery-codes') {
    fields(data, purpose === 'passkeys' ? ['name'] : []);
    requireNative(identity, now, purpose === 'passkeys');
    account = await getAccount(db, identity.accountId); id = account.id;
    if (purpose === 'passkeys' && (await db.prepare('SELECT COUNT(*) AS total FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL').bind(id).first()).total >= MAX_PASSKEYS) {
      fail(409, 'passkey_limit', 'This account already has 20 passkeys. Remove an unused passkey before adding another.');
    }
    payload = { accountVersion: account.version, authVersion: account.auth_version, sessionHash: identity.sessionHash };
    if (purpose === 'passkeys') payload.name = text(data.name ?? 'Passkey', 'a passkey name', 1, 80);
  } else {
    fields(data, ['username']);
    if (data.username !== undefined && data.username !== '') payload.username = username(data.username);
  }
  const authentication = purpose === 'login' || purpose === 'recovery-codes';
  const knownKeys = id ? rows(await db.prepare('SELECT credential_id,transports_json FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL AND rp_id=?').bind(id, loc.url.hostname).all()) : [];
  let options;
  if (authentication) {
    options = await generateAuthenticationOptions({ rpID: loc.url.hostname, userVerification: 'required', timeout: CEREMONY_SECONDS * 1000,
      ...(purpose === 'recovery-codes' ? { allowCredentials: knownKeys.map(key => ({ id: key.credential_id, transports: JSON.parse(key.transports_json) })) } : {}) });
  } else {
    options = await generateRegistrationOptions({ rpName: 'ready SET Co-op', rpID: loc.url.hostname,
      userID: encoder.encode(id), userName: account?.username ?? payload.username, userDisplayName: account?.display_name ?? payload.displayName,
      attestationType: 'none', supportedAlgorithmIDs: [-7, -257], timeout: CEREMONY_SECONDS * 1000,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: purpose === 'passkeys' ? knownKeys.map(key => ({ id: key.credential_id, transports: JSON.parse(key.transports_json) })) : [] });
  }
  const ceremonyId = crypto.randomUUID(); const binding = randomHex();
  await cleanup(db, now);
  await db.prepare('INSERT INTO member_auth_ceremonies(id,purpose,challenge,binding_hash,origin,rp_id,account_id,payload_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(ceremonyId, purpose, options.challenge, await keyed(env, 'ceremony-binding', binding), loc.url.origin, loc.url.hostname, id, JSON.stringify(payload), now, after(now, CEREMONY_SECONDS)).run();
  return json({ ceremonyId, options }, 200, { 'Set-Cookie': cookieHeader('ceremony', binding, loc.local, CEREMONY_SECONDS) });
}
async function loadCeremony(request, env, purpose, data, now, loc) {
  fields(data, ['ceremonyId', 'response']); uuid(data.ceremonyId);
  if (!object(data.response)) invalidCeremony();
  const binding = cookie(request, cookieName('ceremony', loc.local));
  if (!binding || !TOKEN.test(binding)) invalidCeremony();
  const ceremony = await env.DB.prepare('SELECT * FROM member_auth_ceremonies WHERE id=? AND purpose=? AND consumed_at IS NULL AND expires_at>? AND origin=? AND rp_id=?')
    .bind(data.ceremonyId, purpose, now, loc.url.origin, loc.url.hostname).first();
  if (!ceremony || !equal(ceremony.binding_hash, await keyed(env, 'ceremony-binding', binding))) invalidCeremony();
  return { ...ceremony, payload: JSON.parse(ceremony.payload_json) };
}
function claimCeremony(db, ceremony, now, op) {
  return db.prepare('UPDATE member_auth_ceremonies SET consumed_at=?,claim_id=? WHERE id=? AND consumed_at IS NULL AND expires_at>? RETURNING id')
    .bind(now, op, ceremony.id, now);
}
async function registrationVerified(data, ceremony) {
  try {
    const result = await verifyRegistrationResponse({ response: data.response, expectedChallenge: ceremony.challenge,
      expectedOrigin: ceremony.origin, expectedRPID: ceremony.rp_id, requireUserVerification: true, requireUserPresence: true,
      supportedAlgorithmIDs: [-7, -257] });
    if (!result.verified || !result.registrationInfo?.userVerified) invalidCeremony();
    return result.registrationInfo;
  } catch { invalidCeremony(); }
}
async function verifyRegistration(request, env, identity, purpose, data, now, loc) {
  const db = env.DB; const ceremony = await loadCeremony(request, env, purpose, data, now, loc);
  const payload = ceremony.payload; const id = ceremony.account_id;
  if (purpose === 'passkeys') {
    requireNative(identity, now, true);
    if (identity.accountId !== id || identity.sessionHash !== payload.sessionHash) invalidCeremony();
  }
  const info = await registrationVerified(data, ceremony);
  if (await db.prepare('SELECT id FROM member_passkeys WHERE credential_id=?').bind(info.credential.id).first()) fail(409, 'passkey_exists', 'That passkey is already registered. Use another passkey.');
  const op = crypto.randomUUID(); const cg = ceremonyGuard(ceremony.id, op); const ag = accountGuard(id, op);
  const statements = [claimCeremony(db, ceremony, now, op)];
  let accountIndex; const who = purpose === 'passkeys' ? actor(identity) : 'account:' + id;
  if (purpose === 'register' || purpose === 'bootstrap') {
    accountIndex = statements.length;
    statements.push(db.prepare("INSERT INTO member_accounts(id,username,display_name,email,status,webmaster,consent_account,consent_version,created_at,updated_at,created_by,last_login_at,original_payload_json,last_operation_id) SELECT ?,?,?,?,'active',?,1,?,?,?,?,?,?,? WHERE " + cg.sql +
      (purpose === 'bootstrap' ? ' AND NOT EXISTS (SELECT 1 FROM member_auth_bootstrap WHERE id=1)' : '') + ' RETURNING *')
      .bind(id, payload.username, payload.displayName, payload.email, Number(purpose === 'bootstrap'), payload.consentVersion,
        now, now, who, now, JSON.stringify(payload), op, ...cg.values));
    if (purpose === 'bootstrap') statements.push(db.prepare('INSERT INTO member_auth_bootstrap(id,account_id,claimed_at) SELECT 1,?,? WHERE ' + ag.sql).bind(id, now, ...ag.values));
  } else {
    let gate = cg;
    const recoveryState = { sql: "EXISTS (SELECT 1 FROM member_accounts WHERE id=? AND version=? AND auth_version=? AND status=?)",
      values: [id, payload.accountVersion, payload.authVersion, purpose === 'activate' ? 'invited' : 'active'] };
    if (payload.linkId) {
      statements.push(db.prepare('UPDATE member_auth_links SET redeemed_at=?,claim_id=? WHERE id=? AND account_id=? AND purpose=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND ' + cg.sql + ' AND ' + recoveryState.sql)
        .bind(now, op, payload.linkId, id, purpose === 'activate' ? 'activation' : 'recovery', now, ...cg.values, ...recoveryState.values));
      gate = { sql: 'EXISTS (SELECT 1 FROM member_auth_links WHERE id=? AND claim_id=?)', values: [payload.linkId, op] };
    } else if (payload.codeId) {
      statements.push(db.prepare('UPDATE member_recovery_codes SET used_at=?,claim_id=? WHERE id=? AND account_id=? AND used_at IS NULL AND revoked_at IS NULL AND ' + cg.sql + ' AND ' + recoveryState.sql)
        .bind(now, op, payload.codeId, id, ...cg.values, ...recoveryState.values));
      gate = { sql: 'EXISTS (SELECT 1 FROM member_recovery_codes WHERE id=? AND claim_id=?)', values: [payload.codeId, op] };
    }
    const security = purpose === 'passkeys' ? actorGuard(identity, now) : { sql: '1=1', values: [] };
    accountIndex = statements.length;
    statements.push(db.prepare("UPDATE member_accounts SET status='active',consent_account=1,consent_version=?,version=version+1,auth_version=auth_version+?,updated_at=?,last_login_at=?,last_operation_id=? WHERE id=? AND version=? AND auth_version=? AND status=? AND " + gate.sql + ' AND ' + security.sql +
      (purpose === 'passkeys' ? ' AND (SELECT COUNT(*) FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL)<' + MAX_PASSKEYS : '') + ' RETURNING *')
      .bind(purpose === 'activate' ? payload.consentVersion : (await getAccount(db, id)).consent_version, Number(purpose !== 'passkeys'), now, now, op, id, payload.accountVersion, payload.authVersion,
        purpose === 'activate' ? 'invited' : 'active', ...gate.values, ...security.values, ...(purpose === 'passkeys' ? [id] : [])));
    if (purpose === 'recover') statements.push(...revokeStatements(db, id, now, ag, { passkeys: true, sessions: true, codes: true, links: true }));
    if (purpose === 'activate') statements.push(...revokeStatements(db, id, now, ag, { links: true, sessions: true, codes: true }));
  }
  statements.push(addPasskey(db, id, info, payload.name ?? 'Passkey', ceremony.rp_id, now, op, ag));
  const codes = purpose === 'passkeys' ? [] : await recoveryCodes(env, id);
  statements.push(...codeStatements(db, id, codes, now, ag));
  const session = purpose === 'passkeys' ? null : await makeSession(db, id, now, ag);
  if (session) statements.push(session.statement);
  statements.push(audit(db, id, who, purpose === 'bootstrap' ? 'webmaster_bootstrapped' : purpose === 'passkeys' ? 'passkey_added' : 'account_' + purpose, now, {}, ag));
  const result = await db.batch(statements);
  const account = rows(result[accountIndex])[0];
  if (!rows(result[0]).length) invalidCeremony();
  if (!account) conflict();
  return json({ identity: publicAccount(account), ...(codes.length ? { recoveryCodes: codes.map(code => code.display) } : {}) }, 200,
    session ? { 'Set-Cookie': cookieHeader('session', session.token, loc.local, SESSION_SECONDS) } : {});
}
async function verifyAuthentication(request, env, identity, purpose, data, now, loc) {
  const db = env.DB; const ceremony = await loadCeremony(request, env, purpose, data, now, loc);
  if (typeof data.response.id !== 'string') invalidCeremony();
  const key = await db.prepare("SELECT p.*,a.username,a.status,a.auth_version,a.version FROM member_passkeys p JOIN member_accounts a ON a.id=p.account_id WHERE p.credential_id=? AND p.rp_id=? AND p.revoked_at IS NULL AND a.status='active'")
    .bind(data.response.id, ceremony.rp_id).first();
  if (!key || (ceremony.payload.username && key.username !== ceremony.payload.username)) invalidCeremony();
  if (purpose === 'recovery-codes') {
    requireNative(identity, now);
    if (identity.accountId !== key.account_id || ceremony.account_id !== key.account_id || identity.sessionHash !== ceremony.payload.sessionHash) invalidCeremony();
  }
  const handle = data.response.response?.userHandle;
  if (handle !== undefined && handle !== null && handle !== base64url(encoder.encode(key.account_id))) invalidCeremony();
  let info;
  try {
    const result = await verifyAuthenticationResponse({ response: data.response, expectedChallenge: ceremony.challenge,
      expectedOrigin: ceremony.origin, expectedRPID: ceremony.rp_id, requireUserVerification: true,
      credential: { id: key.credential_id, publicKey: unbase64url(key.public_key), counter: key.counter, transports: JSON.parse(key.transports_json) } });
    if (!result.verified || !result.authenticationInfo.userVerified) invalidCeremony();
    info = result.authenticationInfo;
  } catch { invalidCeremony(); }
  const op = crypto.randomUUID(); const cg = ceremonyGuard(ceremony.id, op); const ag = accountGuard(key.account_id, op);
  const security = purpose === 'recovery-codes' ? actorGuard(identity, now) : { sql: '1=1', values: [] };
  const statements = [
    claimCeremony(db, ceremony, now, op),
    db.prepare("UPDATE member_passkeys SET counter=?,last_used_at=?,backed_up=?,last_operation_id=? WHERE id=? AND counter=? AND revoked_at IS NULL AND " + cg.sql + " AND EXISTS (SELECT 1 FROM member_accounts WHERE id=? AND status='active' AND auth_version=?) AND " + security.sql + ' RETURNING id')
      .bind(info.newCounter, now, Number(info.credentialBackedUp), op, key.id, key.counter, ...cg.values, key.account_id, key.auth_version, ...security.values),
    db.prepare("UPDATE member_accounts SET last_login_at=?,updated_at=?,last_operation_id=?,version=version+?,auth_version=auth_version+? WHERE id=? AND auth_version=? AND status='active' AND EXISTS (SELECT 1 FROM member_passkeys WHERE id=? AND last_operation_id=?) RETURNING *")
      .bind(now, now, op, Number(purpose === 'recovery-codes'), Number(purpose === 'recovery-codes'), key.account_id, key.auth_version, key.id, op),
  ];
  const codes = purpose === 'recovery-codes' ? await recoveryCodes(env, key.account_id) : [];
  if (codes.length) {
    statements.push(...revokeStatements(db, key.account_id, now, ag, { codes: true, sessions: true }));
    statements.push(...codeStatements(db, key.account_id, codes, now, ag));
  }
  const session = await makeSession(db, key.account_id, now, ag); statements.push(session.statement);
  statements.push(audit(db, key.account_id, 'account:' + key.account_id, codes.length ? 'recovery_codes_replaced' : 'signed_in', now, {}, ag));
  const result = await db.batch(statements);
  if (!rows(result[0]).length || !rows(result[1]).length || !rows(result[2]).length) invalidCeremony();
  return json({ identity: publicAccount(rows(result[2])[0]), ...(codes.length ? { recoveryCodes: codes.map(code => code.display) } : {}) },
    200, { 'Set-Cookie': cookieHeader('session', session.token, loc.local, SESSION_SECONDS) });
}
function pagination(url) {
  const page = Number(url.searchParams.get('page') ?? 1); const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) fail(400, 'invalid_page', 'Choose a page and between 1 and 100 results.');
  return { page, pageSize, offset: (page - 1) * pageSize };
}
async function reserveAccount(db, identity, data, now) {
  fields(data, ['id', 'username', 'displayName', 'email']);
  const id = uuid(data.id); const values = registration(data, { consent: false }); const original = JSON.stringify(values);
  const prior = await db.prepare('SELECT * FROM member_accounts WHERE id=?').bind(id).first();
  if (prior) {
    if (prior.original_payload_json !== original) fail(409, 'id_conflict', 'This account identifier belongs to different details.');
    return json({ account: publicAccount(prior) });
  }
  const op = crypto.randomUUID(); const security = actorGuard(identity, now, true); const guard = accountGuard(id, op);
  const result = await db.batch([
    db.prepare("INSERT INTO member_accounts(id,username,display_name,email,status,created_at,updated_at,created_by,original_payload_json,last_operation_id) SELECT ?,?,?,?,'invited',?,?,?,?,? WHERE " + security.sql + ' ON CONFLICT(id) DO NOTHING RETURNING *')
      .bind(id, values.username, values.displayName, values.email, now, now, actor(identity), original, op, ...security.values),
    audit(db, id, actor(identity), 'account_invited', now, {}, guard),
  ]);
  const account = rows(result[0])[0];
  if (!account) {
    const retry = await db.prepare('SELECT * FROM member_accounts WHERE id=?').bind(id).first();
    if (retry?.original_payload_json === original) return json({ account: publicAccount(retry) });
    conflict();
  }
  return json({ account: publicAccount(account) }, 201);
}
async function manageAccount(db, env, identity, accountId, operation, data, now) {
  fields(data, operation === 'patch' ? ['expectedVersion', 'status', 'webmaster'] : ['expectedVersion']);
  const expected = version(data.expectedVersion); const account = await getAccount(db, accountId);
  if (account.version !== expected) conflict();
  const op = crypto.randomUUID(); const security = actorGuard(identity, now, true); const guard = accountGuard(accountId, op);
  let sql; let values; let token; let expiresAt; let purpose; let action;
  let revoke = {};
  if (operation === 'patch') {
    if (data.status === undefined && data.webmaster === undefined) fail(400, 'invalid_fields', 'Choose the account change to save.');
    if (data.status !== undefined && !['active', 'disabled'].includes(data.status)) fail(400, 'invalid_status', 'An account may be active or disabled.');
    if (data.webmaster !== undefined && typeof data.webmaster !== 'boolean') fail(400, 'invalid_role', 'Choose whether this account is a webmaster.');
    const status = data.status ?? account.status; const webmaster = data.webmaster === undefined ? account.webmaster : Number(data.webmaster);
    if (account.status === 'invited' && status !== 'invited') fail(400, 'activation_required', 'The invited person must activate their own account using a passkey.');
    if (webmaster && status !== 'active' && !(account.webmaster && data.webmaster === undefined)) fail(400, 'active_account_required', 'Activate the account before assigning webmaster access.');
    const removingLast = account.status === 'active' && account.webmaster === 1 && (status !== 'active' || !webmaster);
    if (removingLast && !(await db.prepare("SELECT id FROM member_accounts WHERE status='active' AND webmaster=1 AND id<>? LIMIT 1").bind(accountId).first())) fail(409, 'last_webmaster', 'Keep at least one active webmaster.');
    sql = 'UPDATE member_accounts SET status=?,webmaster=?,version=version+1,auth_version=auth_version+1,updated_at=?,last_operation_id=? WHERE id=? AND version=? AND ' + security.sql +
      (removingLast ? " AND EXISTS (SELECT 1 FROM member_accounts WHERE status='active' AND webmaster=1 AND id<>?)" : '') + ' RETURNING *';
    values = [status, webmaster, now, op, accountId, expected, ...security.values, ...(removingLast ? [accountId] : [])];
    revoke = { sessions: true, links: true }; action = 'account_permissions_changed';
  } else {
    if (operation === 'invite' && account.status !== 'invited') fail(409, 'activation_unavailable', 'Only an invited account can receive an activation link.');
    if (operation === 'recovery-link' && account.status !== 'active') fail(409, 'recovery_unavailable', 'Only an active account can receive a recovery link.');
    const authIncrement = operation === 'revoke-sessions' ? 1 : 0;
    sql = 'UPDATE member_accounts SET version=version+1,auth_version=auth_version+?,updated_at=?,last_operation_id=? WHERE id=? AND version=? AND ' + security.sql + ' RETURNING *';
    values = [authIncrement, now, op, accountId, expected, ...security.values];
    revoke = { links: operation !== 'revoke-sessions', sessions: operation === 'revoke-sessions' };
    action = { invite: 'activation_link_created', 'recovery-link': 'recovery_link_created', 'revoke-links': 'links_revoked', 'revoke-sessions': 'sessions_revoked' }[operation];
    if (operation === 'invite' || operation === 'recovery-link') {
      token = randomHex(); purpose = operation === 'invite' ? 'activation' : 'recovery';
      expiresAt = after(now, purpose === 'activation' ? 24 * 60 * 60 : 60 * 60);
    }
  }
  const statements = [db.prepare(sql).bind(...values), ...revokeStatements(db, accountId, now, guard, revoke)];
  if (token) statements.push(db.prepare('INSERT INTO member_auth_links(id,account_id,purpose,token_hash,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE ' + guard.sql)
    .bind(crypto.randomUUID(), accountId, purpose, await keyed(env, 'account-link', token), actor(identity), now, expiresAt, ...guard.values));
  statements.push(audit(db, accountId, actor(identity), action, now, operation === 'patch' ? { status: data.status ?? account.status, webmaster: data.webmaster ?? Boolean(account.webmaster) } : {}, guard));
  const result = await db.batch(statements);
  if (!rows(result[0]).length) conflict();
  return json({ account: publicAccount(rows(result[0])[0]), ...(token ? { token, purpose, expiresAt, sent: false } : { ok: true }) });
}
async function ownRevoke(db, identity, now, keyId = null) {
  const op = crypto.randomUUID(); const security = actorGuard(identity, now); const guard = accountGuard(identity.accountId, op);
  if (keyId) {
    const key = await db.prepare('SELECT id FROM member_passkeys WHERE id=? AND account_id=? AND revoked_at IS NULL').bind(keyId, identity.accountId).first();
    if (!key) fail(404, 'passkey_not_found', 'The passkey was not found.');
    const count = await db.prepare('SELECT COUNT(*) AS total FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL').bind(identity.accountId).first();
    if (count.total <= 1) fail(409, 'last_passkey', 'Add another passkey before removing this one.');
  }
  const statements = [
    db.prepare('UPDATE member_accounts SET auth_version=auth_version+1,version=version+1,updated_at=?,last_operation_id=? WHERE id=? AND ' + security.sql +
      (keyId ? ' AND (SELECT COUNT(*) FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL)>1 AND EXISTS (SELECT 1 FROM member_passkeys WHERE id=? AND account_id=? AND revoked_at IS NULL)' : '') + ' RETURNING id')
      .bind(now, op, identity.accountId, ...security.values, ...(keyId ? [identity.accountId, keyId, identity.accountId] : [])),
  ];
  if (keyId) statements.push(db.prepare('UPDATE member_passkeys SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL AND ' + guard.sql).bind(now, keyId, identity.accountId, ...guard.values));
  statements.push(...revokeStatements(db, identity.accountId, now, guard, { sessions: true }));
  statements.push(audit(db, identity.accountId, actor(identity), keyId ? 'passkey_revoked' : 'all_sessions_revoked', now, keyId ? { passkeyId: keyId } : {}, guard));
  const result = await db.batch(statements);
  if (!rows(result[0]).length) conflict();
}
export async function handleAccountRequest(request, env, { identity = null, now: providedNow, readJSON } = {}) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/webmaster/accounts')) return null;
  try {
    const now = iso(providedNow); const loc = location(request, env); const db = env.DB;
    if (!db?.prepare || !db?.batch) fail(503, 'auth_unavailable', 'Account sign-in is temporarily unavailable.');
    if (pathname === '/api/auth/session' && request.method === 'GET') {
      let setupComplete = false; let schemaReady = true;
      try { setupComplete = Boolean(await db.prepare('SELECT id FROM member_auth_bootstrap WHERE id=1').first()); }
      catch (error) { if (!missingSchema(error)) throw error; schemaReady = false; }
      const configured = Boolean(secret(env)) && schemaReady;
      return json({ authenticated: Boolean(identity), identity: publicAccount(identity), configured, authConfigured: configured,
        setupComplete, bootstrapAvailable: configured && !setupComplete, schemaReady });
    }
    requireSecret(env);
    if (!['GET', 'HEAD'].includes(request.method)) mutation(request, loc.url.origin);
    const body = () => (readJSON ? readJSON() : readBody(request));
    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      fields(await body(), []);
      if (identity?.authentication === 'passkey') {
        const security = actorGuard(identity, now);
        await db.batch([
          audit(db, identity.accountId, actor(identity), 'signed_out', now, {}, security),
          db.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(identity.sessionHash),
        ]);
      }
      return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('session', '', loc.local, 0) });
    }
    let match = /^\/api\/auth\/(register|bootstrap|activate|recover|login|passkeys|recovery-codes)\/(options|verify)$/.exec(pathname);
    if (match && request.method === 'POST') {
      const data = await body(); const purpose = match[1];
      if (match[2] === 'options') return await createOptions(request, env, identity, purpose, data, now, loc);
      await throttle(db, request, env, now, 'verify');
      return await (purpose === 'login' || purpose === 'recovery-codes' ? verifyAuthentication : verifyRegistration)(request, env, identity, purpose, data, now, loc);
    }
    if (pathname === '/api/auth/passkeys' && request.method === 'GET') {
      requireNative(identity, now);
      const result = await db.batch([
        db.prepare('SELECT id,label,created_at,last_used_at,device_type,backed_up FROM member_passkeys WHERE account_id=? AND revoked_at IS NULL ORDER BY created_at,id').bind(identity.accountId),
        db.prepare('SELECT COUNT(*) AS total FROM member_recovery_codes WHERE account_id=? AND used_at IS NULL AND revoked_at IS NULL').bind(identity.accountId),
      ]);
      return json({ passkeys: rows(result[0]).map(row => ({ id: row.id, name: row.label, createdAt: row.created_at,
        lastUsedAt: row.last_used_at, deviceType: row.device_type, backedUp: Boolean(row.backed_up) })),
      recoveryCodesRemaining: rows(result[1])[0].total });
    }
    match = /^\/api\/auth\/passkeys\/([0-9a-f-]+)$/.exec(pathname);
    if ((match && request.method === 'DELETE') || (pathname === '/api/auth/sessions/revoke' && request.method === 'POST')) {
      requireNative(identity, now, Boolean(match)); fields(await body(), []);
      await ownRevoke(db, identity, now, match ? uuid(match[1]) : null);
      return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('session', '', loc.local, 0) });
    }
    if (pathname.startsWith('/api/webmaster/accounts')) {
      requireWebmaster(identity, now, !['GET', 'HEAD'].includes(request.method));
      if (pathname === '/api/webmaster/accounts') {
        if (request.method === 'POST') return await reserveAccount(db, identity, await body(), now);
        if (request.method === 'GET') {
          const page = pagination(loc.url); const search = (loc.url.searchParams.get('search') ?? '').trim().toLowerCase();
          if (search.length > 120) fail(400, 'invalid_search', 'Use a shorter account search.');
          const where = 'instr(lower(username),?)>0 OR instr(lower(display_name),?)>0 OR instr(lower(email),?)>0';
          const result = await db.batch([
            db.prepare('SELECT * FROM member_accounts WHERE ' + where + ' ORDER BY username,id LIMIT ? OFFSET ?').bind(search, search, search, page.pageSize, page.offset),
            db.prepare('SELECT COUNT(*) AS total FROM member_accounts WHERE ' + where).bind(search, search, search),
          ]);
          return json({ accounts: rows(result[0]).map(publicAccount), total: rows(result[1])[0].total, page: page.page, pageSize: page.pageSize });
        }
      }
      match = /^\/api\/webmaster\/accounts\/([0-9a-f-]+)(?:\/(invite|recovery-link|revoke-links|revoke-sessions|history))?$/.exec(pathname);
      if (match) {
        const id = uuid(match[1]); const operation = match[2];
        if (!operation && request.method === 'PATCH') return await manageAccount(db, env, identity, id, 'patch', await body(), now);
        if (operation && operation !== 'history' && request.method === 'POST') return await manageAccount(db, env, identity, id, operation, await body(), now);
        if (operation === 'history' && request.method === 'GET') {
          await getAccount(db, id); const page = pagination(loc.url);
          const result = await db.batch([
            db.prepare('SELECT * FROM member_auth_audit WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(id, page.pageSize, page.offset),
            db.prepare('SELECT COUNT(*) AS total FROM member_auth_audit WHERE account_id=?').bind(id),
          ]);
          return json({ events: rows(result[0]).map(row => ({ id: row.id, accountId: row.account_id, actor: row.actor, action: row.action, createdAt: row.created_at, details: JSON.parse(row.details_json) })),
            total: rows(result[1])[0].total, page: page.page, pageSize: page.pageSize });
        }
      }
    }
    return json({ error: 'This account endpoint was not found.', code: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message, code: error.code }, error.status);
    if (missingSchema(error)) return json({ error: 'Account sign-in needs database migration 0005_member_accounts.sql applied to the existing database.', code: 'account_migration_required' }, 503);
    if (/UNIQUE constraint failed:\s*member_accounts\.(?:username|id)/i.test(String(error?.message ?? error))) return json({ error: 'This username or account identifier is already in use. Sign in or choose another username.', code: 'account_exists' }, 409);
    if (/UNIQUE constraint failed:\s*member_(?:auth_bootstrap|passkeys)/i.test(String(error?.message ?? error))) return json({ error: 'This account request was already completed. Start a fresh sign-in.', code: 'account_conflict' }, 409);
    throw error;
  }
}
