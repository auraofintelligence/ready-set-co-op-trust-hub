-- Community map records use ordinary SQLite types and transactions, portable
-- between Cloudflare D1 and an organisation-controlled local server.
CREATE TABLE IF NOT EXISTS map_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('published', 'archived')),
  current_suggestion_id TEXT NOT NULL,
  initial_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  current_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  last_operation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS map_places_public_idx ON map_places(status, category, name, id);
CREATE INDEX IF NOT EXISTS map_places_coordinates_idx ON map_places(status, latitude, longitude);

CREATE TABLE IF NOT EXISTS map_suggestions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  place_id TEXT REFERENCES map_places(id),
  base_version INTEGER,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  publication_consent INTEGER NOT NULL CHECK (publication_consent = 1),
  consent_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  published_place_id TEXT,
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_operation_id TEXT,
  initial_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  current_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((place_id IS NULL AND base_version IS NULL) OR (place_id IS NOT NULL AND base_version > 0))
);
CREATE INDEX IF NOT EXISTS map_suggestions_queue_idx ON map_suggestions(status, created_at, id);
CREATE TRIGGER IF NOT EXISTS map_suggestions_protect_original
BEFORE UPDATE OF id, submission_id, place_id, base_version, payload_json, data_json,
 publication_consent, consent_version, initial_operating_entity_id,
 current_operating_entity_id, created_at ON map_suggestions
BEGIN SELECT RAISE(ABORT, 'Original map suggestions and permission are immutable'); END;
CREATE TRIGGER IF NOT EXISTS map_suggestions_no_delete BEFORE DELETE ON map_suggestions
BEGIN SELECT RAISE(ABORT, 'Map suggestions retain their history'); END;
CREATE TRIGGER IF NOT EXISTS map_places_protect_origin
BEFORE UPDATE OF id, initial_operating_entity_id, current_operating_entity_id, created_at ON map_places
BEGIN SELECT RAISE(ABORT, 'Original map operator and creation date are immutable'); END;

CREATE TABLE IF NOT EXISTS map_revisions (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES map_places(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'archived')),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  suggestion_id TEXT REFERENCES map_suggestions(id),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (place_id, version)
);
CREATE TRIGGER IF NOT EXISTS map_revisions_no_update BEFORE UPDATE ON map_revisions
BEGIN SELECT RAISE(ABORT, 'Map revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS map_revisions_no_delete BEFORE DELETE ON map_revisions
BEGIN SELECT RAISE(ABORT, 'Map revisions are append-only'); END;

CREATE TABLE IF NOT EXISTS map_audit_events (
  id TEXT PRIMARY KEY,
  suggestion_id TEXT REFERENCES map_suggestions(id),
  place_id TEXT REFERENCES map_places(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'published', 'rejected', 'archived')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS map_audit_no_update BEFORE UPDATE ON map_audit_events
BEGIN SELECT RAISE(ABORT, 'Map audit events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS map_audit_no_delete BEFORE DELETE ON map_audit_events
BEGIN SELECT RAISE(ABORT, 'Map audit events are append-only'); END;
