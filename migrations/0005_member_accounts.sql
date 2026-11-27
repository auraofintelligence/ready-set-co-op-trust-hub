-- Native participant accounts. An account is not cooperative membership.
-- Additive to the existing service; no people, credentials or privileges are seeded.
CREATE TABLE IF NOT EXISTS member_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified = 0),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  webmaster INTEGER NOT NULL DEFAULT 0 CHECK (webmaster IN (0, 1)),
  consent_account INTEGER NOT NULL DEFAULT 0 CHECK (consent_account IN (0, 1)),
  consent_version TEXT NOT NULL DEFAULT '',
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  last_login_at TEXT,
  original_payload_json TEXT NOT NULL CHECK (json_valid(original_payload_json)),
  last_operation_id TEXT NOT NULL,
  CHECK (webmaster = 0 OR status IN ('active', 'disabled'))
);
CREATE INDEX IF NOT EXISTS member_accounts_order_idx ON member_accounts(username, id);
CREATE TRIGGER IF NOT EXISTS member_accounts_protect_origin
BEFORE UPDATE OF id, username, created_at, created_by, original_payload_json ON member_accounts
BEGIN SELECT RAISE(ABORT, 'Account origins are retained'); END;
CREATE TRIGGER IF NOT EXISTS member_accounts_no_delete BEFORE DELETE ON member_accounts
BEGIN SELECT RAISE(ABORT, 'Disable an account to retain its history'); END;

CREATE TABLE IF NOT EXISTS member_auth_bootstrap (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_id TEXT NOT NULL UNIQUE REFERENCES member_accounts(id),
  claimed_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS member_auth_bootstrap_no_update BEFORE UPDATE ON member_auth_bootstrap
BEGIN SELECT RAISE(ABORT, 'Initial webmaster setup is permanently closed'); END;
CREATE TRIGGER IF NOT EXISTS member_auth_bootstrap_no_delete BEFORE DELETE ON member_auth_bootstrap
BEGIN SELECT RAISE(ABORT, 'Initial webmaster setup is permanently closed'); END;

CREATE TABLE IF NOT EXISTS member_passkeys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  rp_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL CHECK (counter >= 0),
  transports_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(transports_json)),
  device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
  label TEXT NOT NULL DEFAULT 'Passkey',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  last_operation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_passkeys_account_idx ON member_passkeys(account_id, revoked_at);
CREATE TRIGGER IF NOT EXISTS member_passkeys_protect_origin
BEFORE UPDATE OF id, account_id, rp_id, credential_id, public_key, created_at ON member_passkeys
BEGIN SELECT RAISE(ABORT, 'Passkey origins are retained'); END;
CREATE TRIGGER IF NOT EXISTS member_passkeys_no_delete BEFORE DELETE ON member_passkeys
BEGIN SELECT RAISE(ABORT, 'Revoke a passkey to retain its history'); END;

CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  auth_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_sessions_account_idx ON member_sessions(account_id, expires_at);
CREATE INDEX IF NOT EXISTS member_sessions_expiry_idx ON member_sessions(expires_at);

CREATE TABLE IF NOT EXISTS member_auth_links (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('activation', 'recovery')),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT,
  claim_id TEXT
);
CREATE INDEX IF NOT EXISTS member_auth_links_account_idx ON member_auth_links(account_id, purpose, expires_at);

CREATE TABLE IF NOT EXISTS member_recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  claim_id TEXT
);
CREATE INDEX IF NOT EXISTS member_recovery_codes_account_idx ON member_recovery_codes(account_id, used_at, revoked_at);

CREATE TABLE IF NOT EXISTS member_auth_ceremonies (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'bootstrap', 'activate', 'recover', 'login', 'passkeys', 'recovery-codes')),
  challenge TEXT NOT NULL UNIQUE,
  binding_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  account_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  claim_id TEXT
);
CREATE INDEX IF NOT EXISTS member_auth_ceremonies_expiry_idx ON member_auth_ceremonies(expires_at);

CREATE TABLE IF NOT EXISTS member_auth_limits (
  bucket_hash TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_auth_limits_expiry_idx ON member_auth_limits(expires_at);

CREATE TABLE IF NOT EXISTS member_auth_audit (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json))
);
CREATE INDEX IF NOT EXISTS member_auth_audit_account_idx ON member_auth_audit(account_id, created_at DESC, id);
CREATE TRIGGER IF NOT EXISTS member_auth_audit_no_update BEFORE UPDATE ON member_auth_audit
BEGIN SELECT RAISE(ABORT, 'Account audit history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS member_auth_audit_no_delete BEFORE DELETE ON member_auth_audit
BEGIN SELECT RAISE(ABORT, 'Account audit history is append-only'); END;
