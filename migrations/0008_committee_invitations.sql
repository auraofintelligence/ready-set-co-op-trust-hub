-- Webmaster-managed invitations stage committee access until the person accepts.
-- Existing accounts, passwords, public participation and legal membership are unchanged.
CREATE TABLE IF NOT EXISTS member_committee_invitations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES member_accounts(id),
  site_id TEXT NOT NULL REFERENCES member_sites(id),
  role TEXT NOT NULL DEFAULT 'committee' CHECK (role = 'committee'),
  current_link_id TEXT REFERENCES member_auth_links(id),
  expires_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  original_payload_json TEXT NOT NULL CHECK (json_valid(original_payload_json)),
  last_operation_id TEXT NOT NULL,
  CHECK (accepted_at IS NULL OR cancelled_at IS NULL)
);
CREATE INDEX IF NOT EXISTS member_committee_invitations_order_idx
ON member_committee_invitations(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS member_committee_invitations_site_idx
ON member_committee_invitations(site_id, accepted_at, cancelled_at, expires_at);
CREATE TRIGGER IF NOT EXISTS member_committee_invitations_protect_origin
BEFORE UPDATE OF id, account_id, site_id, role, created_at, created_by, original_payload_json ON member_committee_invitations
BEGIN SELECT RAISE(ABORT, 'Committee invitation origins are retained'); END;
CREATE TRIGGER IF NOT EXISTS member_committee_invitations_no_delete
BEFORE DELETE ON member_committee_invitations
BEGIN SELECT RAISE(ABORT, 'Cancel an invitation to retain its history'); END;

ALTER TABLE member_auth_links ADD COLUMN committee_invitation_id TEXT REFERENCES member_committee_invitations(id);
