-- Portable SQLite/D1 schema. This records interest, never legal membership.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operating_entities (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  abn TEXT,
  legal_status TEXT NOT NULL CHECK (legal_status IN ('sole_trader', 'proposed')),
  description TEXT NOT NULL
);

INSERT OR IGNORE INTO operating_entities (id, legal_name, abn, legal_status, description) VALUES
  ('sbt', 'Strange But True', '81913657174', 'sole_trader', 'Initial sole trader pilot operator. Expressions of interest are not cooperative membership.'),
  ('ready-setco', 'Ready Sustainable Employment and Training Cooperative', NULL, 'proposed', 'Proposed cooperative; registration, membership and any future handover require separate decisions.');

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  organisation TEXT NOT NULL DEFAULT '',
  participant_type TEXT NOT NULL CHECK (participant_type IN ('business', 'community', 'resident', 'worker')),
  authority_confirmed INTEGER NOT NULL CHECK (authority_confirmed IN (0, 1)),
  interests_json TEXT NOT NULL,
  offer TEXT NOT NULL DEFAULT '',
  consent_contact INTEGER NOT NULL CHECK (consent_contact = 1),
  consent_version TEXT NOT NULL,
  consent_future_handover INTEGER NOT NULL DEFAULT 0 CHECK (consent_future_handover IN (0, 1)),
  initial_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  current_operating_entity_id TEXT NOT NULL DEFAULT 'sbt' REFERENCES operating_entities(id),
  status TEXT NOT NULL DEFAULT 'interest' CHECK (status IN ('interest', 'contacted', 'pilot_partner', 'founding_interest', 'withdrawn')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (participant_type NOT IN ('business', 'community') OR authority_confirmed = 1)
);
CREATE INDEX IF NOT EXISTS participants_created_idx ON participants(created_at DESC, id);
CREATE INDEX IF NOT EXISTS participants_status_idx ON participants(status, created_at DESC);

-- A future handover needs a new, separately designed workflow. Neither an admin
-- status change nor a software migration may rewrite the initial consent/operator.
CREATE TRIGGER IF NOT EXISTS participants_protect_intake
BEFORE UPDATE OF submission_id, name, email, phone, organisation, participant_type,
  authority_confirmed, interests_json, offer, consent_contact, consent_version,
  consent_future_handover, initial_operating_entity_id, current_operating_entity_id,
  created_at ON participants
BEGIN
  SELECT RAISE(ABORT, 'Intake and operator history are immutable');
END;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  entity_id TEXT NOT NULL REFERENCES operating_entities(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('intake_received', 'review_updated')),
  actor TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  notes_changed INTEGER NOT NULL DEFAULT 0 CHECK (notes_changed IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_participant_idx ON audit_events(participant_id, created_at, id);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;

-- Only a salted hash of IP plus hour is stored, never the source IP.
CREATE TABLE IF NOT EXISTS intake_rate_limits (
  bucket_hash TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS intake_rate_expiry_idx ON intake_rate_limits(expires_at);
