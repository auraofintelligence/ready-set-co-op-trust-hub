-- Password credentials extend the existing account and session system.
-- OPAQUE records contain no plaintext password. No person or role is seeded.
ALTER TABLE member_sessions ADD COLUMN authentication TEXT NOT NULL DEFAULT 'passkey'
  CHECK (authentication IN ('passkey', 'password'));

CREATE TABLE member_password_setup (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_setup TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER member_password_setup_no_update BEFORE UPDATE ON member_password_setup
BEGIN SELECT RAISE(ABORT, 'The password server setup must be preserved'); END;
CREATE TRIGGER member_password_setup_no_delete BEFORE DELETE ON member_password_setup
BEGIN SELECT RAISE(ABORT, 'The password server setup must be preserved'); END;

CREATE TABLE member_passwords (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  registration_record TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'opaque-ristretto255-sha512-v1' CHECK (protocol = 'opaque-ristretto255-sha512-v1'),
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  last_operation_id TEXT NOT NULL
);
CREATE UNIQUE INDEX member_passwords_active_idx ON member_passwords(account_id) WHERE revoked_at IS NULL;
CREATE INDEX member_passwords_account_idx ON member_passwords(account_id, created_at);
CREATE TRIGGER member_passwords_protect_origin
BEFORE UPDATE OF id, account_id, registration_record, protocol, created_at ON member_passwords
BEGIN SELECT RAISE(ABORT, 'Password credential origins are retained'); END;
CREATE TRIGGER member_passwords_no_delete BEFORE DELETE ON member_passwords
BEGIN SELECT RAISE(ABORT, 'Revoke a password to retain its history'); END;

CREATE TABLE member_password_ceremonies (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'bootstrap', 'activate', 'recover', 'change', 'login', 'reauth', 'recovery-codes')),
  binding_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  account_id TEXT,
  credential_id TEXT,
  encrypted_login_state TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  claim_id TEXT
);
CREATE INDEX member_password_ceremonies_expiry_idx ON member_password_ceremonies(expires_at);
