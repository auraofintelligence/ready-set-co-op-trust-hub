import { LearningRequestError } from './learning.mjs';
import { DRAFT_LIMIT, SCREENSHOT_GROUP_LIMIT, UUID, fields, text, draftLesson, learnerCourse, checkPractice, readScreenshot } from './learning-course-content.mjs';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PAGE_SIZE = 25;
const okay = body => Response.json(body);
const fail = (status, code, message) => { throw new LearningRequestError(status, code, message); };
const missing = () => fail(404, 'course_not_found', 'This course or activity is unavailable for your account.');
const conflict = () => fail(409, 'course_conflict', 'This activity has changed. Reload it and try again.');

function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'course_fields', 'Choose a valid course version or activity.');
  return value;
}

function id(value, shape = ID) {
  if (typeof value !== 'string' || !shape.test(value)) fail(400, 'course_fields', 'Choose a valid course, group or participant record.');
  return value;
}

function page(url) {
  if (!url.searchParams.has('page')) return 1;
  const value = Number(url.searchParams.get('page'));
  if (value > 100000) fail(400, 'course_fields', 'Choose a valid page.');
  return positive(value);
}

function gate(identity, now, site, access) {
  const roles = access === 'staff' ? "'committee'" : "'participant','committee'";
  const siteRole = `EXISTS (SELECT 1 FROM member_site_roles role
    WHERE role.account_id=actor.id AND role.site_id=${site} AND role.role IN (${roles}))`;
  const permission = access === 'staff' ? `(actor.webmaster=1 OR ${siteRole})` : siteRole;
  const session = identity.sessionHash
    ? " AND EXISTS (SELECT 1 FROM member_sessions session WHERE session.token_hash=? AND session.account_id=actor.id AND session.expires_at>? AND session.auth_version=actor.auth_version)"
    : '';
  return {
    sql: `EXISTS (SELECT 1 FROM member_accounts actor WHERE actor.id=? AND actor.status='active' AND ${permission}${session})`,
    values: [identity.accountId, ...(identity.sessionHash ? [identity.sessionHash, now] : [])]
  };
}

const courseSelect = `c.id,c.site_id AS siteId,c.category_id AS category,c.provider_name AS provider,
  v.revision,v.title,v.description,v.state,v.lessons_json,v.practical,v.edit_version AS editVersion,v.published_at AS publishedAt`;

function courseFrom(row) {
  const { lessons_json, ...course } = row;
  return { ...course, lessons: JSON.parse(lessons_json) };
}

async function catalogue(db, identity, now, currentPage) {
  const learner = gate(identity, now, 'c.site_id', 'learn');
  const rows = (await db.prepare(`SELECT c.id,c.category_id AS category,g.name AS categoryName,c.provider_name AS provider,
      v.revision,v.title,v.description,e.id AS enrolmentId,p.status AS practicalStatus,
      v.practical<>'' AS requiresAssessment, completion.completed_at AS completedAt,
      (SELECT COUNT(*) FROM learning_lesson_progress l WHERE l.enrolment_id=e.id) AS lessonsDone,
      json_array_length(v.lessons_json) AS lessonCount
    FROM learning_courses c JOIN learning_categories g ON g.id=c.category_id
    JOIN learning_course_versions v ON v.course_id=c.id
    LEFT JOIN learning_enrolments e ON e.course_id=c.id AND e.revision=v.revision AND e.account_id=?
    LEFT JOIN learning_completions completion ON completion.account_id=e.account_id
      AND completion.course_id=e.course_id AND completion.revision=e.revision
    LEFT JOIN learning_practicals p ON p.enrolment_id=e.id AND p.attempt=(SELECT max(attempt) FROM learning_practicals WHERE enrolment_id=e.id)
    WHERE (v.state='published' OR (v.state='retired' AND e.id IS NOT NULL)) AND ${learner.sql}
    ORDER BY g.position,v.title,c.id,v.revision DESC LIMIT ? OFFSET ?`)
    .bind(identity.accountId, ...learner.values, PAGE_SIZE + 1, (currentPage - 1) * PAGE_SIZE).all()).results;
  return okay({ courses: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE });
}

async function lessonCourse(db, identity, now, courseId, revision) {
  const learner = gate(identity, now, 'c.site_id', 'learn');
  const row = await db.prepare(`SELECT ${courseSelect},e.id AS enrolmentId,completion.completed_at AS completedAt
    FROM learning_courses c JOIN learning_course_versions v ON v.course_id=c.id
    LEFT JOIN learning_enrolments e ON e.course_id=c.id AND e.revision=v.revision AND e.account_id=?
    LEFT JOIN learning_completions completion ON completion.account_id=e.account_id
      AND completion.course_id=e.course_id AND completion.revision=e.revision
    WHERE c.id=? AND v.revision=? AND (v.state='published' OR (v.state='retired' AND e.id IS NOT NULL)) AND ${learner.sql}`)
    .bind(identity.accountId, courseId, revision, ...learner.values).first();
  if (!row) missing();
  const course = courseFrom(row);
  if (!course.enrolmentId) return { ...course, progress: [], assessment: null };
  const [progress, practical] = await db.batch([
    db.prepare('SELECT lesson_number AS number FROM learning_lesson_progress WHERE enrolment_id=? ORDER BY lesson_number').bind(course.enrolmentId),
    db.prepare(`SELECT attempt,status,response,feedback,submitted_at AS submittedAt,reviewed_at AS reviewedAt
      FROM learning_practicals WHERE enrolment_id=? ORDER BY attempt DESC LIMIT 1`).bind(course.enrolmentId)
  ]);
  return { ...course, progress: progress.results.map(row => row.number), assessment: practical.results[0] ?? null };
}

async function enrol(db, identity, now, course) {
  if (course.enrolmentId) return;
  const learner = gate(identity, now, 'c.site_id', 'learn');
  await db.prepare(`INSERT INTO learning_enrolments (id,account_id,course_id,revision,enrolled_at)
    SELECT ?,?,c.id,v.revision,? FROM learning_courses c JOIN learning_course_versions v ON v.course_id=c.id
    WHERE c.id=? AND v.revision=? AND v.state='published' AND ${learner.sql}
    ON CONFLICT (account_id,course_id,revision) DO NOTHING`)
    .bind(crypto.randomUUID(), identity.accountId, now, course.id, course.revision, ...learner.values).run();
}

async function completeLesson(db, identity, now, course, data) {
  fields(data, ['number','answers']);
  const number = positive(data.number);
  if (!course.enrolmentId || number > course.lessons.length) missing();
  if (course.progress.includes(number)) return;
  checkPractice(course.lessons[number - 1].questions,data.answers);
  const learner = gate(identity, now, 'c.site_id', 'learn');
  const row = await db.prepare(`INSERT INTO learning_lesson_progress (enrolment_id,lesson_number,completed_at)
    SELECT e.id,?,? FROM learning_enrolments e JOIN learning_courses c ON c.id=e.course_id
    WHERE e.id=? AND e.account_id=? AND ${learner.sql}
    ON CONFLICT (enrolment_id,lesson_number) DO NOTHING RETURNING lesson_number`)
    .bind(number, now, course.enrolmentId, identity.accountId, ...learner.values).first();
  if (!row && !course.progress.includes(number)) {
    const current = await lessonCourse(db, identity, now, course.id, course.revision);
    if (!current.progress.includes(number)) conflict();
  }
}

async function submitPractical(db, identity, now, course, data) {
  fields(data, ['response','previousAttempt']);
  const response = text(data.response, 2700, 'your practical response');
  const previous = data.previousAttempt === 0 ? 0 : positive(data.previousAttempt);
  if (!course.enrolmentId || !course.practical) missing();
  if (previous + 1 === course.assessment?.attempt && response === course.assessment.response) return;
  if (course.progress.length !== course.lessons.length) fail(409, 'course_lessons_required', 'Mark each lesson complete before submitting your practical.');
  const learner = gate(identity, now, 'c.site_id', 'learn');
  const row = await db.prepare(`INSERT INTO learning_practicals (enrolment_id,attempt,response,submitted_at)
    SELECT e.id,?,?,? FROM learning_enrolments e JOIN learning_courses c ON c.id=e.course_id
    WHERE e.id=? AND e.account_id=? AND ${learner.sql}
    AND ((?=0 AND NOT EXISTS (SELECT 1 FROM learning_practicals p WHERE p.enrolment_id=e.id)) OR
      EXISTS (SELECT 1 FROM learning_practicals p WHERE p.enrolment_id=e.id AND p.attempt=? AND p.status='revise'
        AND p.attempt=(SELECT max(attempt) FROM learning_practicals WHERE enrolment_id=e.id)))
    ON CONFLICT (enrolment_id,attempt) DO NOTHING RETURNING attempt`)
    .bind(previous + 1, response, now, course.enrolmentId, identity.accountId, ...learner.values, previous, previous).first();
  if (!row) {
    const updated = await lessonCourse(db, identity, now, course.id, course.revision);
    if (updated.assessment?.attempt !== previous + 1 || updated.assessment.response !== response) conflict();
  }
}

async function staffGroups(db, identity, now, currentPage) {
  const staff = gate(identity, now, 's.id', 'staff');
  const records = await db.prepare(`SELECT s.id,s.name FROM member_sites s WHERE ${staff.sql} ORDER BY s.name,s.id LIMIT ? OFFSET ?`)
    .bind(...staff.values, PAGE_SIZE + 1, (currentPage - 1) * PAGE_SIZE).all();
  return okay({ groups: records.results.slice(0, PAGE_SIZE), more: records.results.length > PAGE_SIZE });
}

async function staffData(db, identity, now, siteId, currentPage, queuePage) {
  const staff = gate(identity, now, 's.id', 'staff');
  const group = await db.prepare(`SELECT s.id,s.name FROM member_sites s WHERE s.id=? AND ${staff.sql}`).bind(siteId, ...staff.values).first();
  if (!group) missing();
  const access = gate(identity, now, 'c.site_id', 'staff');
  const [versions, categories, queue] = await db.batch([
    db.prepare(`SELECT ${courseSelect} FROM learning_courses c JOIN learning_course_versions v ON v.course_id=c.id
      JOIN learning_categories category ON category.id=c.category_id
      WHERE c.site_id=? AND v.state IN ('draft','published') AND ${access.sql}
      ORDER BY category.position,v.title,c.id,v.revision DESC LIMIT ? OFFSET ?`).bind(siteId, ...access.values, PAGE_SIZE + 1, (currentPage - 1) * PAGE_SIZE),
    db.prepare('SELECT id,name FROM learning_categories ORDER BY position'),
    db.prepare(`SELECT p.enrolment_id AS enrolmentId,p.attempt,p.response,p.submitted_at AS submittedAt,v.title,v.practical,
        a.display_name AS learner,v.revision
      FROM learning_practicals p JOIN learning_enrolments e ON e.id=p.enrolment_id
      JOIN member_accounts a ON a.id=e.account_id JOIN learning_courses c ON c.id=e.course_id
      JOIN learning_course_versions v ON v.course_id=e.course_id AND v.revision=e.revision
      WHERE c.site_id=? AND e.account_id<>? AND a.status='active' AND p.status='submitted' AND ${access.sql}
      ORDER BY p.submitted_at,p.enrolment_id,p.attempt LIMIT ? OFFSET ?`)
      .bind(siteId, identity.accountId, ...access.values, PAGE_SIZE + 1, (queuePage - 1) * PAGE_SIZE)
  ]);
  return okay({ group, categories: categories.results, versions: versions.results.slice(0,PAGE_SIZE).map(courseFrom),
    queue: queue.results.slice(0,PAGE_SIZE), moreVersions: versions.results.length > PAGE_SIZE, moreQueue: queue.results.length > PAGE_SIZE });
}

function draftFields(data) {
  const title = text(data.title, 140, 'a title');
  const description = text(data.description, 360, 'an overview');
  const practical = text(data.practical ?? '', 1200, 'instructions for the practical', false);
  if (!Array.isArray(data.lessons) || !data.lessons.length || data.lessons.length > 8) {
    fail(400, 'course_fields', 'Add between one and eight lessons.');
  }
  const lessons = data.lessons.map(draftLesson);
  if (new TextEncoder().encode(JSON.stringify({ title,description,practical,lessons })).length > DRAFT_LIMIT - 1024) {
    fail(400, 'course_fields', 'This course draft is too large. Shorten the text or use shorter caption files.');
  }
  return { title,description,practical,lessons: JSON.stringify(lessons) };
}

async function confirmScreenshots(db, siteId, lessonsJson) {
  const screenshots = [...new Set(JSON.parse(lessonsJson).flatMap(lesson => lesson.screenshot ? [lesson.screenshot.id] : []))];
  if (!screenshots.length) return;
  const record = await db.prepare(`SELECT count(*) AS total FROM learning_screenshots
    WHERE site_id=? AND id IN (SELECT value FROM json_each(?))`).bind(siteId,JSON.stringify(screenshots)).first();
  if (record.total !== screenshots.length) fail(400, 'course_screenshot_scope', 'Add screenshots from this training group.');
}

async function startDraft(db, identity, now, data) {
  fields(data, ['id','siteId','category','title','description','lessons','practical']);
  const siteId = id(data.siteId), courseId = id(data.id, UUID), category = id(data.category);
  const draft = draftFields(data);
  const staff = gate(identity, now, 's.id', 'staff');
  if (!(await db.prepare(`SELECT s.id FROM member_sites s WHERE s.id=? AND ${staff.sql}`).bind(siteId,...staff.values).first())) missing();
  await confirmScreenshots(db,siteId,draft.lessons);
  if (!(await db.prepare('SELECT id FROM learning_categories WHERE id=?').bind(category).first())) {
    fail(400, 'course_fields', 'Choose a course category.');
  }
  const [created, version] = await db.batch([
    db.prepare(`INSERT INTO learning_courses (id,category_id,site_id,provider_name)
      SELECT ?,?,s.id,s.name FROM member_sites s WHERE s.id=? AND ${staff.sql} ON CONFLICT (id) DO NOTHING RETURNING id`)
      .bind(courseId, category, siteId, ...staff.values),
    db.prepare(`INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical,edited_by)
      SELECT c.id,1,'draft',?,?,?,?,? FROM learning_courses c JOIN member_sites s ON s.id=c.site_id
      WHERE c.id=? AND c.site_id=? AND c.category_id=? AND ${staff.sql}
      AND NOT EXISTS (SELECT 1 FROM learning_course_versions WHERE course_id=c.id) RETURNING revision`)
      .bind(draft.title,draft.description,draft.lessons,draft.practical,identity.accountId,courseId,siteId,category,...staff.values)
  ]);
  if (!created.results.length && !version.results.length) {
    const existing = await db.prepare(`SELECT v.title,v.description,v.lessons_json,v.practical FROM learning_courses c
      JOIN member_sites s ON s.id=c.site_id JOIN learning_course_versions v ON v.course_id=c.id
      WHERE c.id=? AND c.site_id=? AND c.category_id=? AND v.revision=1 AND ${staff.sql}`)
      .bind(courseId,siteId,category,...staff.values).first();
    if (!existing || existing.title !== draft.title || existing.description !== draft.description ||
        existing.lessons_json !== draft.lessons || existing.practical !== draft.practical) conflict();
  }
  return okay({ id: courseId, revision: 1 });
}

async function editDraft(db, identity, now, courseId, revision, data) {
  fields(data, ['action','editVersion','title','description','lessons','practical']);
  const staff = gate(identity, now, 'c.site_id', 'staff');
  const existing = await db.prepare(`SELECT ${courseSelect} FROM learning_courses c JOIN learning_course_versions v ON v.course_id=c.id
    WHERE c.id=? AND v.revision=? AND ${staff.sql}`).bind(courseId,revision,...staff.values).first();
  if (!existing) missing();
  const access = `EXISTS (SELECT 1 FROM learning_courses c WHERE c.id=? AND ${staff.sql})`;
  const args = [courseId,...staff.values];
  if (data.action === 'revise') {
    if (existing.state !== 'published') conflict();
    const result = await db.prepare(`INSERT INTO learning_course_versions
      (course_id,revision,state,title,description,lessons_json,practical,edited_by)
      SELECT course_id,revision+1,'draft',title,description,lessons_json,practical,?
      FROM learning_course_versions WHERE course_id=? AND revision=? AND state='published' AND ${access}
      ON CONFLICT (course_id,revision) DO NOTHING RETURNING revision`).bind(identity.accountId,courseId,revision,...args).first();
    if (!result) conflict();
    return okay({ id:courseId,revision:result.revision });
  }
  const expected = positive(data.editVersion);
  if (existing.state !== 'draft' || expected !== existing.editVersion) conflict();
  if (data.action === 'save') {
    const draft = draftFields(data);
    await confirmScreenshots(db,existing.siteId,draft.lessons);
    const saved = await db.prepare(`UPDATE learning_course_versions SET title=?,description=?,lessons_json=?,practical=?,
      edit_version=edit_version+1,edited_by=? WHERE course_id=? AND revision=? AND state='draft' AND edit_version=? AND ${access} RETURNING revision`)
      .bind(draft.title,draft.description,draft.lessons,draft.practical,identity.accountId,courseId,revision,expected,...args).first();
    if (!saved) conflict();
  } else if (data.action === 'publish') {
    const draft = draftFields(courseFrom(existing));
    await confirmScreenshots(db,existing.siteId,draft.lessons);
    const [ , released] = await db.batch([
      db.prepare(`UPDATE learning_course_versions SET state='retired' WHERE course_id=? AND state='published' AND ${access}
        AND EXISTS (SELECT 1 FROM learning_course_versions WHERE course_id=? AND revision=? AND state='draft' AND edit_version=?)`)
        .bind(courseId,...args,courseId,revision,expected),
      db.prepare(`UPDATE learning_course_versions SET state='published',published_by=?,published_at=?
        WHERE course_id=? AND revision=? AND state='draft' AND edit_version=? AND ${access} RETURNING revision`)
        .bind(identity.accountId,now,courseId,revision,expected,...args)
    ]);
    if (!released.results.length) conflict();
  } else fail(400, 'course_fields', 'Choose a course action.');
  return okay({ id:courseId,revision });
}

async function assess(db, identity, now, enrolmentId, attempt, data) {
  fields(data, ['decision','feedback']);
  if (!['passed','revise'].includes(data.decision)) fail(400, 'course_fields', 'Choose a practical assessment decision.');
  const feedback = text(data.feedback, 1400, 'feedback for the learner', data.decision === 'revise');
  const staff = gate(identity, now, 'c.site_id', 'staff');
  const matched = await db.prepare(`SELECT e.account_id FROM learning_enrolments e JOIN learning_courses c ON c.id=e.course_id
    WHERE e.id=? AND ${staff.sql}`).bind(enrolmentId,...staff.values).first();
  if (!matched) missing();
  if (matched.account_id === identity.accountId) fail(403, 'course_self_assessment', 'Another assessor needs to review your practical.');
  const saved = await db.prepare(`UPDATE learning_practicals SET status=?,feedback=?,reviewer_id=?,reviewed_at=?
    WHERE enrolment_id=? AND attempt=? AND status='submitted' AND EXISTS (
      SELECT 1 FROM learning_enrolments e JOIN learning_courses c ON c.id=e.course_id
      JOIN member_accounts a ON a.id=e.account_id WHERE e.id=? AND e.account_id<>? AND a.status='active' AND ${staff.sql}
    ) RETURNING attempt`).bind(data.decision,feedback,identity.accountId,now,enrolmentId,attempt,enrolmentId,identity.accountId,...staff.values).first();
  if (!saved) conflict();
  return okay({ status: data.decision });
}

async function uploadScreenshot(db, identity, now, siteId, screenshotId, request) {
  const staff = gate(identity,now,'s.id','staff');
  if (!(await db.prepare(`SELECT s.id FROM member_sites s WHERE s.id=? AND ${staff.sql}`).bind(siteId,...staff.values).first())) missing();
  const image = await readScreenshot(request);
  await db.prepare(`INSERT INTO learning_screenshots (id,site_id,mime,byte_count,digest,content_base64,created_by,created_at)
    SELECT ?,s.id,?,?,?,?,?,? FROM member_sites s WHERE s.id=? AND ${staff.sql}
    AND COALESCE((SELECT SUM(byte_count) FROM learning_screenshots WHERE site_id=s.id),0)+?<=?
    ON CONFLICT DO NOTHING`).bind(screenshotId,image.mime,image.size,image.digest,image.base64,identity.accountId,now,siteId,
      ...staff.values,image.size,SCREENSHOT_GROUP_LIMIT).run();
  const stored = await db.prepare(`SELECT a.id FROM learning_screenshots a JOIN member_sites s ON s.id=a.site_id
    WHERE s.id=? AND a.digest=? AND ${staff.sql}`).bind(siteId,image.digest,...staff.values).first();
  if (!stored) fail(409,'course_screenshot_storage','The screenshot could not be saved. Check your access or the group’s 32 MiB screenshot limit.');
  return okay({ id:stored.id });
}

async function courseScreenshot(db, identity, now, screenshotId, head) {
  const staff = gate(identity,now,'a.site_id','staff');
  const learner = gate(identity,now,'a.site_id','learn');
  const row = await db.prepare(`SELECT a.mime,a.byte_count${head ? '' : ',a.content_base64'} FROM learning_screenshots a
    WHERE a.id=? AND (${staff.sql} OR (${learner.sql} AND EXISTS (
      SELECT 1 FROM learning_enrolments e JOIN learning_courses c ON c.id=e.course_id
      JOIN learning_course_versions v ON v.course_id=e.course_id AND v.revision=e.revision
      JOIN json_each(v.lessons_json) lesson ON json_extract(lesson.value,'$.screenshot.id')=a.id
      WHERE e.account_id=? AND c.site_id=a.site_id AND v.state IN ('published','retired')
    )))`).bind(screenshotId,...staff.values,...learner.values,identity.accountId).first();
  if (!row) missing();
  const body = head ? null : Uint8Array.from(atob(row.content_base64), char => char.charCodeAt(0));
  return new Response(body,{headers:{ 'Content-Type':row.mime,'Content-Length':String(row.byte_count) }});
}

async function courseCaptions(db, identity, now, courseId, revision, number) {
  const staff = gate(identity,now,'c.site_id','staff');
  const learner = gate(identity,now,'c.site_id','learn');
  const row = await db.prepare(`SELECT json_extract(v.lessons_json,?) AS captions FROM learning_courses c
    JOIN learning_course_versions v ON v.course_id=c.id
    WHERE c.id=? AND v.revision=? AND (${staff.sql} OR (${learner.sql} AND v.state IN ('published','retired') AND EXISTS (
      SELECT 1 FROM learning_enrolments e WHERE e.account_id=? AND e.course_id=c.id AND e.revision=v.revision
    )))`).bind(`$[${number - 1}].video.captions`,courseId,revision,...staff.values,...learner.values,identity.accountId).first();
  if (!row?.captions) missing();
  return new Response(row.captions,{headers:{'Content-Type':'text/vtt; charset=utf-8'}});
}

export async function handleCourseRequest(request, db, { identity, now, readJSON }) {
  if (!identity || !UUID.test(identity.accountId ?? '') || identity.status !== 'active') {
    fail(401, 'account_required', 'Sign in to your ReadySETCO account.');
  }
  const url = new URL(request.url);
  const method = request.method;
  const [section,key,revisionPath,action,extra,overflow] = url.pathname.slice('/api/learning/'.length).split('/');
  if (overflow !== undefined) missing();
  if (section === 'courses' && action === 'captions' && method === 'GET' && extra) {
    return courseCaptions(db,identity,now,id(key),positive(Number(revisionPath)),positive(Number(extra)));
  }
  if (extra !== undefined) missing();
  if (section === 'course-media' && revisionPath === undefined && ['GET','HEAD'].includes(method)) {
    return courseScreenshot(db,identity,now,id(key,UUID),method === 'HEAD');
  }
  if (section === 'courses') {
    if (!key && method === 'GET') return catalogue(db, identity, now, page(url));
    const courseId = id(key), revision = positive(Number(revisionPath));
    const course = await lessonCourse(db, identity, now, courseId, revision);
    if (!action && method === 'GET') return okay({ course:learnerCourse(course) });
    if (method !== 'POST') missing();
    const data = await readJSON();
    if (action === 'enrol') { fields(data, []); await enrol(db,identity,now,course); }
    else if (action === 'progress') await completeLesson(db,identity,now,course,data);
    else if (action === 'practical') await submitPractical(db,identity,now,course,data);
    else missing();
    const current = await lessonCourse(db,identity,now,courseId,revision);
    if (!current.enrolmentId) conflict();
    return okay({ course:learnerCourse(current) });
  }
  if (section === 'course-staff') {
    if (key === 'groups' && revisionPath === undefined && method === 'GET') return staffGroups(db,identity,now,page(url));
    if (key === 'media' && method === 'PUT') return uploadScreenshot(db,identity,now,id(revisionPath),id(action,UUID),request);
    if (key === 'groups' && !action && method === 'GET') {
      const queue = url.searchParams.get('queue') ?? '1';
      return staffData(db,identity,now,id(revisionPath),page(url),positive(Number(queue)));
    }
    if (key === 'drafts' && revisionPath === undefined && method === 'POST') return startDraft(db,identity,now,await readJSON());
    if (key === 'drafts' && method === 'PATCH') return editDraft(db,identity,now,id(revisionPath),positive(Number(action)),await readJSON());
    if (key === 'practical' && method === 'PATCH') return assess(db,identity,now,id(revisionPath,UUID),positive(Number(action)),await readJSON());
  }
  missing();
}
