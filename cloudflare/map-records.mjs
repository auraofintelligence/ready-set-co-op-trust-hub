export const MAP_CATEGORIES = Object.freeze(['business', 'bus_stop', 'picnic', 'seat', 'toilet', 'club', 'beach', 'water', 'other']);
export const MAP_FACILITIES = Object.freeze(['shelter', 'seating', 'picnic_table', 'bbq', 'toilet', 'drinking_water', 'shade', 'accessible_toilet', 'baby_change', 'power', 'dog_friendly']);
const CONSENT_VERSION = '2026-11-19';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REUSE_NOTICE = 'Contributed for display on the community map. Other reuse terms have not yet been selected; preserve each source and its conditions.';
const fields = new Set(['submissionId', 'placeId', 'baseVersion', 'name', 'category', 'latitude', 'longitude', 'locationDescription', 'description', 'access', 'wheelchair', 'facilities', 'stopMarking', 'sourceType', 'sourceUrl', 'observedOn', 'publicCredit', 'publicationConsent', 'consentVersion']);
class MapError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new MapError(status, code, message); };
const rows = result => result?.results ?? [];
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.has(key))) fail(400, 'invalid_fields', 'Use only the fields in the map form.');
}
function text(value, name, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'invalid_field', `Check ${name}.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(400, 'invalid_field', `Check ${name}.`);
  return value.trim();
}
function choice(value, name, allowed, fallback) {
  const actual = value === undefined ? fallback : value;
  if (!allowed.includes(actual)) fail(400, 'invalid_field', `Check ${name}.`);
  return actual;
}
function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_reference', `Check ${name}.`);
  return value.toLowerCase();
}
function positive(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'invalid_version', `Check ${name}.`);
  return value;
}
function validDate(value) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) fail(400, 'invalid_date', 'Use a real observation date in YYYY-MM-DD format.');
  return value;
}
function suggestionData(input) {
  keys(input, fields);
  const submissionId = uuid(input.submissionId, 'the submission reference');
  const placeId = input.placeId === undefined || input.placeId === null ? null : uuid(input.placeId, 'the place reference');
  const baseVersion = placeId ? positive(input.baseVersion, 'the original place version') : null;
  if (!placeId && input.baseVersion !== undefined && input.baseVersion !== null) fail(400, 'invalid_version', 'A new place does not have a previous version.');
  for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max) fail(400, 'invalid_coordinates', 'Choose a valid map position.');
  }
  const facilities = input.facilities ?? [];
  if (!Array.isArray(facilities) || facilities.length > MAP_FACILITIES.length || new Set(facilities).size !== facilities.length || facilities.some(value => !MAP_FACILITIES.includes(value))) fail(400, 'invalid_facilities', 'Choose facilities from the map form.');
  const sourceUrl = text(input.sourceUrl, 'the source link', 600);
  if (sourceUrl) {
    let url; try { url = new URL(sourceUrl); } catch { fail(400, 'invalid_source', 'Use a complete HTTP or HTTPS source link.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(400, 'invalid_source', 'Use a public HTTP or HTTPS source link without sign-in details.');
  }
  const observedOn = text(input.observedOn, 'the observation date', 10);
  if (observedOn) validDate(observedOn);
  if (input.publicationConsent !== true || input.consentVersion !== CONSENT_VERSION) fail(400, 'permission_required', 'Confirm that this information may be displayed publicly.');
  const data = {
    name: text(input.name, 'the place name', 140, true),
    category: choice(input.category, 'the place category', MAP_CATEGORIES),
    latitude: input.latitude, longitude: input.longitude,
    locationDescription: text(input.locationDescription, 'the location description', 800),
    description: text(input.description, 'the place details', 1600),
    access: choice(input.access, 'access', ['public', 'customers', 'permission', 'unknown'], 'unknown'),
    wheelchair: choice(input.wheelchair, 'step-free access', ['yes', 'no', 'unknown'], 'unknown'),
    facilities: [...facilities].sort(),
    stopMarking: choice(input.stopMarking, 'the bus stop markings', ['marked', 'unmarked', 'unknown'], 'unknown'),
    sourceType: choice(input.sourceType, 'the source type', ['firsthand', 'website', 'existing_record', 'other']),
    sourceUrl, observedOn,
    publicCredit: text(input.publicCredit, 'the optional public credit', 100),
  };
  return { submissionId, placeId, baseVersion, data, publicationConsent: true, consentVersion: CONSENT_VERSION };
}
function fromSuggestion(row) {
  if (!row) return null;
  return { id: row.id, submissionId: row.submission_id, placeId: row.place_id, baseVersion: row.base_version, data: JSON.parse(row.data_json), status: row.status, publishedPlaceId: row.published_place_id, reviewNotes: row.review_notes, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, publicationConsent: true, consentVersion: row.consent_version, initialOperatingEntityId: row.initial_operating_entity_id, currentOperatingEntityId: row.current_operating_entity_id, createdAt: row.created_at, updatedAt: row.updated_at };
}
function feature(row) {
  const data = JSON.parse(row.data_json);
  return { type: 'Feature', id: row.id, geometry: { type: 'Point', coordinates: [data.longitude, data.latitude] }, properties: { id: row.id, ...data, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, provenance: { sourceType: data.sourceType, sourceUrl: data.sourceUrl, observedOn: data.observedOn, publicCredit: data.publicCredit } } };
}
function pageOptions(url) {
  function integer(key, fallback, maximum) {
    const value = url.searchParams.get(key);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum || (key === 'limit' && Number(value) === 0)) fail(400, 'invalid_pagination', 'Check the map page size and offset.');
    return Number(value);
  }
  return { limit: integer('limit', 200, 500), offset: integer('offset', 0, 1000000) };
}
function publicFilter(url) {
  const clauses = ["status = 'published'"]; const values = [];
  const category = url.searchParams.get('category');
  if (category && category !== 'all') { choice(category, 'the category', MAP_CATEGORIES); clauses.push('category = ?'); values.push(category); }
  const search = url.searchParams.get('search') ?? url.searchParams.get('q') ?? '';
  if (search.length > 160) fail(400, 'invalid_search', 'Use a shorter map search.');
  if (search.trim()) {
    clauses.push("(instr(lower(name), lower(?)) > 0 OR instr(lower(json_extract(data_json, '$.locationDescription')), lower(?)) > 0 OR instr(lower(json_extract(data_json, '$.description')), lower(?)) > 0)");
    values.push(search.trim(), search.trim(), search.trim());
  }
  const bounds = url.searchParams.get('bbox');
  if (bounds) {
    const parts = bounds.split(','); const box = parts.map(Number);
    if (parts.length !== 4 || parts.some(value => !value.trim()) || box.some(value => !Number.isFinite(value)) || Math.abs(box[0]) > 180 || Math.abs(box[2]) > 180 || Math.abs(box[1]) > 90 || Math.abs(box[3]) > 90 || box[1] > box[3]) fail(400, 'invalid_bounds', 'Check the map bounds.');
    clauses.push('latitude >= ? AND latitude <= ?'); values.push(box[1], box[3]);
    clauses.push(box[0] <= box[2] ? 'longitude >= ? AND longitude <= ?' : '(longitude >= ? OR longitude <= ?)'); values.push(box[0], box[2]);
  }
  return { clause: clauses.join(' AND '), values };
}
function collection(list, metadata) {
  return { type: 'FeatureCollection', features: list.map(feature), metadata: { ...metadata, steward: 'Strange But True — initial operator; any cooperative handover is separately agreed.', reuseNotice: REUSE_NOTICE } };
}
async function createSuggestion(db, input, now) {
  const value = suggestionData(input); const id = crypto.randomUUID(); const audit = crypto.randomUUID();
  const payload = JSON.stringify(value); const data = JSON.stringify(value.data);
  const result = await db.batch([
    db.prepare(`INSERT INTO map_suggestions (id, submission_id, place_id, base_version, payload_json, data_json, publication_consent, consent_version, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?
      WHERE (? IS NULL OR EXISTS (SELECT 1 FROM map_places WHERE id = ? AND status = 'published' AND version = ?))
      ON CONFLICT(submission_id) DO NOTHING`).bind(id, value.submissionId, value.placeId, value.baseVersion, payload, data, CONSENT_VERSION, now, now, value.placeId, value.placeId, value.baseVersion),
    db.prepare(`INSERT INTO map_audit_events (id, suggestion_id, place_id, event_type, actor, created_at)
      SELECT ?, id, place_id, 'submitted', 'community', ? FROM map_suggestions WHERE id = ?`).bind(audit, now, id),
    db.prepare('SELECT * FROM map_suggestions WHERE submission_id = ?').bind(value.submissionId),
  ]);
  const saved = rows(result[2])[0];
  if (!saved) fail(409, 'place_changed', 'The original place is unavailable or has changed. Reload it before suggesting a correction.');
  if (saved.payload_json !== payload) fail(409, 'submission_conflict', 'This submission reference already contains different details. Start a new suggestion.');
  const duplicate = saved.id !== id;
  return json({ status: 'received', reference: saved.id, duplicate }, duplicate ? 200 : 201);
}
async function published(db, url, download) {
  const filter = publicFilter(url);
  const { limit, offset } = download ? { limit: 5000, offset: 0 } : pageOptions(url);
  const result = await db.batch([
    db.prepare(`SELECT * FROM map_places WHERE ${filter.clause} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?`).bind(...filter.values, limit, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM map_places WHERE ${filter.clause}`).bind(...filter.values),
  ]);
  const total = rows(result[1])[0]?.total ?? 0;
  if (download && total > limit) fail(413, 'export_too_large', 'This export exceeds 5,000 places. Narrow it with a category, search or map bounds.');
  const list = rows(result[0]);
  return json(collection(list, { total, limit, offset, hasMore: offset + list.length < total }), 200, { 'Content-Type': 'application/geo+json; charset=utf-8', ...(download ? { 'Content-Disposition': 'attachment; filename="ready-setco-places.geojson"' } : {}) });
}
async function queue(db, url) {
  const status = url.searchParams.get('status') || 'pending';
  choice(status, 'the review stage', ['pending', 'published', 'rejected', 'all']);
  const { limit, offset } = pageOptions(url);
  const clause = status === 'all' ? '' : ' WHERE status = ?'; const values = status === 'all' ? [] : [status];
  const result = await db.batch([
    db.prepare(`SELECT * FROM map_suggestions${clause} ORDER BY created_at, id LIMIT ? OFFSET ?`).bind(...values, limit, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM map_suggestions${clause}`).bind(...values),
  ]);
  const suggestions = rows(result[0]).map(fromSuggestion); const total = rows(result[1])[0]?.total ?? 0;
  return json({ suggestions, total, limit, offset, hasMore: offset + suggestions.length < total });
}
function reviewData(input) {
  keys(input, new Set(['decision', 'expectedUpdatedAt', 'notes']));
  const decision = choice(input.decision, 'the review decision', ['publish', 'reject']);
  const expectedUpdatedAt = text(input.expectedUpdatedAt, 'the review version', 40, true);
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) fail(400, 'invalid_version', 'Reload the suggestion before reviewing it.');
  return { decision, expectedUpdatedAt, notes: text(input.notes, 'the review notes', 2000) };
}
async function review(db, id, input, actor, now) {
  const data = reviewData(input); const operation = crypto.randomUUID(); const newPlace = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`UPDATE map_suggestions AS s SET status = ?, published_place_id = CASE WHEN ? = 'publish' THEN COALESCE(place_id, ?) ELSE NULL END,
      review_notes = ?, reviewed_by = ?, reviewed_at = ?, review_operation_id = ?,
      updated_at = CASE WHEN updated_at >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') ELSE ? END
      WHERE id = ? AND status = 'pending' AND updated_at = ? AND
      (? = 'reject' OR place_id IS NULL OR EXISTS (SELECT 1 FROM map_places p WHERE p.id = s.place_id AND p.status = 'published' AND p.version = s.base_version))`)
      .bind(data.decision === 'publish' ? 'published' : 'rejected', data.decision, newPlace, data.notes, actor, now, operation, now, now, id, data.expectedUpdatedAt, data.decision),
    db.prepare(`INSERT INTO map_places (id, name, category, latitude, longitude, data_json, version, status, current_suggestion_id, last_operation_id, created_at, updated_at)
      SELECT published_place_id, json_extract(data_json, '$.name'), json_extract(data_json, '$.category'), json_extract(data_json, '$.latitude'), json_extract(data_json, '$.longitude'), data_json, 1, 'published', id, ?, ?, ?
      FROM map_suggestions WHERE review_operation_id = ? AND status = 'published' AND place_id IS NULL`).bind(operation, now, now, operation),
    db.prepare(`UPDATE map_places SET
      name = (SELECT json_extract(data_json, '$.name') FROM map_suggestions WHERE review_operation_id = ?),
      category = (SELECT json_extract(data_json, '$.category') FROM map_suggestions WHERE review_operation_id = ?),
      latitude = (SELECT json_extract(data_json, '$.latitude') FROM map_suggestions WHERE review_operation_id = ?),
      longitude = (SELECT json_extract(data_json, '$.longitude') FROM map_suggestions WHERE review_operation_id = ?),
      data_json = (SELECT data_json FROM map_suggestions WHERE review_operation_id = ?), version = version + 1,
      current_suggestion_id = ?, last_operation_id = ?,
      updated_at = CASE WHEN updated_at >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') ELSE ? END
      WHERE id = (SELECT place_id FROM map_suggestions WHERE review_operation_id = ? AND status = 'published' AND place_id IS NOT NULL)`)
      .bind(operation, operation, operation, operation, operation, id, operation, now, now, operation),
    db.prepare(`INSERT INTO map_revisions (id, place_id, version, status, data_json, suggestion_id, actor, reason, created_at)
      SELECT ?, p.id, p.version, p.status, p.data_json, s.id, ?, ?, ? FROM map_places p
      JOIN map_suggestions s ON s.published_place_id = p.id WHERE s.review_operation_id = ? AND s.status = 'published'`).bind(crypto.randomUUID(), actor, data.notes, now, operation),
    db.prepare(`INSERT INTO map_audit_events (id, suggestion_id, place_id, event_type, actor, reason, created_at)
      SELECT ?, id, CASE WHEN status = 'published' THEN published_place_id ELSE place_id END,
      CASE WHEN status = 'published' THEN 'published' ELSE 'rejected' END, ?, ?, ? FROM map_suggestions WHERE review_operation_id = ?`)
      .bind(crypto.randomUUID(), actor, data.notes, now, operation),
    db.prepare('SELECT * FROM map_suggestions WHERE id = ?').bind(id),
    db.prepare('SELECT * FROM map_places WHERE last_operation_id = ?').bind(operation),
  ]);
  const saved = rows(result[5])[0];
  if (!saved) fail(404, 'not_found', 'This map suggestion was not found.');
  if (saved.review_operation_id !== operation) fail(409, 'review_conflict', 'This suggestion or its original place has changed. Refresh before reviewing it.');
  const place = rows(result[6])[0];
  return json({ suggestion: fromSuggestion(saved), ...(place ? { place: feature(place) } : {}) });
}
async function archive(db, id, input, actor, now) {
  keys(input, new Set(['status', 'expectedVersion', 'reason']));
  choice(input.status, 'the archive action', ['archived'], 'archived');
  const expectedVersion = positive(input.expectedVersion, 'the place version');
  const reason = text(input.reason, 'the archive reason', 2000, true); const operation = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`UPDATE map_places SET status = 'archived', version = version + 1, last_operation_id = ?,
      updated_at = CASE WHEN updated_at >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') ELSE ? END
      WHERE id = ? AND status = 'published' AND version = ?`).bind(operation, now, now, id, expectedVersion),
    db.prepare(`INSERT INTO map_revisions (id, place_id, version, status, data_json, suggestion_id, actor, reason, created_at)
      SELECT ?, id, version, status, data_json, current_suggestion_id, ?, ?, ? FROM map_places WHERE last_operation_id = ?`).bind(crypto.randomUUID(), actor, reason, now, operation),
    db.prepare(`INSERT INTO map_audit_events (id, place_id, event_type, actor, reason, created_at)
      SELECT ?, id, 'archived', ?, ?, ? FROM map_places WHERE last_operation_id = ?`).bind(crypto.randomUUID(), actor, reason, now, operation),
    db.prepare('SELECT * FROM map_places WHERE id = ?').bind(id),
  ]);
  const place = rows(result[3])[0];
  if (!place) fail(404, 'not_found', 'This map place was not found.');
  if (place.last_operation_id !== operation) fail(409, 'place_changed', 'This place has changed. Reload its latest version before archiving.');
  return json({ place: feature(place), status: 'archived' });
}
async function privateExport(db, now) {
  const result = await db.batch([
    db.prepare('SELECT * FROM map_places ORDER BY created_at, id'),
    db.prepare('SELECT * FROM map_suggestions ORDER BY created_at, id'),
    db.prepare('SELECT * FROM map_revisions ORDER BY rowid'),
    db.prepare('SELECT * FROM map_audit_events ORDER BY rowid'),
  ]);
  return json({ schemaVersion: 1, exportedAt: now, reuseNotice: REUSE_NOTICE,
    places: rows(result[0]).map(row => ({ ...feature(row), status: row.status, initialOperatingEntityId: row.initial_operating_entity_id, currentOperatingEntityId: row.current_operating_entity_id })),
    suggestions: rows(result[1]).map(fromSuggestion),
    revisions: rows(result[2]).map(row => ({ id: row.id, placeId: row.place_id, version: row.version, status: row.status, data: JSON.parse(row.data_json), suggestionId: row.suggestion_id, actor: row.actor, reason: row.reason, createdAt: row.created_at })),
    auditEvents: rows(result[3]).map(row => ({ id: row.id, suggestionId: row.suggestion_id, placeId: row.place_id, eventType: row.event_type, actor: row.actor, reason: row.reason, createdAt: row.created_at })),
  }, 200, { 'Content-Disposition': 'attachment; filename="ready-setco-private-map-register.json"' });
}

// The parent Worker supplies origin checks, rate limiting, verified identity and
// security headers. Private routes also require an actor here as defence in depth.
export async function handleMapRequest(request, env, { actor, now = new Date().toISOString(), readJSON = () => request.json() } = {}) {
  const url = new URL(request.url); const path = url.pathname;
  if (!path.startsWith('/api/map/') && !path.startsWith('/api/admin/map/')) return null;
  try {
    if (path.startsWith('/api/admin/map/') && (typeof actor !== 'string' || !actor.trim() || actor.length > 254)) fail(401, 'unauthorized', 'Private map review requires organiser sign-in.');
    if (!env.DB?.prepare || !env.DB?.batch) fail(503, 'map_unavailable', 'The map register is temporarily unavailable.');
    if (path === '/api/map/suggestions') {
      if (request.method !== 'POST') fail(405, 'method_not_allowed', 'Use the map form to submit a suggestion.');
      return await createSuggestion(env.DB, await readJSON(), now);
    }
    if (path === '/api/map/places' || path === '/api/map/export') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed', 'This map route supports reading only.');
      return await published(env.DB, url, path.endsWith('/export'));
    }
    if (path === '/api/admin/map/suggestions') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed', 'Read the map review queue here.');
      return await queue(env.DB, url);
    }
    const reviewMatch = /^\/api\/admin\/map\/suggestions\/([^/]+)\/review$/.exec(path);
    if (reviewMatch) {
      if (request.method !== 'POST') fail(405, 'method_not_allowed', 'Use POST for a map review.');
      return await review(env.DB, uuid(reviewMatch[1], 'the suggestion reference'), await readJSON(), actor, now);
    }
    const placeMatch = /^\/api\/admin\/map\/places\/([^/]+)$/.exec(path);
    if (placeMatch) {
      if (request.method !== 'PATCH') fail(405, 'method_not_allowed', 'Use PATCH for an archive decision.');
      return await archive(env.DB, uuid(placeMatch[1], 'the place reference'), await readJSON(), actor, now);
    }
    if (path === '/api/admin/map/export') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed', 'Read the private map export here.');
      return await privateExport(env.DB, now);
    }
    fail(404, 'not_found', 'This map route was not found.');
  } catch (error) {
    if (error instanceof MapError) return json({ error: error.message, code: error.code }, error.status);
    throw error;
  }
}
