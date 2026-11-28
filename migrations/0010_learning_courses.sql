-- Private PLFC training group and versioned course participation.
INSERT INTO member_sites (
  id, name, locality, summary, published, applications_open, created_at, updated_at, created_by, write_id
) VALUES (
  'plfc-training', 'Point Lookout Fishing Club training', 'Point Lookout',
  'Private induction and handover training for Point Lookout Fishing Club officers and volunteers.',
  0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  'migration:0010', 'migration:0010'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE learning_course_versions ADD COLUMN practical TEXT NOT NULL DEFAULT '';
ALTER TABLE learning_course_versions ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE learning_course_versions ADD COLUMN edited_by TEXT REFERENCES member_accounts(id);
ALTER TABLE learning_course_versions ADD COLUMN published_by TEXT REFERENCES member_accounts(id);
ALTER TABLE learning_course_versions ADD COLUMN published_at TEXT;

CREATE TRIGGER learning_course_practical_preserve
BEFORE UPDATE OF practical, published_by, published_at ON learning_course_versions
WHEN OLD.state <> 'draft'
BEGIN SELECT RAISE(ABORT, 'Released course assessment is versioned'); END;

CREATE UNIQUE INDEX learning_one_draft ON learning_course_versions(course_id) WHERE state='draft';
CREATE UNIQUE INDEX learning_one_current_release ON learning_course_versions(course_id) WHERE state='published';
CREATE INDEX learning_courses_group ON learning_courses(site_id, id);

UPDATE learning_courses SET site_id='plfc-training'
WHERE id IN ('plfc-officer-handover','plfc-volunteer-onboarding') AND site_id IS NULL;

CREATE TABLE learning_enrolments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id),
  course_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  enrolled_at TEXT NOT NULL,
  UNIQUE (account_id,course_id,revision),
  FOREIGN KEY (course_id, revision) REFERENCES learning_course_versions(course_id,revision)
);

CREATE TABLE learning_lesson_progress (
  enrolment_id TEXT NOT NULL REFERENCES learning_enrolments(id),
  lesson_number INTEGER NOT NULL CHECK (lesson_number >= 1),
  completed_at TEXT NOT NULL,
  PRIMARY KEY (enrolment_id,lesson_number)
);

CREATE TABLE learning_practicals (
  enrolment_id TEXT NOT NULL REFERENCES learning_enrolments(id),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  response TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','revise','passed')),
  feedback TEXT NOT NULL DEFAULT '',
  reviewer_id TEXT REFERENCES member_accounts(id),
  reviewed_at TEXT,
  PRIMARY KEY (enrolment_id,attempt)
);

CREATE INDEX learning_practical_queue ON learning_practicals(status,submitted_at,enrolment_id);
CREATE TRIGGER learning_practical_review_once
BEFORE UPDATE ON learning_practicals
WHEN OLD.status <> 'submitted' OR NEW.status NOT IN ('revise','passed') OR
  NEW.reviewer_id IS NULL OR NEW.reviewed_at IS NULL OR NEW.response <> OLD.response OR
  NEW.enrolment_id <> OLD.enrolment_id OR NEW.attempt <> OLD.attempt OR NEW.submitted_at <> OLD.submitted_at OR
  NEW.reviewer_id = (SELECT account_id FROM learning_enrolments WHERE id=OLD.enrolment_id)
BEGIN SELECT RAISE(ABORT, 'Practical reviews require an independent decision'); END;

CREATE TRIGGER learning_practical_completion
AFTER UPDATE OF status ON learning_practicals WHEN NEW.status='passed'
BEGIN
  INSERT INTO learning_completions (account_id,course_id,revision,completed_at,assessed_by)
  SELECT account_id,course_id,revision,NEW.reviewed_at,NEW.reviewer_id
  FROM learning_enrolments WHERE id=NEW.enrolment_id
  ON CONFLICT (account_id,course_id,revision) DO NOTHING;
END;

UPDATE learning_course_versions SET
  lessons_json=json_array(
    json_object('title','Prepare before the changeover','body','Make a list of the minutes, current rules, calendar, outstanding commitments and club property that matter to your role. For each open item, record what has already been agreed, what still needs a decision and who''s responsible. Keep the source records in the authorised clubhouse location. The handover can point to those records without copying private member information.'),
    json_object('title','Run a first meeting rehearsal','body','The chair prepares a short agenda and invites disclosures of interest. The Secretary checks the club''s rules and meeting arrangements, records the exact wording and outcome of any motion, and gives each agreed action an owner and due date. The Treasurer rehearses matching a fictional receipt to an approved payment and records any discrepancy for follow-up.'),
    json_object('title','Hand over access and equipment','body','Walk through the records, upcoming deadlines and equipment with the incoming officer. Confirm which access the club has authorised. Have the incoming officer check their own account, confirm any equipment they''ve received and record unfinished work. Ask the appropriate administrator to review the outgoing officer''s access. Keep passwords out of the handover pack.'),
    json_object('title','Check the first week','body','Agree when the incoming officer will report back. Use that check-in to resolve missing files, access gaps or unclear owners. If a decision or record is missing, identify who can verify it and when you''ll follow up. A useful handover gives the next person a clear path to their first task.')
  ),
  practical='Using a fictional meeting six days away, write a handover note for your role. Identify the next meeting and its draft agenda, three open actions with owners and due dates, one unresolved decision or risk, where the incoming officer should find the authorised records, and which access or club property they need to confirm. Finish with a first-week check-in. Your reviewer will check that the next officer can identify what to do, who owns each action and where authority sits.'
WHERE course_id='plfc-officer-handover' AND revision=1 AND state='draft';

UPDATE learning_course_versions SET
  lessons_json=json_array(
    json_object('title','Agree on the shift','body','Check the event run sheet with the shift lead. Confirm when and where you start, what the job involves, what equipment you need and what to do if you can''t attend. Raise access needs or questions about agreed expenses with the club contact before the event.'),
    json_object('title','Briefing and safeguards','body','At check-in, ask the lead about the site, conditions, equipment and reporting arrangements. Confirm who calls a weather pause and who handles incidents or concerns. Check with the designated lead before supervising juniors, changing duties or taking photos. Follow the event''s directions if conditions or responsibilities change.'),
    json_object('title','Finish and hand over','body','Return equipment and tell the shift lead about missing items, issues and unfinished tasks. If another volunteer takes over, tell them what''s done and what needs their attention. Pass private information only to the person authorised to receive it.')
  ),
  practical='Plan a fictional volunteer shift at a PLFC fundraiser or fishing event. Name the task, meeting point and shift lead. Explain what happens if weather changes, someone reports a problem or a task involving juniors comes up. Include an equipment check, what you tell the next volunteer at handover, and who gets any outstanding action. Your reviewer will check that your briefing gives a new volunteer enough information to start and finish the shift.'
WHERE course_id='plfc-volunteer-onboarding' AND revision=1 AND state='draft';
