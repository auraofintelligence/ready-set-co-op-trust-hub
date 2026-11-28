-- Permission-checked course images in the existing D1 service.
CREATE TABLE learning_screenshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES member_sites(id),
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  byte_count INTEGER NOT NULL CHECK (byte_count BETWEEN 1 AND 1048576),
  digest TEXT NOT NULL,
  content_base64 TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES member_accounts(id),
  created_at TEXT NOT NULL,
  UNIQUE (site_id,digest)
);
