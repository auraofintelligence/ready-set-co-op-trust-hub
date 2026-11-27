-- Personal participation and local-group services in the existing operations database.
-- An account, access role or accepted participation application is not legal admission.
CREATE TABLE IF NOT EXISTS member_profiles (
  account_id TEXT PRIMARY KEY REFERENCES member_accounts(id),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL,
  write_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locality TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  governance_workspace_id TEXT UNIQUE REFERENCES governance_workspaces(id),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  applications_open INTEGER NOT NULL DEFAULT 0 CHECK (applications_open IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  write_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_site_roles (
  site_id TEXT NOT NULL REFERENCES member_sites(id),
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  role TEXT NOT NULL CHECK (role IN ('participant','committee','none')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  write_id TEXT NOT NULL,
  PRIMARY KEY (site_id, account_id)
);
CREATE INDEX IF NOT EXISTS member_site_roles_account ON member_site_roles(account_id, role, site_id);
CREATE TABLE IF NOT EXISTS member_applications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  site_id TEXT NOT NULL REFERENCES member_sites(id),
  status TEXT NOT NULL CHECK (status IN ('submitted','in_review','more_info','accepted_participant','declined','withdrawn','admitted')),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  request_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  write_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_applications_site_status ON member_applications(site_id, status, updated_at);
CREATE INDEX IF NOT EXISTS member_applications_account ON member_applications(account_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS member_applications_active ON member_applications(account_id, site_id) WHERE status NOT IN ('declined','withdrawn');
CREATE TABLE IF NOT EXISTS member_bulletins (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES member_sites(id),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  request_hash TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  write_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_bulletins_site ON member_bulletins(site_id, archived, created_at);
CREATE TABLE IF NOT EXISTS member_service_history (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('profile','site','role','application','bulletin')),
  entity_id TEXT NOT NULL,
  account_id TEXT REFERENCES member_accounts(id),
  site_id TEXT REFERENCES member_sites(id),
  version INTEGER NOT NULL,
  event TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, version)
);
CREATE INDEX IF NOT EXISTS member_service_history_account ON member_service_history(account_id, created_at);
CREATE INDEX IF NOT EXISTS member_service_history_site ON member_service_history(site_id, created_at);
CREATE TRIGGER IF NOT EXISTS member_service_history_no_update BEFORE UPDATE ON member_service_history BEGIN SELECT RAISE(ABORT, 'Member service history is append only'); END;
CREATE TRIGGER IF NOT EXISTS member_service_history_no_delete BEFORE DELETE ON member_service_history BEGIN SELECT RAISE(ABORT, 'Member service history is append only'); END;
CREATE TRIGGER IF NOT EXISTS member_applications_protect_origin BEFORE UPDATE ON member_applications
WHEN NEW.id != OLD.id OR NEW.account_id != OLD.account_id OR NEW.site_id != OLD.site_id OR NEW.created_at != OLD.created_at OR NEW.request_hash != OLD.request_hash
BEGIN SELECT RAISE(ABORT, 'Application origin is immutable'); END;
CREATE TRIGGER IF NOT EXISTS member_applications_no_delete BEFORE DELETE ON member_applications BEGIN SELECT RAISE(ABORT, 'Withdraw applications to preserve their history'); END;
CREATE TRIGGER IF NOT EXISTS member_sites_protect_origin BEFORE UPDATE ON member_sites
WHEN NEW.id != OLD.id OR NEW.created_at != OLD.created_at OR NEW.created_by != OLD.created_by
BEGIN SELECT RAISE(ABORT, 'Local group origin is immutable'); END;

-- This is the proposed pilot's service listing, not a registered entity, member or decision.
INSERT OR IGNORE INTO member_sites (id,name,locality,summary,published,applications_open,version,created_at,updated_at,created_by,write_id)
VALUES ('minjerribah','ready SET Co-op: Minjerribah pilot','Minjerribah / North Stradbroke Island','Help shape a proposed cooperative for sustainable employment, training and shared local resources. Participation is open to interested people and authorised representatives of businesses and community organisations.',1,1,1,'2026-11-27T00:00:00.000Z','2026-11-27T00:00:00.000Z','system:member-service-setup','initial-pilot-listing');
INSERT OR IGNORE INTO member_service_history (id,entity_type,entity_id,site_id,version,event,snapshot_json,actor,created_at)
VALUES ('initial-pilot-listing','site','minjerribah','minjerribah',1,'service_listing_created','{"id":"minjerribah","name":"ready SET Co-op: Minjerribah pilot","stage":"proposed","purpose":"Initial service configuration; no legal registration or admission asserted"}','system:member-service-setup','2026-11-27T00:00:00.000Z');
