-- Private formation records extend the existing Ready SETCO database.
-- No workspace, person, appointment or legal status is seeded by this migration.
CREATE TABLE IF NOT EXISTS governance_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  stage TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  original_payload_json TEXT NOT NULL CHECK (json_valid(original_payload_json)),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  last_operation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS governance_workspaces_order_idx ON governance_workspaces(name, id);
CREATE TRIGGER IF NOT EXISTS governance_workspaces_protect_origin
BEFORE UPDATE OF id, original_payload_json, created_at, created_by ON governance_workspaces
BEGIN SELECT RAISE(ABORT, 'Workspace origins are immutable'); END;
CREATE TRIGGER IF NOT EXISTS governance_workspaces_no_delete BEFORE DELETE ON governance_workspaces
BEGIN SELECT RAISE(ABORT, 'Workspace history is retained'); END;

CREATE TABLE IF NOT EXISTS governance_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES governance_workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('task','rule','meeting','decision','membership','role','finance','handover','policy','asset','risk')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','in-review','approved','completed','archived')),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  original_payload_json TEXT NOT NULL CHECK (json_valid(original_payload_json)),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  last_operation_id TEXT NOT NULL,
  UNIQUE (id, workspace_id)
);
CREATE INDEX IF NOT EXISTS governance_records_workspace_idx ON governance_records(workspace_id, kind, status, updated_at, id);
CREATE TRIGGER IF NOT EXISTS governance_records_protect_origin
BEFORE UPDATE OF id, workspace_id, kind, original_payload_json, created_at, created_by ON governance_records
BEGIN SELECT RAISE(ABORT, 'Record origins and workspace are immutable'); END;
CREATE TRIGGER IF NOT EXISTS governance_records_no_delete BEFORE DELETE ON governance_records
BEGIN SELECT RAISE(ABORT, 'Governance records retain their history'); END;

CREATE TABLE IF NOT EXISTS governance_workspace_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES governance_workspaces(id),
  version INTEGER NOT NULL CHECK (version > 0),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  UNIQUE (workspace_id, version)
);
CREATE TRIGGER IF NOT EXISTS governance_workspace_revisions_no_update BEFORE UPDATE ON governance_workspace_revisions
BEGIN SELECT RAISE(ABORT, 'Workspace revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS governance_workspace_revisions_no_delete BEFORE DELETE ON governance_workspace_revisions
BEGIN SELECT RAISE(ABORT, 'Workspace revisions are append-only'); END;

CREATE TABLE IF NOT EXISTS governance_record_revisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES governance_workspaces(id),
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  FOREIGN KEY (record_id, workspace_id) REFERENCES governance_records(id, workspace_id),
  UNIQUE (record_id, version)
);
CREATE INDEX IF NOT EXISTS governance_record_history_idx ON governance_record_revisions(workspace_id, record_id, version);
CREATE TRIGGER IF NOT EXISTS governance_record_revisions_no_update BEFORE UPDATE ON governance_record_revisions
BEGIN SELECT RAISE(ABORT, 'Governance revisions are append-only'); END;
CREATE TRIGGER IF NOT EXISTS governance_record_revisions_no_delete BEFORE DELETE ON governance_record_revisions
BEGIN SELECT RAISE(ABORT, 'Governance revisions are append-only'); END;
