import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createRepository, PARTICIPANT_STATUSES } from './repository.mjs';
import { handleMapRequest } from './map-records.mjs';
import { handleGovernanceRequest } from './governance.mjs';
import { resolveAccountSession, handleAccountRequest } from './accounts.mjs';
import { handleMemberServiceRequest, memberGovernanceScope } from './member-services.mjs';
import { handleLearningRequest, LearningRequestError } from './learning.mjs';

const BODY_LIMIT = 12 * 1024;
const CONSENT_VERSION = '2026-11-19';
const INTERESTS = new Set(['events', 'tourism', 'training', 'employment', 'working_holiday', 'grants', 'resources', 'founding', 'media', 'support', 'mapping']);
const TYPES = new Set(['business', 'community', 'resident', 'worker']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const keySets = new Map();

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const loopback = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const localDev = (url, env) => loopback(url) && env.LOCAL_DEV === 'true';

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

function secure(response, { api = false, privatePage = false, passwordCrypto = false, origin, allowLocation = false } = {}) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Permissions-Policy', `camera=(), microphone=(), geolocation=${allowLocation ? '(self)' : '()'}`);
  if (api || privatePage) {
    result.headers.set('Cache-Control', 'no-store');
    result.headers.set('Pragma', 'no-cache');
    result.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    result.headers.set('Content-Security-Policy', api ? "default-src 'none'; frame-ancestors 'none'" :
      "default-src 'self'; script-src 'self'" + (passwordCrypto ? " 'wasm-unsafe-eval'" : '') + "; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  if (origin) {
    result.headers.set('Access-Control-Allow-Origin', origin);
    result.headers.append('Vary', 'Origin');
    // Public intake intentionally has no credentialed CORS mode.
    result.headers.delete('Access-Control-Allow-Credentials');
  }
  return result;
}

function allowedPublicOrigin(request, env, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === url.origin) return origin;
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (allowed.some(value => {
    try {
      const candidate = new URL(value);
      return candidate.protocol === 'https:' && value === candidate.origin && value === origin;
    } catch { return false; }
  })) return origin;
  fail(403, 'origin_not_allowed', 'This origin is not allowed.');
}

function requireSameOrigin(request, url, { required = false } = {}) {
  const origin = request.headers.get('Origin');
  if ((required && origin !== url.origin) || (origin && origin !== url.origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    fail(403, 'origin_not_allowed', 'Use the management page on this site.');
  }
}

async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
    fail(415, 'json_required', 'Send application/json.');
  }
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > BODY_LIMIT) fail(413, 'body_too_large', 'The request is too large.');
  if (!request.body) fail(400, 'invalid_json', 'Send a JSON object.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        fail(413, 'body_too_large', 'The request is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isObject(value)) fail(400, 'invalid_json', 'Send a JSON object.');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, 'invalid_json', 'Send a valid JSON object.');
  } finally { reader.releaseLock(); }
}

function onlyFields(data, allowed) {
  if (Object.keys(data).some(key => !allowed.includes(key))) {
    fail(400, 'unknown_fields', 'The request includes unsupported fields. Do not send identity documents or tax details.');
  }
}

function textField(data, key, max, required = false) {
  if (data[key] === undefined && !required) return '';
  if (typeof data[key] !== 'string') fail(400, 'invalid_fields', `Check ${key}.`);
  const value = data[key].trim();
  if ((required && !value) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(400, 'invalid_fields', `Check ${key}.`);
  }
  return value;
}

function validateIntake(data) {
  onlyFields(data, ['submissionId', 'name', 'email', 'phone', 'organisation', 'participantType',
    'authorityConfirmed', 'interests', 'offer', 'consentContact', 'consentVersion', 'consentFutureHandover']);
  if (typeof data.submissionId !== 'string' || !UUID.test(data.submissionId)) fail(400, 'invalid_submission', 'Check the submission identifier.');
  if (!TYPES.has(data.participantType)) fail(400, 'invalid_fields', 'Choose a participant type.');
  if (data.authorityConfirmed !== undefined && typeof data.authorityConfirmed !== 'boolean') fail(400, 'invalid_fields', 'Check authority confirmation.');
  if (['business', 'community'].includes(data.participantType) && data.authorityConfirmed !== true) {
    fail(400, 'authority_required', 'Confirm that you can speak for this organisation.');
  }
  if (data.consentContact !== true || data.consentVersion !== CONSENT_VERSION) {
    fail(400, 'consent_required', 'Please review the current contact consent.');
  }
  if (data.consentFutureHandover !== undefined && typeof data.consentFutureHandover !== 'boolean') fail(400, 'invalid_fields', 'Check future handover consent.');
  if (!Array.isArray(data.interests) || !data.interests.length || data.interests.length > INTERESTS.size ||
    data.interests.some(value => !INTERESTS.has(value)) || new Set(data.interests).size !== data.interests.length) {
    fail(400, 'invalid_fields', 'Choose at least one listed interest.');
  }
  const email = textField(data, 'email', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) fail(400, 'invalid_fields', 'Check email.');
  const organisation = textField(data, 'organisation', 200, data.participantType === 'business');
  return {
    submissionId: data.submissionId.toLowerCase(),
    name: textField(data, 'name', 120, true), email,
    phone: textField(data, 'phone', 50), organisation,
    participantType: data.participantType, authorityConfirmed: data.authorityConfirmed === true,
    interests: data.interests, offer: textField(data, 'offer', 1200),
    consentVersion: CONSENT_VERSION, consentFutureHandover: data.consentFutureHandover === true,
  };
}

function validateReview(data) {
  onlyFields(data, ['status', 'notes', 'expectedUpdatedAt']);
  if (!PARTICIPANT_STATUSES.includes(data.status)) fail(400, 'invalid_status', 'Choose a supported expression-of-interest status.');
  const notes = data.notes === undefined ? undefined : textField(data, 'notes', 4000);
  const expectedUpdatedAt = data.expectedUpdatedAt;
  if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expectedUpdatedAt) ||
    !Number.isFinite(Date.parse(expectedUpdatedAt)))) fail(400, 'invalid_fields', 'Check the record timestamp.');
  return { status: data.status, notes, expectedUpdatedAt };
}

function listOptions(url) {
  const integer = (key, fallback, max) => {
    const value = url.searchParams.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > max) fail(400, 'invalid_query', `Check ${key}.`);
    return Number(value);
  };
  const status = url.searchParams.get('status') ?? '';
  const search = (url.searchParams.get('search') ?? '').trim();
  if ((status && !PARTICIPANT_STATUSES.includes(status)) || search.length > 150) fail(400, 'invalid_query', 'Check the search filters.');
  for (const key of url.searchParams.keys()) if (!['page', 'pageSize', 'status', 'search'].includes(key)) fail(400, 'invalid_query', 'Unsupported search filter.');
  return { page: integer('page', 1, 1000000), pageSize: integer('pageSize', 25, 100), status, search };
}

function accessConfig(env) {
  let issuer;
  try {
    const domain = String(env.ACCESS_TEAM_DOMAIN ?? '').trim();
    const candidate = new URL(domain.startsWith('https://') ? domain : `https://${domain}`);
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(candidate.hostname) || candidate.port ||
      candidate.username || candidate.password || candidate.search || candidate.hash || candidate.pathname !== '/') throw new Error();
    issuer = candidate.origin;
  } catch { fail(503, 'admin_unavailable', 'Private review is not configured.'); }
  const audience = String(env.ACCESS_AUD ?? '').trim();
  const emails = String(env.ADMIN_EMAILS ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!audience || !emails.length || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    fail(503, 'admin_unavailable', 'Private review is not configured.');
  }
  return { issuer, audience, emails };
}

async function constantTimeEqual(left, right) {
  const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

async function authenticate(request, env, url, keyResolver) {
  if (localDev(url, env)) {
    if (typeof env.LOCAL_ADMIN_TOKEN !== 'string' || env.LOCAL_ADMIN_TOKEN.length < 32) {
      fail(503, 'admin_unavailable', 'Local private review is not configured.');
    }
    const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? '';
    if (!token || !await constantTimeEqual(token, env.LOCAL_ADMIN_TOKEN)) fail(401, 'unauthorized', 'Private review requires sign-in.');
    return 'local_reviewer';
  }
  const config = accessConfig(env);
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion') ||
    /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1];
  if (!assertion) fail(401, 'unauthorized', 'Private review requires sign-in.');
  try {
    let keys = keyResolver;
    if (!keys) {
      if (!keySets.has(config.issuer)) keySets.set(config.issuer,
        createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 }));
      keys = keySets.get(config.issuer);
    }
    const { payload } = await jwtVerify(assertion, keys, {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'], clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' ||
      !config.emails.includes(payload.email.toLowerCase())) fail(403, 'forbidden', 'This account is not permitted to review submissions.');
    return payload.email.toLowerCase();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(401, 'unauthorized', 'Private review requires a valid sign-in.');
  }
}

async function rateLimit(request, env, url, repository, now) {
  const dev = localDev(url, env);
  const salt = typeof env.RATE_LIMIT_SALT === 'string' ? env.RATE_LIMIT_SALT : '';
  if (salt.length < 32 && !dev) fail(503, 'intake_unavailable', 'The intake service is not configured.');
  const ip = dev ? 'loopback' : request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64) fail(503, 'intake_unavailable', 'The intake service is temporarily unavailable.');
  const hour = now.slice(0, 13);
  const key = await crypto.subtle.importKey('raw', encoder.encode(salt || 'local-development-only'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${ip}|${hour}`));
  const hash = [...new Uint8Array(signature)].map(x => x.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.parse(`${hour}:00:00.000Z`) + 60 * 60 * 1000).toISOString();
  const limit = env.INTAKE_RATE_LIMIT === undefined ? 10 : Number(env.INTAKE_RATE_LIMIT);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) fail(503, 'intake_unavailable', 'The intake service is not configured.');
  const hits = await repository.consumeRateLimit(hash, now, expiresAt);
  if (!hits) throw new Error('Rate limit persistence failed');
  if (hits > limit) fail(429, 'rate_limited', 'Too many attempts. Please try again after the current hour.');
}

// Dependency injection is only available to importing test code; no environment
// value or request header can replace the production signature verifier.
export function createWorker({ keyResolver, now = () => new Date().toISOString() } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
      const privatePage = /^\/manage(?:\.html|\/.*)?$/i.test(url.pathname);
      const portalPage = /^\/portal(?:\.html|\/.*)?$/i.test(url.pathname);
      let corsOrigin;
      try {
        const publicWrite = ['/api/intake', '/api/map/suggestions'].includes(url.pathname);
        const publicMapRead = request.method === 'GET' && ['/api/map/places', '/api/map/export'].includes(url.pathname);
        if (publicWrite || publicMapRead) corsOrigin = allowedPublicOrigin(request, env, url);
        else if (api) requireSameOrigin(request, url);
        if (request.method === 'OPTIONS' && publicWrite) {
          if (!corsOrigin || request.headers.get('Access-Control-Request-Method') !== 'POST' ||
            (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(x => x !== 'content-type')) {
            fail(403, 'origin_not_allowed', 'This preflight request is not allowed.');
          }
          return secure(new Response(null, { status: 204, headers: {
            'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '600',
          } }), { api, origin: corsOrigin });
        }
        if (url.pathname === '/api/health' && request.method === 'GET') return secure(json({ status: 'ok' }), { api });
        const admin = url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/');
        // Auth and permission reads begin at the primary even when D1 read replication is enabled.
        if ((api || privatePage || portalPage) && env.DB?.withSession) env = {...env,DB:env.DB.withSession('first-primary')};
        let identity = (api || privatePage || portalPage) ? await resolveAccountSession(request,env,{now:now()}) : null;
        let actor, workspaceScope = null;
        const legacyCredential=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('Cookie')?.includes('CF_Authorization=')||(localDev(url,env)&&request.headers.get('Authorization'));
        if(!identity&&legacyCredential&&(url.pathname.startsWith('/api/webmaster/')||url.pathname.startsWith('/api/committee/')||url.pathname==='/api/auth/session')){
          const verified=await authenticate(request,env,url,keyResolver);
          identity={accountId:verified,username:verified,displayName:verified,email:verified,webmaster:true,status:'active',authentication:localDev(url,env)?'local':'access'};
        }
        if (admin || (privatePage && !localDev(url, env))) {
          if (identity) {
            workspaceScope=await memberGovernanceScope(env.DB,identity);
            const governanceRoute=url.pathname.startsWith('/api/admin/governance');
            if (!identity.webmaster && (!workspaceScope.length || (!privatePage && !governanceRoute))) fail(403,'forbidden','This account does not have access to this organiser area.');
            actor=`account:${identity.accountId}`;
          } else {
            if (privatePage && env.READY_AUTH_SECRET && !request.headers.get('Cf-Access-Jwt-Assertion') && !request.headers.get('Cookie')?.includes('CF_Authorization=')) {
              return secure(new Response(null,{status:303,headers:{Location:'/portal.html'}}),{privatePage:true});
            }
            if(admin&&env.READY_AUTH_SECRET&&!legacyCredential)fail(401,'sign_in_required','Sign in through the member portal to use the organiser workspace.');
            actor=await authenticate(request,env,url,keyResolver);
            identity={accountId:actor,username:actor,displayName:actor,email:actor,webmaster:true,status:'active',authentication:localDev(url,env)?'local':'access'};
          }
        }
        if (api) {
          if (!env.DB?.prepare || !env.DB?.batch) fail(503, 'service_unavailable', 'The service is temporarily unavailable.');
          if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/webmaster/accounts') || url.pathname.startsWith('/api/webmaster/committee-invitations')) {
            const response=await handleAccountRequest(request,env,{identity,now:now(),readJSON:()=>readJSON(request)});
            if(response)return secure(response,{api});
          }
          if (url.pathname.startsWith('/api/member/') || url.pathname.startsWith('/api/committee/') || url.pathname.startsWith('/api/webmaster/sites')) {
            const response=await handleMemberServiceRequest(request,env,{identity,now:now(),readJSON:()=>readJSON(request)});
            if(response)return secure(response,{api});
          }
          if (url.pathname.startsWith('/api/learning/')) {
            if (!['GET', 'HEAD'].includes(request.method)) requireSameOrigin(request, url, { required: true });
            const response = await handleLearningRequest(request, env.DB, { identity, now: now(), readJSON: () => readJSON(request) });
            return secure(response, { api });
          }
          const repository = createRepository(env.DB);
          if (url.pathname.startsWith('/api/admin/governance')) {
            if (!['GET', 'HEAD'].includes(request.method)) requireSameOrigin(request, url, { required: true });
            const response = await handleGovernanceRequest(request, env, { actor, workspaceScope, now: now(), readJSON: () => readJSON(request) });
            if (response) return secure(response, { api });
          }
          if (url.pathname.startsWith('/api/map/') || url.pathname.startsWith('/api/admin/map/')) {
            if (url.pathname.startsWith('/api/admin/map/') && ['POST', 'PATCH'].includes(request.method)) {
              requireSameOrigin(request, url, { required: true });
            }
            if (url.pathname === '/api/map/suggestions' && request.method === 'POST') {
              await rateLimit(request, env, url, repository, now());
            }
            const response = await handleMapRequest(request, env, { actor, now: now(), readJSON: () => readJSON(request) });
            if (response) return secure(response, { api, origin: corsOrigin });
          }
          if (url.pathname === '/api/intake' && request.method === 'POST') {
            await rateLimit(request, env, url, repository, now());
            const data = validateIntake(await readJSON(request));
            const saved = await repository.createIntake(data, now());
            if (saved.conflict) fail(409, 'submission_conflict', 'This submission was already received with different details. Contact Luke to request an update.');
            return secure(json({ reference: saved.reference, status: 'received' }, saved.created ? 201 : 200), { api, origin: corsOrigin });
          }
          if (admin && url.pathname === '/api/admin/participants' && request.method === 'GET') {
            return secure(json(await repository.listParticipants(listOptions(url))), { api });
          }
          const match = /^\/api\/admin\/participants\/([^/]+)$/.exec(url.pathname);
          if (admin && match && request.method === 'PATCH') {
            requireSameOrigin(request, url, { required: true });
            if (!UUID.test(match[1])) fail(400, 'invalid_reference', 'Check the participant reference.');
            const review = validateReview(await readJSON(request));
            const result = await repository.reviewParticipant(match[1].toLowerCase(), review, actor, now());
            if (!result.participant) fail(404, 'not_found', 'The submission was not found.');
            if (result.conflict) fail(409, 'review_conflict', 'This record has changed. Refresh before saving your review.');
            return secure(json({ participant: result.participant }), { api });
          }
          if (admin && url.pathname === '/api/admin/export' && request.method === 'GET') {
            return secure(json(await repository.exportAll(now()), 200, {
              'Content-Disposition': 'attachment; filename="ready-setco-private-export.json"',
            }), { api });
          }
          if (['/api/intake', '/api/health', '/api/admin/participants', '/api/admin/export'].includes(url.pathname) || match) {
            fail(405, 'method_not_allowed', 'This method is not supported.');
          }
          fail(404, 'not_found', 'The endpoint was not found.');
        }
        if (!env.ASSETS?.fetch) fail(503, 'service_unavailable', 'The site is temporarily unavailable.');
        const assetUrl = new URL(url);
        if (assetUrl.pathname === '/') assetUrl.pathname = '/index.html';
        if (assetUrl.pathname === '/portal') assetUrl.pathname = '/portal.html';
        if (assetUrl.pathname === '/manage') assetUrl.pathname = '/manage.html';
        const assetRequest = assetUrl.href === url.href ? request : new Request(assetUrl, request);
        return secure(await env.ASSETS.fetch(assetRequest), { privatePage:privatePage||portalPage, passwordCrypto:portalPage, allowLocation: url.pathname === '/map.html' });
      } catch (error) {
        const known = error instanceof HttpError || error instanceof LearningRequestError;
        const status = known ? error.status : 503;
        const response = json({ error: known ? error.message : 'The service is temporarily unavailable. Please try again.',
          code: known ? error.code : 'service_unavailable' }, status,
        status === 429 ? { 'Retry-After': String(Math.max(1, Math.ceil((3600000 - (Date.parse(now()) % 3600000)) / 1000))) } : {});
        // Never send exception details, database messages, submitted values or
        // request headers to the client or application logs.
        return secure(response, { api, privatePage:privatePage||portalPage, origin: corsOrigin });
      }
    },
  };
}

export default createWorker();

