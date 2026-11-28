-- Private learning, participation preferences and evidence-review metadata.
CREATE TABLE learning_profiles (
  account_id TEXT PRIMARY KEY REFERENCES member_accounts(id),
  preferences_json TEXT NOT NULL CHECK (json_valid(preferences_json)),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE learning_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE
);

INSERT INTO learning_categories (id, name, position) VALUES
  ('committee', 'Committee roles and handovers', 10),
  ('volunteers', 'Volunteer onboarding', 20),
  ('community-media', 'Community screen and media', 30),
  ('noticeboard', 'Noticeboard publishing and stewardship', 40),
  ('working-holiday', 'Working holiday and employment preparation', 50),
  ('employers', 'Employer onboarding and cooperative participation', 60),
  ('grants', 'Grant writing and project delivery', 70),
  ('events', 'Events and crew skills', 80),
  ('digital-stewardship', 'Place modelling and digital stewardship', 90);

CREATE TABLE learning_courses (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES learning_categories(id),
  site_id TEXT REFERENCES member_sites(id),
  provider_name TEXT NOT NULL
);

CREATE TABLE learning_course_versions (
  course_id TEXT NOT NULL REFERENCES learning_courses(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (state IN ('draft','published','retired')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  lessons_json TEXT NOT NULL CHECK (json_valid(lessons_json)),
  PRIMARY KEY (course_id, revision)
);

CREATE TRIGGER learning_course_version_needs_site
BEFORE UPDATE OF state ON learning_course_versions
WHEN NEW.state = 'published' AND NOT EXISTS (
  SELECT 1 FROM learning_courses
  WHERE id = NEW.course_id AND site_id IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'Published courses need a learning group'); END;

CREATE TRIGGER learning_course_version_insert_needs_site
BEFORE INSERT ON learning_course_versions
WHEN NEW.state = 'published' AND NOT EXISTS (
  SELECT 1 FROM learning_courses WHERE id = NEW.course_id AND site_id IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'Published courses need a learning group'); END;

CREATE TRIGGER learning_course_version_preserve_content
BEFORE UPDATE OF course_id, revision, title, description, lessons_json ON learning_course_versions
WHEN OLD.state <> 'draft'
BEGIN SELECT RAISE(ABORT, 'Published course content is versioned'); END;

CREATE TRIGGER learning_course_version_keep_release
BEFORE UPDATE OF state ON learning_course_versions
WHEN OLD.state <> 'draft' AND NEW.state = 'draft'
BEGIN SELECT RAISE(ABORT, 'Create a new course draft version'); END;

CREATE TABLE learning_completions (
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  course_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  assessed_by TEXT REFERENCES member_accounts(id),
  PRIMARY KEY (account_id, course_id, revision),
  FOREIGN KEY (course_id, revision) REFERENCES learning_course_versions(course_id, revision)
);

CREATE TRIGGER learning_completion_needs_release
BEFORE INSERT ON learning_completions
WHEN NOT EXISTS (
  SELECT 1 FROM learning_course_versions
  WHERE course_id = NEW.course_id AND revision = NEW.revision AND state IN ('published','retired')
)
BEGIN SELECT RAISE(ABORT, 'Course completions need a released version'); END;

CREATE TABLE learning_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  category TEXT NOT NULL CHECK (category IN ('work_rights','licence','qualification','english','skill')),
  label TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT '',
  consent_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','more_info','verified','declined','withdrawn','revoked')),
  method TEXT CHECK (method IN ('vevo','issuer','sighted','practical')),
  expires_on TEXT,
  reviewed_by TEXT REFERENCES member_accounts(id),
  reviewed_at TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  write_id TEXT NOT NULL,
  CHECK (status <> 'verified' OR (method IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (category <> 'work_rights' OR status <> 'verified' OR (method = 'vevo' AND expires_on IS NOT NULL))
);

CREATE INDEX learning_evidence_owner ON learning_evidence(account_id, updated_at DESC, id);
CREATE INDEX learning_evidence_queue ON learning_evidence(status, updated_at DESC, id);

CREATE TABLE learning_evidence_history (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES learning_evidence(id),
  actor_id TEXT NOT NULL REFERENCES member_accounts(id),
  status TEXT NOT NULL CHECK (status IN ('submitted','more_info','verified','declined','withdrawn','revoked')),
  method TEXT,
  expires_on TEXT,
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL
);

CREATE INDEX learning_evidence_history_record ON learning_evidence_history(evidence_id, recorded_at, id);

-- PLFC draft examples. A separate approval and group assignment are required for release.
INSERT INTO learning_courses (id, category_id, provider_name) VALUES
  ('plfc-officer-handover','committee','Point Lookout Fishing Club'),
  ('plfc-volunteer-onboarding','volunteers','Point Lookout Fishing Club');

INSERT INTO learning_course_versions (course_id, revision, state, title, description, lessons_json) VALUES
  ('plfc-officer-handover', 1, 'draft', 'PLFC officer onboarding and handover',
   'Prepare an incoming office holder to run their first duties and keep open tasks moving.',
   json_array(
     json_object('title','Before the handover','body','Identify the current rules, meeting calendar, active decisions, open tasks, deadlines and relevant contacts. Mark who owns each task, what decision remains and where authorised source records can be found. Keep member details in the clubhouse.'),
     json_object('title','Walk the incoming officer through their desk','body','Practise setting an agenda, recording a motion and carrying actions into the officer task list. The Secretary and Assistant Secretary rehearse their filing and follow-up process. The Treasurer rehearses a payment reconciliation using a fictional record. The chair rehearses a declaration of interest and delegation.'),
     json_object('title','Transfer access and responsibility','body','Confirm the appointment and access change through the club process. The incoming officer uses an individual account, checks authorised access and confirms custody of equipment or records. The outgoing officer returns club property and the authorised administrator reviews access.'),
     json_object('title','Practical handover','body','Prepare a fictional handover pack with the next meeting date, three open actions, role-specific access, outstanding risks and a review date. Walk a reviewer through the first week of duties and record any follow-up.')
   )),
  ('plfc-volunteer-onboarding', 1, 'draft', 'PLFC volunteer onboarding',
   'Help a new volunteer prepare for a confirmed club task, find support and hand the work back.',
   json_array(
     json_object('title','Choose a task and confirm the handover','body','Use the approved event run sheet to find the shift, meeting point, task scope and person responsible. Confirm the task, any required training and what to do if conditions change. Confirm any expenses and arrangements with the club contact.'),
     json_object('title','Briefing, safeguards and escalation','body','Meet the team lead and confirm the site briefing, equipment instructions, weather decision point, emergency contacts and reporting process. Ask the authorised lead before changing duties, supervising juniors or taking or sharing photos.'),
     json_object('title','Practical shift preparation','body','Use a fictional fishing event or club fundraiser. Identify who leads the task, when to check in, the equipment required, where to report a problem and how to return equipment and pass on outstanding work.')
   ));
