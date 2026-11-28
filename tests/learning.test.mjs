import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleLearningRequest, LearningRequestError } from '../cloudflare/learning.mjs';
import { handleCourseRequest } from '../cloudflare/learning-courses.mjs';
import { handleMemberServiceRequest } from '../cloudflare/member-services.mjs';

const ORIGIN = 'https://ready-setco.example';
const NOW = '2026-11-28T10:00:00.000Z';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  t.after(() => sqlite.close());
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const db = createSqliteD1(sqlite);
  function account(name, webmaster = false) {
    const id = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO member_accounts (id,username,display_name,email,status,webmaster,created_at,updated_at,created_by,original_payload_json,last_operation_id)
      VALUES (?,?,?,?,'active',?,?,?,'test','{}',?)`).run(id, name, name, `${name}@example.test`, Number(webmaster), NOW, NOW, crypto.randomUUID());
    return { accountId: id, username: name, displayName: name, webmaster, status: 'active', authentication: 'password' };
  }
  const member = account('learner');
  const other = account('other');
  const admin = account('webmaster', true);
  async function call(path, method = 'GET', data = undefined, identity = member, now = NOW, media) {
    const request = new Request(`${ORIGIN}/api/learning${path}`, {
      method, ...(media ? { body:media.body,headers:{'Content-Type':media.type} } : {})
    });
    const handler = /^\/(courses|course-staff|course-media)(\/|$)/.test(path) ? handleCourseRequest : handleLearningRequest;
    try { return await handler(request, db, { identity, now, readJSON: async () => data }); }
    catch (error) {
      if (!(error instanceof LearningRequestError)) throw error;
      return Response.json({ code: error.code }, { status: error.status });
    }
  }
  async function ownExport(identity = member) {
    const request = new Request(`${ORIGIN}/api/member/export`);
    const response = await handleMemberServiceRequest(request, { DB: db }, { identity, now: NOW });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).learning;
  }
  return { sqlite, member, other, admin, call, ownExport };
}

async function saved(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

test('private work and learning profiles save separate pathways and are versioned and exportable', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/profile', 'GET', undefined, null)).status, 401);
  assert.equal((await saved(await f.call('/profile'))).profile.version, 0);
  const data = {
    expectedVersion: 0, pathways: ['working_holiday', 'volunteering', 'employer_joining'], availableFrom: '2026-12-01',
    availableUntil: '2027-01-01', english: 'instructions', skills: 'Fictional waterfront event setup', licences: 'Car'
  };
  await saved(await f.call('/profile', 'PATCH', data));
  assert.equal((await f.call('/profile', 'PATCH', data)).status, 409);
  assert.equal((await f.call('/profile', 'PATCH', { ...data, expectedVersion: 1, availableUntil: '2026-02-31' })).status, 400);
  assert.equal((await f.call('/profile', 'PATCH', { ...data, role: 'admin' })).status, 400);
  assert.deepEqual((await f.ownExport()).profile.pathways, data.pathways);
  assert.equal((await f.ownExport(f.other)).profile.skills, '');
});

test('private evidence uses consent, idempotent submission, reviewer checks, expiry and atomic history', async t => {
  const f = fixture(t);
  const data = { id: crypto.randomUUID(), category: 'work_rights', label: 'Fictional subclass 417', issuer: '', consent: true };
  assert.equal((await f.call('/evidence', 'POST', { ...data, consent: false })).status, 400);
  await saved(await f.call('/evidence', 'POST', data), 201);
  await saved(await f.call('/evidence', 'POST', data));
  assert.equal((await f.call('/evidence', 'POST', data, f.other)).status, 409);
  assert.equal((await f.call('/reviews')).status, 403);
  assert.equal((await f.call(`/evidence/${data.id}`, 'PATCH', { expectedVersion: 1, action: 'withdraw' }, f.other)).status, 404);
  const queued = await saved(await f.call('/reviews', 'GET', undefined, f.admin));
  assert.equal(queued.evidence[0].applicant, 'learner');
  assert.equal(Object.hasOwn(queued.evidence[0], 'email'), false);
  const review = `/reviews/${data.id}`;
  const decision = { expectedVersion: 1, status: 'verified', method: 'sighted', expiresOn: '2026-11-28', note: '' };
  assert.equal((await f.call(review, 'PATCH', decision, f.admin)).status, 400);
  assert.equal((await f.call(review, 'PATCH', { ...decision, method: 'vevo', expiresOn: '' }, f.admin)).status, 400);
  f.sqlite.exec("CREATE TRIGGER stop_audit BEFORE INSERT ON learning_evidence_history WHEN NEW.status='verified' BEGIN SELECT RAISE(ABORT,'test'); END");
  await assert.rejects(f.call(review, 'PATCH', { ...decision, method: 'vevo' }, f.admin));
  assert.equal((await saved(await f.call('/evidence'))).evidence[0].status, 'submitted');
  f.sqlite.exec('DROP TRIGGER stop_audit');
  assert.equal((await saved(await f.call(review, 'PATCH', { ...decision, method: 'vevo' }, f.admin))).evidence.status, 'verified');
  const nextBrisbaneDay = '2026-11-28T14:00:00.000Z';
  assert.equal((await saved(await f.call('/evidence', 'GET', undefined, f.member, nextBrisbaneDay))).evidence[0].status, 'expired');
  await saved(await f.call(`/evidence/${data.id}`, 'PATCH', { expectedVersion: 2, action: 'withdraw' }));
  assert.deepEqual((await f.ownExport()).history.map(row => row.status).sort(), ['submitted', 'verified', 'withdrawn']);
  assert.deepEqual((await f.ownExport(f.other)).evidence, []);
});

test('PLFC is the only draft provider and a completion requires a released version', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/drafts')).status, 403);
  const { drafts, categories } = await saved(await f.call('/drafts', 'GET', undefined, f.admin));
  assert.deepEqual(drafts.map(item => item.id), ['plfc-officer-handover', 'plfc-volunteer-onboarding']);
  assert.ok(drafts.every(item => item.provider === 'Point Lookout Fishing Club' && item.lessons.length >= 3));
  assert.ok(categories.some(item => item.id === 'grants'));
  const complete = () => f.sqlite.prepare('INSERT INTO learning_completions(account_id,course_id,revision,completed_at) VALUES(?,?,1,?)').run(f.member.accountId, 'plfc-officer-handover', NOW);
  assert.throws(complete, /released version/);
  f.sqlite.exec("UPDATE learning_courses SET site_id='minjerribah' WHERE id='plfc-officer-handover'; UPDATE learning_course_versions SET state='published' WHERE course_id='plfc-officer-handover'");
  complete();
  assert.throws(() => f.sqlite.exec("UPDATE learning_course_versions SET title='new' WHERE course_id='plfc-officer-handover'"), /versioned/);
  assert.equal((await saved(await f.call('/completions'))).completions[0].revision, 1);
  assert.deepEqual((await saved(await f.call('/completions', 'GET', undefined, f.other))).completions, []);
});

test('PLFC staff publish privately and learners progress through a revised practical to completion', async t => {
  const f = fixture(t);
  const site = 'plfc-training', course = 'plfc-officer-handover', target = `/courses/${course}/1`;
  function grant(account, role) {
    f.sqlite.prepare(`INSERT INTO member_site_roles (site_id,account_id,role,created_at,updated_at,updated_by,write_id)
      VALUES (?,?,?,?,?,?,?)`).run(site,account.accountId,role,NOW,NOW,'test',crypto.randomUUID());
  }
  grant(f.member,'participant');
  grant(f.admin,'committee');
  assert.equal((await f.call('/courses', 'GET', undefined, null)).status,401);
  assert.deepEqual((await saved(await f.call('/courses'))).courses, []);
  assert.equal((await f.call(target)).status,404);
  assert.equal((await f.call(`/course-staff/groups/${site}`)).status,404);
  const staff = await saved(await f.call(`/course-staff/groups/${site}`,'GET',undefined,f.admin));
  assert.equal(staff.versions.length,2);
  assert.ok(staff.versions.every(v => v.state === 'draft' && v.practical));
  const versionPath = `/course-staff/drafts/${course}/1`;
  await saved(await f.call(versionPath, 'PATCH', { action:'publish',editVersion:1 }, f.admin));
  assert.equal((await saved(await f.call('/courses'))).courses.length,1);
  assert.deepEqual((await saved(await f.call('/courses','GET',undefined,f.other))).courses,[]);
  assert.equal((await f.call(target,'GET',undefined,f.other)).status,404);
  const enrolled = (await saved(await f.call(target + '/enrol','POST',{}))).course;
  assert.equal((await saved(await f.call(target + '/enrol','POST',{}))).course.enrolmentId,enrolled.enrolmentId);
  const practical = { response:'Fictional meeting, three actions and a follow-up date.',previousAttempt:0 };
  assert.equal((await f.call(target + '/practical','POST',practical)).status,409);
  for (const number of enrolled.lessons.map((_,i) => i+1)) await saved(await f.call(target + '/progress','POST',{number}));
  assert.equal((await saved(await f.call(target + '/progress','POST',{number:1}))).course.progress.length,enrolled.lessons.length);
  await saved(await f.call(target + '/practical','POST',practical));
  assert.equal((await saved(await f.call(target + '/practical','POST',practical))).course.assessment.attempt,1);
  assert.equal((await saved(await f.call(`/course-staff/groups/${site}`,'GET',undefined,f.admin))).queue[0].response,practical.response);
  const review = `/course-staff/practical/${enrolled.enrolmentId}`;
  assert.equal((await f.call(review + '/1','PATCH',{decision:'passed',feedback:''},f.other)).status,404);
  f.sqlite.prepare('UPDATE member_site_roles SET role=? WHERE account_id=?').run('committee',f.member.accountId);
  assert.equal((await f.call(review + '/1','PATCH',{decision:'passed',feedback:''})).status,403);
  await saved(await f.call(review + '/1','PATCH',{decision:'revise',feedback:'Give each open action a named owner.'},f.admin));
  assert.match((await saved(await f.call(target))).course.assessment.feedback,/named owner/);
  await saved(await f.call(target + '/practical','POST',{response:'Fictional actions A, B and C have named owners.',previousAttempt:1}));
  await saved(await f.call(review + '/2','PATCH',{decision:'passed',feedback:'Ready for the first week.'},f.admin));
  assert.equal((await f.call(review + '/2','PATCH',{decision:'passed',feedback:''},f.admin)).status,409);
  assert.equal((await saved(await f.call('/completions'))).completions[0].courseId,course);
  const exported = await f.ownExport();
  assert.deepEqual(exported.practicals.map(p => p.status),['revise','passed']);
  assert.equal(exported.enrolments[0].progress.length,enrolled.lessons.length);

  await saved(await f.call(versionPath,'PATCH',{action:'revise'},f.admin));
  const secondPath = `/course-staff/drafts/${course}/2`;
  await saved(await f.call(secondPath,'PATCH',{action:'publish',editVersion:1},f.admin));
  assert.deepEqual(new Set((await saved(await f.call('/courses'))).courses.map(c=>c.revision)),new Set([1,2]));
  assert.equal((await saved(await f.call(target))).course.assessment.status,'passed');
  f.sqlite.prepare('UPDATE member_site_roles SET role=? WHERE account_id=?').run('none',f.member.accountId);
  assert.equal((await f.call(target)).status,404);
  assert.equal((await saved(await f.call('/completions'))).completions[0].revision,1);
});

test('course builder saves draft content and rejects stale changes and unrelated staff', async t => {
  const f = fixture(t);
  const siteId = 'plfc-training';
  const data = { id:crypto.randomUUID(),siteId,category:'volunteers',title:'Fictional role course',
    description:'Practice for a fictional event.', lessons:[{title:'Brief the team',body:'Confirm the meeting point.'}],
    practical:'Write a fictional event briefing.' };
  const route = '/course-staff/drafts';
  assert.equal((await f.call(route,'POST',data,f.other)).status,404);
  await saved(await f.call(route,'POST',data,f.admin));
  await saved(await f.call(route,'POST',data,f.admin));
  const changes = { action:'save',editVersion:1,title:data.title,description:'Updated overview',lessons:data.lessons,practical:data.practical };
  await saved(await f.call(`${route}/${data.id}/1`,'PATCH',changes,f.admin));
  assert.equal((await f.call(`${route}/${data.id}/1`,'PATCH',changes,f.admin)).status,409);
  const group = await saved(await f.call(`/course-staff/groups/${siteId}`,'GET',undefined,f.admin));
  assert.equal(group.versions.find(course => course.id === data.id).description,'Updated overview');
});

test('lesson media stays private and practice is checked before progress is written', async t => {
  const f = fixture(t);
  const siteId = 'plfc-training', courseId = crypto.randomUUID(), screenshotId = crypto.randomUUID();
  const picture = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUz8AAAAASUVORK5CYII=','base64'));
  const upload = `/course-staff/media/${siteId}/${screenshotId}`;
  const screenshot = `/course-media/${screenshotId}`;
  assert.equal((await f.call(upload,'PUT',undefined,f.other,NOW,{ body:picture,type:'image/png' })).status,404);
  assert.equal((await f.call(upload,'PUT',undefined,f.admin,NOW,{ body:new TextEncoder().encode('<svg/>'),type:'image/png' })).status,415);
  assert.equal((await saved(await f.call(upload,'PUT',undefined,f.admin,NOW,{ body:picture,type:'image/png' }))).id,screenshotId);
  assert.equal((await saved(await f.call(`/course-staff/media/${siteId}/${crypto.randomUUID()}`,'PUT',undefined,f.admin,NOW,{ body:picture,type:'image/png' }))).id,screenshotId);
  assert.equal((await f.call(screenshot,'GET',undefined,null)).status,401);
  assert.equal((await f.call(screenshot)).status,404);
  const staffShot = await f.call(screenshot,'GET',undefined,f.admin);
  assert.equal(staffShot.headers.get('Content-Type'),'image/png');
  assert.deepEqual(new Uint8Array(await staffShot.arrayBuffer()),picture);

  const question = {id:'q-01',type:'single_choice',mode:'practice',prompt:'What makes an action usable?',
    choices:[{id:'a',text:'An owner and a date'},{id:'b',text:'A colour'}],correct_choice_id:'a',
    explanation:'A named owner can follow up.',source_refs:['CAPTURE:S02']};
  const captions = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nShow an owner and a date.';
  const draft = {id:courseId,siteId,category:'committee',title:'Fictional visual lesson',description:'Learner steps',
    practical:'Write a handover.',lessons:[{title:'Mark an action',body:'Use a fictional item.',
      captureNotes:'Private capture planning',screenshot:{id:screenshotId,alt:'Fictional action list',caption:'Check the owner field.'},
      video:{url:'https://media.example.test/example.mp4',transcript:'Show an owner and a date.',captions},questions:[question]}]};
  const staffDraft = '/course-staff/drafts';
  const invalid = structuredClone(draft);
  invalid.lessons[0].video.url = 'https://example.test/watch';
  assert.equal((await f.call(staffDraft,'POST',invalid,f.admin)).status,400);
  invalid.lessons[0].video.url = draft.lessons[0].video.url;
  invalid.lessons[0].screenshot.id = crypto.randomUUID();
  assert.equal((await f.call(staffDraft,'POST',invalid,f.admin)).status,400);
  await saved(await f.call(staffDraft,'POST',draft,f.admin));
  await saved(await f.call(`${staffDraft}/${courseId}/1`,'PATCH',{action:'publish',editVersion:1},f.admin));
  f.sqlite.prepare(`INSERT INTO member_site_roles (site_id,account_id,role,created_at,updated_at,updated_by,write_id)
    VALUES (?,?,?,?,?,?,?)`).run(siteId,f.member.accountId,'participant',NOW,NOW,'test',crypto.randomUUID());
  const path = `/courses/${courseId}/1`;
  const captionPath = path + '/captions/1';
  const outline = (await saved(await f.call(path))).course;
  assert.deepEqual(outline.lessons,[{title:'Mark an action'}]);
  assert.equal((await f.call(captionPath)).status,404);
  assert.equal((await f.call(screenshot)).status,404);
  const enrolled = (await saved(await f.call(path+'/enrol','POST',{}))).course;
  assert.deepEqual(enrolled.lessons[0].questions[0].choices,question.choices);
  assert.equal(enrolled.lessons[0].questions[0].correct_choice_id,undefined);
  assert.equal(enrolled.lessons[0].captureNotes,undefined);
  assert.equal(enrolled.lessons[0].video.captions,undefined);
  assert.equal(enrolled.lessons[0].video.captionsUrl,'/api/learning'+captionPath);
  assert.equal(await (await f.call(captionPath)).text(),captions);
  assert.equal((await f.call(screenshot)).status,200);
  assert.equal((await f.call(screenshot,'GET',undefined,f.other)).status,404);
  assert.equal((await f.call(path+'/progress','POST',{number:1})).status,400);
  assert.equal((await f.call(path+'/progress','POST',{number:1,answers:{'q-01':'b'}})).status,422);
  assert.deepEqual((await saved(await f.call(path))).course.progress,[]);
  const completed = await saved(await f.call(path+'/progress','POST',{number:1,answers:{'q-01':'a'}}));
  assert.equal(completed.course.lessons[0].questions[0].explanation,question.explanation);
  assert.deepEqual(completed.course.progress,[1]);
  f.sqlite.prepare('UPDATE member_site_roles SET role=? WHERE account_id=?').run('none',f.member.accountId);
  assert.equal((await f.call(screenshot)).status,404);
  assert.equal((await f.call(captionPath)).status,404);
});
