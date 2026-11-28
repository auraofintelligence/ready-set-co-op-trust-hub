const ROOT = '/api/learning';
const CONSENT_VERSION = 'learning-evidence-v1';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const PATHWAYS = ['employment', 'working_holiday', 'volunteering', 'training', 'employer_founding', 'employer_joining', 'grant_writing'];
const ENGLISH = ['', 'support', 'instructions', 'explain_tasks'];
const METHODS = {
  work_rights: ['vevo'],
  licence: ['issuer', 'sighted'],
  qualification: ['issuer', 'sighted'],
  english: ['practical', 'issuer', 'sighted'],
  skill: ['practical', 'issuer', 'sighted']
};
const TRANSITIONS = {
  submitted: ['verified', 'more_info', 'declined'],
  more_info: ['verified', 'declined'],
  verified: ['revoked'],
  declined: [],
  revoked: [],
  withdrawn: []
};
const PAGE_SIZE = 25;
const DEFAULT_PROFILE = { pathways: [], availableFrom: '', availableUntil: '', english: '', skills: '', licences: '' };
const brisbaneDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' });

export class LearningRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new LearningRequestError(status, code, message);
}

function conflict() {
  fail(409, 'learning_conflict', 'This record has changed. Reload the saved record and try again.');
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

function only(data, names) {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || Object.keys(data).some(name => !names.includes(name))) {
    fail(400, 'learning_fields', 'The request contains unexpected fields.');
  }
}

function text(value, max, label, { required = false } = {}) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    fail(400, 'learning_fields', `Enter ${label} in up to ${max} characters.`);
  }
  return value.trim();
}

function date(value, label) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    fail(400, 'learning_fields', `Choose a valid ${label}.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) {
    fail(400, 'learning_fields', `Choose a valid ${label}.`);
  }
  return value;
}

function version(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(400, 'learning_fields', 'The record version is missing or invalid.');
  return value;
}

function activeAccount(identity) {
  if (!UUID.test(identity?.accountId ?? '') || identity.status !== 'active') {
    fail(401, 'account_required', 'Sign in to your ReadySETCO account.');
  }
  return identity.accountId;
}

function reviewerAccount(identity) {
  const id = activeAccount(identity);
  if (!identity.webmaster) fail(403, 'webmaster_required', 'The evidence review desk is restricted to the ReadySETCO Webmaster.');
  return id;
}

function readPage(url) {
  const raw = url.searchParams.get('page') ?? '1';
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < 1) fail(400, 'learning_fields', 'Choose a valid page.');
  return Number(raw);
}

function profileFrom(row) {
  return row ? { ...JSON.parse(row.preferences_json), version: row.version, updatedAt: row.updated_at }
    : { ...DEFAULT_PROFILE, version: 0, updatedAt: null };
}

async function saveProfile(db, accountId, data, now) {
  only(data, [...Object.keys(DEFAULT_PROFILE), 'expectedVersion']);
  const expected = version(data.expectedVersion, 0);
  if (!Array.isArray(data.pathways) || data.pathways.length > PATHWAYS.length || data.pathways.some(item => !PATHWAYS.includes(item))) {
    fail(400, 'learning_fields', 'Choose your participation interests from the list.');
  }
  if (!ENGLISH.includes(data.english)) fail(400, 'learning_fields', 'Choose the workplace English option that fits you.');
  const availableFrom = date(data.availableFrom, 'availability start date');
  const availableUntil = date(data.availableUntil, 'availability end date');
  if (availableFrom && availableUntil && availableFrom > availableUntil) fail(400, 'learning_fields', 'The end date must follow the start date.');
  const preferences = {
    pathways: PATHWAYS.filter(item => data.pathways.includes(item)),
    availableFrom, availableUntil, english: data.english,
    skills: text(data.skills, 800, 'your skills'), licences: text(data.licences, 400, 'your licence types')
  };
  const saved = expected === 0
    ? await db.prepare(`INSERT INTO learning_profiles (account_id,preferences_json,version,updated_at)
        SELECT id,?,1,? FROM member_accounts WHERE id=? AND status='active'
        ON CONFLICT (account_id) DO NOTHING RETURNING *`).bind(JSON.stringify(preferences), now, accountId).first()
    : await db.prepare(`UPDATE learning_profiles SET preferences_json=?,version=version+1,updated_at=?
        WHERE account_id=? AND version=? AND EXISTS (
          SELECT 1 FROM member_accounts WHERE id=learning_profiles.account_id AND status='active'
        ) RETURNING *`).bind(JSON.stringify(preferences), now, accountId, expected).first();
  if (!saved) conflict();
  return json({ profile: profileFrom(saved) });
}

const EVIDENCE_FIELDS = `e.*,
  (SELECT h.note FROM learning_evidence_history h WHERE h.id=e.write_id) AS review_note,
  (SELECT a.display_name FROM member_accounts a WHERE a.id=e.reviewed_by) AS reviewer_name`;

function evidenceFrom(row, now) {
  const status = row.status === 'verified' && row.expires_on && row.expires_on < brisbaneDate.format(new Date(now))
    ? 'expired' : row.status;
  return {
    id: row.id, category: row.category, label: row.label, issuer: row.issuer, status, recordedStatus: row.status,
    method: row.method, expiresOn: row.expires_on, reviewedBy: row.reviewer_name ?? null, reviewedAt: row.reviewed_at,
    note: row.review_note ?? '', version: row.version, submittedAt: row.created_at, updatedAt: row.updated_at
  };
}

async function evidenceRecord(db, id) {
  return db.prepare(`SELECT ${EVIDENCE_FIELDS} FROM learning_evidence e WHERE e.id=?`).bind(id).first();
}

function historyWrite(db, id, changeId, actorId, note, now) {
  return db.prepare(`INSERT INTO learning_evidence_history (id,evidence_id,actor_id,status,method,expires_on,note,recorded_at)
    SELECT ?,id,?,status,method,expires_on,?,? FROM learning_evidence WHERE id=? AND write_id=?`)
    .bind(changeId, actorId, note, now, id, changeId);
}

async function submitEvidence(db, accountId, data, now) {
  only(data, ['id', 'category', 'label', 'issuer', 'consent']);
  if (typeof data.id !== 'string' || !UUID.test(data.id) || typeof data.category !== 'string' || !Object.hasOwn(METHODS, data.category)) {
    fail(400, 'learning_fields', 'Choose a valid evidence category.');
  }
  if (data.consent !== true) fail(400, 'learning_consent', 'Agree to a private evidence review before submitting.');
  const label = text(data.label, 120, 'the evidence title', { required: true });
  const issuer = text(data.issuer, 120, 'the issuing organisation');
  const changeId = crypto.randomUUID();
  const [result] = await db.batch([
    db.prepare(`INSERT INTO learning_evidence (id,account_id,category,label,issuer,consent_version,status,version,created_at,updated_at,write_id)
      SELECT ?,id,?,?,?,?,'submitted',1,?,?,? FROM member_accounts WHERE id=? AND status='active'
      ON CONFLICT (id) DO NOTHING RETURNING id`)
      .bind(data.id, data.category, label, issuer, CONSENT_VERSION, now, now, changeId, accountId),
    historyWrite(db, data.id, changeId, accountId, '', now)
  ]);
  const row = await evidenceRecord(db, data.id);
  if (!row || row.account_id !== accountId || row.category !== data.category || row.label !== label || row.issuer !== issuer) conflict();
  return json({ evidence: evidenceFrom(row, now) }, result.results.length ? 201 : 200);
}

async function changeEvidence(db, actorId, id, data, now, reviewer) {
  const row = await evidenceRecord(db, id);
  if (!row || (!reviewer && row.account_id !== actorId)) fail(404, 'evidence_not_found', 'This evidence record is unavailable.');
  if (reviewer && row.account_id === actorId) fail(403, 'self_review', 'An evidence reviewer needs a different person to check their record.');
  only(data, reviewer ? ['expectedVersion', 'status', 'method', 'expiresOn', 'note'] : ['expectedVersion', 'action']);
  const expected = version(data.expectedVersion);
  if (row.version !== expected) conflict();
  if (!reviewer && !['withdraw', 'resubmit'].includes(data.action)) fail(400, 'learning_fields', 'Choose an evidence action.');
  const status = reviewer ? data.status : data.action === 'resubmit' ? 'submitted' : 'withdrawn';
  const valid = reviewer ? TRANSITIONS[row.status].includes(status)
    : status === 'submitted' ? row.status === 'more_info' : !['withdrawn', 'revoked'].includes(row.status);
  if (!valid) fail(409, 'evidence_status', 'This decision is unavailable for the current review status.');
  const note = reviewer ? text(data.note, 320, 'a short decision note', { required: status !== 'verified' }) : '';
  let method = row.method;
  let expiresOn = row.expires_on;
  if (status === 'verified') {
    method = data.method;
    if (!METHODS[row.category].includes(method)) fail(400, 'verification_method', 'Choose a permitted method for this evidence.');
    expiresOn = date(data.expiresOn, 'expiry date') || null;
    if (row.category === 'work_rights' && !expiresOn) fail(400, 'verification_expiry', 'Enter the working holiday visa expiry shown in VEVO.');
    if (expiresOn && expiresOn < brisbaneDate.format(new Date(now))) fail(400, 'verification_expiry', 'A current verification needs an expiry date that has not passed.');
  }
  const changeId = crypto.randomUUID();
  const [result] = await db.batch([
    db.prepare(`UPDATE learning_evidence SET status=?,method=?,expires_on=?,reviewed_by=?,reviewed_at=?,
      version=version+1,updated_at=?,write_id=? WHERE id=? AND version=?
      AND EXISTS (SELECT 1 FROM member_accounts WHERE id=? AND status='active' AND (?=0 OR webmaster=1)) RETURNING id`)
      .bind(status, method, expiresOn, reviewer ? actorId : row.reviewed_by, reviewer ? now : row.reviewed_at, now, changeId, id, expected, actorId, Number(reviewer)),
    historyWrite(db, id, changeId, actorId, note, now)
  ]);
  if (!result.results.length) conflict();
  return json({ evidence: evidenceFrom(await evidenceRecord(db, id), now) });
}

async function listEvidence(db, accountId, now, page, reviewer = false) {
  const filter = reviewer ? "e.account_id<>? AND a.status='active' AND e.status IN ('submitted','more_info','verified')" : 'e.account_id=?';
  const result = await db.prepare(`SELECT ${EVIDENCE_FIELDS},a.display_name AS applicant_name
    FROM learning_evidence e JOIN member_accounts a ON a.id=e.account_id WHERE ${filter}
    ORDER BY e.updated_at DESC,e.id LIMIT ? OFFSET ?`).bind(accountId, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all();
  const items = result.results.slice(0, PAGE_SIZE).map(row => ({
    ...evidenceFrom(row, now), ...(reviewer ? { applicant: row.applicant_name } : {})
  }));
  return { evidence: items, page, more: result.results.length > PAGE_SIZE };
}

async function completions(db, accountId, page = 1, size = PAGE_SIZE) {
  const result = await db.prepare(`SELECT v.title,c.provider_name AS provider,lc.course_id AS courseId,
    lc.revision,lc.completed_at AS completedAt FROM learning_completions lc
    JOIN learning_course_versions v ON v.course_id=lc.course_id AND v.revision=lc.revision
    JOIN learning_courses c ON c.id=lc.course_id
    WHERE lc.account_id=? ORDER BY lc.completed_at DESC,lc.course_id,lc.revision LIMIT ? OFFSET ?`)
    .bind(accountId, size + 1, (page - 1) * size).all();
  return { completions: result.results.slice(0, size), page, more: result.results.length > size };
}

export async function exportLearning(db, accountId, now) {
  const [profile, records, courseHistory, history] = await Promise.all([
    db.prepare('SELECT * FROM learning_profiles WHERE account_id=?').bind(accountId).first(),
    db.prepare(`SELECT ${EVIDENCE_FIELDS} FROM learning_evidence e WHERE e.account_id=?
      ORDER BY e.created_at,e.id LIMIT 1001`).bind(accountId).all(),
    completions(db, accountId, 1, 1000),
    db.prepare(`SELECT h.evidence_id AS evidenceId,h.status,h.method,h.expires_on AS expiresOn,h.note,h.recorded_at AS recordedAt
      FROM learning_evidence_history h JOIN learning_evidence e ON e.id=h.evidence_id WHERE e.account_id=?
      ORDER BY h.recorded_at,h.id LIMIT 2001`).bind(accountId).all()
  ]);
  if (courseHistory.more || records.results.length > 1000 || history.results.length > 2000) {
    fail(413, 'export_too_large', 'Contact the site organiser for a complete copy of your learning records.');
  }
  return {
    profile: profileFrom(profile),
    evidence: records.results.map(row => ({ ...evidenceFrom(row, now), reviewConsentVersion: row.consent_version })),
    completions: courseHistory.completions,
    history: history.results
  };
}

async function drafts(db) {
  const [categories, examples] = await db.batch([
    db.prepare('SELECT id,name FROM learning_categories ORDER BY position'),
    db.prepare(`SELECT c.id,c.provider_name AS provider,c.category_id AS category,v.revision,v.title,v.description,v.lessons_json
      FROM learning_courses c JOIN learning_course_versions v ON v.course_id=c.id WHERE v.state='draft' ORDER BY c.id,v.revision`)
  ]);
  return {
    categories: categories.results,
    drafts: examples.results.map(({ lessons_json, ...course }) => ({ ...course, lessons: JSON.parse(lessons_json) }))
  };
}

export async function handleLearningRequest(request, db, { identity, now, readJSON }) {
  const url = new URL(request.url);
  const accountId = activeAccount(identity);
  const path = url.pathname.slice(ROOT.length);
  const method = request.method;

  if (path === '/profile' && method === 'GET') {
    const row = await db.prepare('SELECT * FROM learning_profiles WHERE account_id=?').bind(accountId).first();
    return json({ profile: profileFrom(row) });
  }
  if (path === '/profile' && method === 'PATCH') return saveProfile(db, accountId, await readJSON(), now);
  if (path === '/completions' && method === 'GET') return json(await completions(db, accountId, readPage(url)));
  if (path === '/evidence' && method === 'GET') return json(await listEvidence(db, accountId, now, readPage(url)));
  if (path === '/evidence' && method === 'POST') return submitEvidence(db, accountId, await readJSON(), now);
  if (path === '/reviews' && method === 'GET') {
    return json(await listEvidence(db, reviewerAccount(identity), now, readPage(url), true));
  }
  if (path === '/drafts' && method === 'GET') {
    reviewerAccount(identity);
    return json(await drafts(db));
  }
  const record = /^\/(evidence|reviews)\/([0-9a-f-]+)$/.exec(path);
  if (record && UUID.test(record[2]) && method === 'PATCH') {
    const reviewer = record[1] === 'reviews';
    const actor = reviewer ? reviewerAccount(identity) : accountId;
    return changeEvidence(db, actor, record[2], await readJSON(), now, reviewer);
  }
  fail(404, 'learning_not_found', 'This learning action is unavailable.');
}
