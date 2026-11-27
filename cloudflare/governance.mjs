const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JURISDICTIONS = ['QLD', 'NSW', 'VIC', 'TAS', 'SA', 'WA', 'ACT', 'NT', 'other'];
const TYPES = ['undecided', 'distributing', 'non-distributing-shares', 'non-distributing-no-shares'];
const STAGES = ['exploring', 'drafting', 'regulator-review', 'formation-meeting', 'registration-pending', 'registered', 'operating'];
const STATUSES = ['draft', 'in-review', 'approved', 'completed', 'archived'];
const WORKSPACE_FIELDS = ['name', 'locality', 'jurisdiction', 'cooperativeType', 'purpose', 'stage', 'registrationRef', 'registrationDate'];
const RECORD_FIELDS = ['title', 'status', 'owner', 'dueDate', 'sourceRef', 'evidenceRef', 'body', 'details'];
const enumOf = (...values) => ({ values });
const DETAILS = {
  task: { milestone: 600, dependency: 600, completionCriteria: 1500 },
  rule: { section: 600, proposedText: 3000, rationale: 1000, modelRuleReference: 600 },
  meeting: { meetingType: enumOf('formation', 'board', 'general', 'agm', 'other'), scheduledDate: 'date', noticeDate: 'date', location: 600, chair: 600, minuteTaker: 600, agenda: 2000, attendanceCount: 'integer', quorumRequirement: 600, quorumConfirmed: 'boolean', minutesRef: 600 },
  decision: { resolutionType: enumOf('ordinary', 'special', 'board', 'formation-rules', 'other'), meetingRef: 600, motion: 2000, eligibleVotes: 'integer', votesFor: 'integer', votesAgainst: 'integer', abstentions: 'integer', outcome: enumOf('proposed', 'carried', 'not-carried', 'deferred', 'withdrawn'), decisionDate: 'date', thresholdBasis: 600, conflicts: 1000 },
  membership: { memberRef: 600, memberName: 600, memberType: enumOf('individual', 'body-corporate'), applicationDate: 'date', admissionDate: 'date', participationReviewDate: 'date', activeMembershipBasis: 1000, membershipStage: enumOf('prospective', 'applicant', 'admitted', 'resigned', 'cancelled'), decisionRef: 600, consentRef: 600 },
  role: { roleName: 600, holderName: 600, appointmentDate: 'date', termEnd: 'date', appointmentRef: 600, delegation: 1500, conflicts: 1000 },
  finance: { category: enumOf('budget', 'shares', 'fees', 'reserves', 'reporting', 'other'), amountCents: 'money', currency: enumOf('AUD'), period: 600, basis: 1000, restrictions: 1000, approvalRef: 600 },
  handover: { fromEntity: 600, toEntity: 600, scope: 1500, effectiveDate: 'date', consentRef: 600, acceptanceRef: 600, liabilities: 1000, recordsPlan: 1000 },
  policy: { topic: 600, versionLabel: 600, reviewDate: 'date', approvalRef: 600, scope: 1500 },
  asset: { assetRef: 600, legalOwner: 600, custodian: 600, location: 600, servicePlan: 1500, renewalDate: 'date', licenceRef: 600 },
  risk: { likelihood: enumOf('low', 'medium', 'high'), impact: enumOf('low', 'medium', 'high'), mitigation: 2000, reviewDate: 'date', trigger: 600, escalationTo: 600 },
};
const KINDS = Object.keys(DETAILS);
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rows = result => result?.results ?? [];
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

class GovernanceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function fail(status, code, message) { throw new GovernanceError(status, code, message); }
function only(data, fields) {
  if (!object(data) || Object.keys(data).some(key => !fields.includes(key))) fail(400, 'invalid_fields', 'The record includes unsupported fields.');
}
function text(data, key, max, required = false) {
  const value = data[key] === undefined ? '' : data[key];
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(400, 'invalid_fields', `Check ${key}.`);
  const clean = value.trim();
  if (required && !clean) fail(400, 'invalid_fields', `Enter ${key}.`);
  return clean;
}
function choice(data, key, choices, fallback) {
  const value = data[key] === undefined ? fallback : data[key];
  if (!choices.includes(value)) fail(400, 'invalid_fields', `Choose a supported ${key}.`);
  return value;
}
function date(data, key) {
  const value = text(data, key, 10);
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) fail(400, 'invalid_fields', `Check ${key}; use a real date in YYYY-MM-DD format.`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_reference', 'Check the record reference.');
  return value.toLowerCase();
}
function expectedVersion(data) {
  if (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1) fail(400, 'version_required', 'Refresh this record before saving changes.');
  return data.expectedVersion;
}
function detailsFor(kind, source = {}) {
  const schema = DETAILS[kind];
  only(source, Object.keys(schema));
  const output = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (source[key] === undefined || source[key] === '') continue;
    if (rule === 'date') output[key] = date(source, key);
    else if (rule === 'integer' || rule === 'money') {
      const value = source[key];
      if (!Number.isSafeInteger(value) || value < 0 || value > (rule === 'money' ? 1000000000000 : 1000000000)) fail(400, 'invalid_fields', `Check ${key}; use a non-negative whole number.`);
      output[key] = value;
    } else if (rule === 'boolean') {
      if (typeof source[key] !== 'boolean') fail(400, 'invalid_fields', `Check ${key}.`);
      output[key] = source[key];
    } else if (typeof rule === 'number') output[key] = text(source, key, rule);
    else output[key] = choice(source, key, rule.values);
  }
  if (kind === 'decision' && output.eligibleVotes !== undefined && ['votesFor', 'votesAgainst', 'abstentions'].reduce((sum, key) => sum + (output[key] ?? 0), 0) > output.eligibleVotes) fail(400, 'invalid_vote_counts', 'Recorded votes and abstentions exceed the stated eligible votes.');
  return output;
}
function workspaceData(data, create = false) {
  only(data, create ? ['id', 'name', 'locality', 'jurisdiction', 'cooperativeType', 'purpose'] : [...WORKSPACE_FIELDS, 'expectedVersion']);
  const result = {
    name: text(data, 'name', 160, true), locality: text(data, 'locality', 160, true),
    jurisdiction: choice(data, 'jurisdiction', JURISDICTIONS, 'QLD'),
    cooperativeType: choice(data, 'cooperativeType', TYPES, 'undecided'),
    purpose: text(data, 'purpose', 2000), stage: create ? 'exploring' : choice(data, 'stage', STAGES),
    registrationRef: create ? '' : text(data, 'registrationRef', 600), registrationDate: create ? '' : date(data, 'registrationDate'),
  };
  if (['registered', 'operating'].includes(result.stage) && (!result.registrationRef || !result.registrationDate)) fail(400, 'registration_evidence_required', 'Record the registration evidence and registration date before selecting this stage.');
  return result;
}
function recordData(data, kind, workspace, create = false) {
  only(data, create ? ['id', 'kind', ...RECORD_FIELDS] : [...RECORD_FIELDS, 'expectedVersion']);
  if (!KINDS.includes(kind)) fail(400, 'invalid_kind', 'Choose a supported record type.');
  const result = { title: text(data, 'title', 180, true), status: choice(data, 'status', STATUSES, 'draft'), owner: text(data, 'owner', 160), dueDate: date(data, 'dueDate'), sourceRef: text(data, 'sourceRef', 600), evidenceRef: text(data, 'evidenceRef', 600), body: text(data, 'body', 4000), details: detailsFor(kind, data.details) };
  const approved = ['approved', 'completed'].includes(result.status);
  if (approved && !result.evidenceRef) fail(400, 'evidence_required', 'Record the decision or completion evidence before selecting this status.');
  if (kind === 'decision' && result.details.outcome === 'carried' && (!result.evidenceRef || !result.details.decisionDate || !result.details.meetingRef)) fail(400, 'decision_evidence_required', 'A carried resolution needs its decision date, meeting or ballot reference and evidence reference.');
  if (kind === 'membership' && result.details.membershipStage === 'admitted' && (!['registered', 'operating'].includes(workspace.stage) || !result.details.admissionDate || !result.details.decisionRef || !result.evidenceRef)) fail(400, 'admission_evidence_required', 'An admitted membership record needs registered cooperative details, an admission date and its decision evidence.');
  if (kind === 'handover' && approved && ['fromEntity', 'toEntity', 'effectiveDate', 'consentRef', 'acceptanceRef'].some(key => !result.details[key])) fail(400, 'handover_evidence_required', 'Record both legal parties, the effective date, consent and acceptance references for the handover.');
  if (encoder.encode(JSON.stringify(result)).byteLength > 10 * 1024) fail(413, 'record_too_large', 'Keep each record under 10 KB; use references to longer documents.');
  return result;
}
function workspaceFromRow(row) {
  if (!row) return null;
  return { id: row.id, ...JSON.parse(row.data_json), jurisdictionReview: row.jurisdiction === 'QLD' ? 'qld-guide-available' : 'local-review-required', version: row.version, createdAt: row.created_at, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
function recordFromRow(row) {
  if (!row) return null;
  return { id: row.id, workspaceId: row.workspace_id, kind: row.kind, ...JSON.parse(row.data_json), version: row.version, createdAt: row.created_at, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
function revisionFromRow(row) {
  return { id: row.id, workspaceId: row.workspace_id, ...(row.record_id ? { recordId: row.record_id } : {}), version: row.version, actor: row.actor, createdAt: row.created_at, snapshot: JSON.parse(row.snapshot_json) };
}
function pagination(url, allowed = []) {
  for (const key of url.searchParams.keys()) if (!['page', 'pageSize', ...allowed].includes(key)) fail(400, 'invalid_query', 'Check the list filters.');
  const integer = (key, fallback, max) => {
    const value = url.searchParams.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > max) fail(400, 'invalid_query', `Check ${key}.`);
    return Number(value);
  };
  return { page: integer('page', 1, 1000000), pageSize: integer('pageSize', 100, 100) };
}
function noQuery(url) { if (url.search) fail(400, 'invalid_query', 'This action does not accept list filters.'); }
function accountPermission(actor,workspaceId=null,workspaceColumn=false) {
  if(!actor.startsWith('account:'))return {sql:'1',values:[]};
  const assignment=workspaceId===null?'':` OR EXISTS(SELECT 1 FROM member_site_roles r JOIN member_sites s ON s.id=r.site_id WHERE r.account_id=a.id AND r.role='committee' AND s.governance_workspace_id=${workspaceColumn?'governance_workspaces.id':'?'})`;
  return {sql:`EXISTS(SELECT 1 FROM member_accounts a WHERE a.id=? AND a.status='active' AND (a.webmaster=1${assignment}))`,values:[actor.slice(8),...(workspaceId!==null&&!workspaceColumn?[workspaceId]:[])]};
}
async function getWorkspace(db, workspaceId,actor) {
  const access=accountPermission(actor,workspaceId);
  const row = await db.prepare(`SELECT * FROM governance_workspaces WHERE id = ? AND ${access.sql}`).bind(workspaceId,...access.values).first();
  if (!row) fail(404, 'workspace_not_found', 'The formation workspace was not found.');
  return row;
}
async function getRecord(db, workspaceId, recordId) {
  const row = await db.prepare('SELECT * FROM governance_records WHERE workspace_id = ? AND id = ?').bind(workspaceId, recordId).first();
  if (!row) fail(404, 'record_not_found', 'The record was not found in this workspace.');
  return row;
}
async function createWorkspace(db, source, actor, now) {
  const workspaceId = id(source.id), data = workspaceData(source, true), payload = JSON.stringify(data), operation = crypto.randomUUID();
  const snapshot = { id: workspaceId, ...data, jurisdictionReview: data.jurisdiction === 'QLD' ? 'qld-guide-available' : 'local-review-required', version: 1, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
  const access=accountPermission(actor);
  const result = await db.batch([
    db.prepare(`INSERT INTO governance_workspaces (id, name, jurisdiction, stage, data_json, original_payload_json, version, created_at, created_by, updated_at, updated_by, last_operation_id)
      SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ? WHERE ${access.sql} ON CONFLICT(id) DO NOTHING`).bind(workspaceId, data.name, data.jurisdiction, data.stage, payload, payload, now, actor, now, actor, operation,...access.values),
    db.prepare(`INSERT INTO governance_workspace_revisions (id, workspace_id, version, actor, created_at, snapshot_json)
      SELECT ?, id, version, ?, ?, ? FROM governance_workspaces WHERE id = ? AND last_operation_id = ?`).bind(operation, actor, now, JSON.stringify(snapshot), workspaceId, operation),
    db.prepare(`SELECT * FROM governance_workspaces WHERE id = ? AND ${access.sql}`).bind(workspaceId,...access.values),
  ]);
  const row = rows(result[2])[0];
  if (!row) fail(409,'access_changed','Your access changed before this workspace could be saved. Refresh before trying again.');
  if (row.original_payload_json !== payload) fail(409, 'submission_conflict', 'This reference already belongs to a different workspace submission. Refresh before creating another.');
  return json({ workspace: workspaceFromRow(row) }, row.last_operation_id === operation ? 201 : 200);
}
async function updateWorkspace(db, previous, source, actor, now) {
  const version = expectedVersion(source), data = workspaceData(source), operation = crypto.randomUUID();
  const snapshot = { ...workspaceFromRow(previous), ...data, jurisdictionReview: data.jurisdiction === 'QLD' ? 'qld-guide-available' : 'local-review-required', version: version + 1, updatedAt: now, updatedBy: actor };
  const access=accountPermission(actor,previous.id);
  const result = await db.batch([
    db.prepare(`UPDATE governance_workspaces SET name = ?, jurisdiction = ?, stage = ?, data_json = ?, version = version + 1, updated_at = ?, updated_by = ?, last_operation_id = ? WHERE id = ? AND version = ? AND ${access.sql}`)
      .bind(data.name, data.jurisdiction, data.stage, JSON.stringify(data), now, actor, operation, previous.id, version,...access.values),
    db.prepare(`INSERT INTO governance_workspace_revisions (id, workspace_id, version, actor, created_at, snapshot_json)
      SELECT ?, id, version, ?, ?, ? FROM governance_workspaces WHERE id = ? AND last_operation_id = ?`).bind(operation, actor, now, JSON.stringify(snapshot), previous.id, operation),
    db.prepare('SELECT * FROM governance_workspaces WHERE id = ?').bind(previous.id),
  ]);
  const row = rows(result[2])[0];
  if (row.last_operation_id !== operation) fail(409, 'version_conflict', 'This workspace has changed. Refresh it before saving your changes.');
  return json({ workspace: workspaceFromRow(row) });
}
async function createRecord(db, workspace, source, actor, now) {
  const recordId = id(source.id), kind = source.kind, data = recordData(source, kind, workspace, true), payload = JSON.stringify({ kind, ...data }), operation = crypto.randomUUID();
  const snapshot = { id: recordId, workspaceId: workspace.id, kind, ...data, version: 1, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
  const access=accountPermission(actor,workspace.id);
  const result = await db.batch([
    db.prepare(`INSERT INTO governance_records (id, workspace_id, kind, title, status, data_json, original_payload_json, version, created_at, created_by, updated_at, updated_by, last_operation_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ? WHERE ${access.sql} ON CONFLICT(id) DO NOTHING`).bind(recordId, workspace.id, kind, data.title, data.status, JSON.stringify(data), payload, now, actor, now, actor, operation,...access.values),
    db.prepare(`INSERT INTO governance_record_revisions (id, workspace_id, record_id, version, actor, created_at, snapshot_json)
      SELECT ?, workspace_id, id, version, ?, ?, ? FROM governance_records WHERE workspace_id = ? AND id = ? AND last_operation_id = ?`).bind(operation, actor, now, JSON.stringify(snapshot), workspace.id, recordId, operation),
    db.prepare(`SELECT * FROM governance_records WHERE workspace_id = ? AND id = ? AND ${access.sql}`).bind(workspace.id, recordId,...access.values),
  ]);
  const row = rows(result[2])[0];
  if (!row || row.original_payload_json !== payload) fail(409, 'submission_conflict', 'This record reference has already been used. Refresh before creating another.');
  return json({ record: recordFromRow(row) }, row.last_operation_id === operation ? 201 : 200);
}
async function updateRecord(db, workspace, previous, source, actor, now) {
  const version = expectedVersion(source), data = recordData(source, previous.kind, workspace), operation = crypto.randomUUID();
  const snapshot = { ...recordFromRow(previous), ...data, version: version + 1, updatedAt: now, updatedBy: actor };
  const access=accountPermission(actor,workspace.id);
  const result = await db.batch([
    db.prepare(`UPDATE governance_records SET title = ?, status = ?, data_json = ?, version = version + 1, updated_at = ?, updated_by = ?, last_operation_id = ? WHERE workspace_id = ? AND id = ? AND version = ? AND ${access.sql}`)
      .bind(data.title, data.status, JSON.stringify(data), now, actor, operation, workspace.id, previous.id, version,...access.values),
    db.prepare(`INSERT INTO governance_record_revisions (id, workspace_id, record_id, version, actor, created_at, snapshot_json)
      SELECT ?, workspace_id, id, version, ?, ?, ? FROM governance_records WHERE workspace_id = ? AND id = ? AND last_operation_id = ?`).bind(operation, actor, now, JSON.stringify(snapshot), workspace.id, previous.id, operation),
    db.prepare('SELECT * FROM governance_records WHERE workspace_id = ? AND id = ?').bind(workspace.id, previous.id),
  ]);
  const row = rows(result[2])[0];
  if (row.last_operation_id !== operation) fail(409, 'version_conflict', 'This record has changed. Refresh it before saving your changes.');
  return json({ record: recordFromRow(row) });
}
async function exportWorkspace(db, workspaceId, now) {
  // One batch gives the export a consistent view, including every saved revision.
  // Bound returned JSON before materialising it in a Worker. Large workspaces use
  // the existing private D1/SQLite backup process, never a silently partial export.
  const limit = 4 * 1024 * 1024;
  const tables = ['governance_records', 'governance_workspace_revisions', 'governance_record_revisions'];
  const fields = ['data_json', 'snapshot_json', 'snapshot_json'];
  const orders = ['created_at, id', 'version', 'record_id, version'];
  const counts = [5001, 20001, 20001];
  const result = await db.batch([
    db.prepare('SELECT * FROM governance_workspaces WHERE id = ?').bind(workspaceId),
    ...tables.map((table, index) => db.prepare(`SELECT * FROM ${table} WHERE workspace_id = ? AND
      (SELECT COALESCE(SUM(length(CAST(${fields[index]} AS BLOB))), 0) FROM ${table} WHERE workspace_id = ?) <= ?
      ORDER BY ${orders[index]} LIMIT ?`).bind(workspaceId, workspaceId, limit, counts[index])),
    ...tables.map((table, index) => db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(length(CAST(${fields[index]} AS BLOB))), 0) AS bytes FROM ${table} WHERE workspace_id = ?`).bind(workspaceId)),
  ]);
  if (tables.some((table, index) => rows(result[index + 4])[0].total >= counts[index] || rows(result[index + 4])[0].bytes > limit)) fail(413, 'export_too_large', 'This workspace needs a database backup export from the site organiser to preserve its complete history.');
  return json({ schemaVersion: 1, exportedAt: now, workspace: workspaceFromRow(rows(result[0])[0]), records: rows(result[1]).map(recordFromRow), workspaceRevisions: rows(result[2]).map(revisionFromRow), recordRevisions: rows(result[3]).map(revisionFromRow) }, 200, { 'Content-Disposition': `attachment; filename="ready-setco-governance-${workspaceId}.json"` });
}

export async function handleGovernanceRequest(request, env, { actor, now, readJSON, workspaceScope=null }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/governance')) return null;
  try {
    if (!actor) fail(401, 'unauthorized', 'The formation workspace requires organiser sign-in.');
    if (!env.DB?.prepare || !env.DB?.batch) fail(503, 'service_unavailable', 'The formation workspace is temporarily unavailable.');
    const match = /^\/api\/admin\/governance\/workspaces(?:\/([^/]+))?(?:\/(records|export|history))?(?:\/([^/]+))?(?:\/(history))?$/.exec(url.pathname);
    if (!match) fail(404, 'not_found', 'The formation workspace action was not found.');
    const [, workspaceKey, resource, recordKey, history] = match;
    const db = env.DB;
    if (!workspaceKey) {
      if (resource || recordKey || history) fail(404, 'not_found', 'The formation workspace action was not found.');
      if (request.method === 'POST') { if(workspaceScope!==null)fail(403,'forbidden','Creating a cooperative workspace requires Webmaster access.');noQuery(url); return await createWorkspace(db, await readJSON(), actor, now); }
      if (request.method !== 'GET') fail(405, 'method_not_allowed', 'This action supports reading and creating workspaces.');
      const { page, pageSize } = pagination(url);
      const scopeAccess=actor.startsWith('account:')?accountPermission(actor,'id',true):{sql:workspaceScope===null?'1':"id IN (SELECT value FROM json_each(?))",values:workspaceScope===null?[]:[JSON.stringify(workspaceScope)]};
      const scopeClause=scopeAccess.sql,scopeValues=scopeAccess.values;
      const result = await db.batch([
        db.prepare(`SELECT * FROM governance_workspaces WHERE ${scopeClause} ORDER BY name, id LIMIT ? OFFSET ?`).bind(...scopeValues,pageSize, (page - 1) * pageSize),
        db.prepare(`SELECT COUNT(*) AS total FROM governance_workspaces WHERE ${scopeClause}`).bind(...scopeValues),
      ]);
      return json({ workspaces: rows(result[0]).map(workspaceFromRow), total: rows(result[1])[0].total, page, pageSize });
    }
    const workspaceId = id(workspaceKey);
    if(workspaceScope!==null&&!workspaceScope.includes(workspaceId))fail(404,'not_found','The formation workspace was not found.');
    const workspaceRow = await getWorkspace(db, workspaceId,actor), workspace = workspaceFromRow(workspaceRow);
    if (!resource) {
      noQuery(url);
      if (request.method === 'GET') return json({ workspace });
      if (request.method === 'PATCH') return await updateWorkspace(db, workspaceRow, await readJSON(), actor, now);
    } else if (resource === 'export' && !recordKey && !history) {
      noQuery(url);
      if (request.method === 'GET') return await exportWorkspace(db, workspaceId, now);
    } else if (resource === 'history' && !recordKey && !history) {
      if (request.method === 'GET') {
        const { page, pageSize } = pagination(url);
        const result = await db.batch([
          db.prepare('SELECT * FROM governance_workspace_revisions WHERE workspace_id = ? ORDER BY version DESC LIMIT ? OFFSET ?').bind(workspaceId, pageSize, (page - 1) * pageSize),
          db.prepare('SELECT COUNT(*) AS total FROM governance_workspace_revisions WHERE workspace_id = ?').bind(workspaceId),
        ]);
        return json({ revisions: rows(result[0]).map(revisionFromRow), total: rows(result[1])[0].total, page, pageSize });
      }
    } else if (resource === 'records') {
      if (!recordKey) {
        if (request.method === 'POST') { noQuery(url); return await createRecord(db, workspace, await readJSON(), actor, now); }
        if (request.method === 'GET') {
          const { page, pageSize } = pagination(url, ['kind', 'status']);
          const kind = url.searchParams.get('kind') ?? '', status = url.searchParams.get('status') ?? '';
          if (kind && !KINDS.includes(kind) || status && !STATUSES.includes(status)) fail(400, 'invalid_query', 'Choose a supported type or status filter.');
          const clause = `workspace_id = ?${kind ? ' AND kind = ?' : ''}${status ? ' AND status = ?' : ''}`;
          const values = [workspaceId, ...(kind ? [kind] : []), ...(status ? [status] : [])];
          const result = await db.batch([
            db.prepare(`SELECT * FROM governance_records WHERE ${clause} ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize),
            db.prepare(`SELECT COUNT(*) AS total FROM governance_records WHERE ${clause}`).bind(...values),
          ]);
          return json({ records: rows(result[0]).map(recordFromRow), total: rows(result[1])[0].total, page, pageSize });
        }
      } else {
        const recordId = id(recordKey), row = await getRecord(db, workspaceId, recordId);
        if (history && request.method === 'GET') {
          const { page, pageSize } = pagination(url);
          const result = await db.batch([
            db.prepare('SELECT * FROM governance_record_revisions WHERE workspace_id = ? AND record_id = ? ORDER BY version DESC LIMIT ? OFFSET ?').bind(workspaceId, recordId, pageSize, (page - 1) * pageSize),
            db.prepare('SELECT COUNT(*) AS total FROM governance_record_revisions WHERE workspace_id = ? AND record_id = ?').bind(workspaceId, recordId),
          ]);
          return json({ revisions: rows(result[0]).map(revisionFromRow), total: rows(result[1])[0].total, page, pageSize });
        }
        if (!history) {
          noQuery(url);
          if (request.method === 'GET') return json({ record: recordFromRow(row) });
          if (request.method === 'PATCH') return await updateRecord(db, workspace, row, await readJSON(), actor, now);
        }
      }
    }
    fail(405, 'method_not_allowed', 'This method is not supported for the selected workspace action.');
  } catch (error) {
    if (error instanceof GovernanceError) return json({ error: error.message, code: error.code }, error.status);
    if (/no such table:\s*(?:main\.)?governance_/i.test(String(error?.message ?? ''))) return json({ error: 'The formation workspace is waiting for its database update. Ask the site organiser to apply the governance migration.', code: 'governance_setup_required' }, 503);
    throw error;
  }
}
