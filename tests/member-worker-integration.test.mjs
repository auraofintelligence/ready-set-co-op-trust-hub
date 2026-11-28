import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createWorker} from '../cloudflare/worker.mjs';
import {createSqliteD1} from '../scripts/sqlite-d1.mjs';
import {createTestPasskey} from './helpers/passkeys.mjs';
import * as opaque from '@serenity-kit/opaque';

const BASE='https://ready-setco.example',NOW='2026-11-27T09:00:00.000Z';
async function okay(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());const db=createSqliteD1(sqlite),sessions=[];
  const env={DB:{...db,withSession(mode){sessions.push(mode);return db;}},READY_AUTH_SECRET:randomBytes(32).toString('hex'),ASSETS:{fetch:async()=>new Response('<!doctype html><html><title>Private shell only</title></html>',{headers:{'Content-Type':'text/html'}})}};
  const worker=createWorker({now:()=>NOW});
  function client(){const jar=new Map();return {jar,async request(path,method='GET',data,origin=BASE){const request=new Request(BASE+path,{method,headers:{'CF-Connecting-IP':'192.0.2.50',Cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; '),...(origin?{Origin:origin}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});const response=await worker.fetch(request,env);const set=response.headers.get('Set-Cookie');if(set){const [key,value]=set.split(';')[0].split('=');if(set.includes('Max-Age=0'))jar.delete(key);else jar.set(key,value);}return response;}};}
  async function enrol(client,username,webmaster=false){const purpose=webmaster?'bootstrap':'register',key=createTestPasskey();const issued=await okay(await client.request(`/api/auth/${purpose}/options`,'POST',{username,displayName:`Fictional ${username}`,email:`${username}@example.test`,consentAccount:true,consentVersion:'2026-11-27',...(webmaster?{bootstrapKey:env.READY_AUTH_SECRET}:{})}));const result=await okay(await client.request(`/api/auth/${purpose}/verify`,'POST',{ceremonyId:issued.ceremonyId,response:key.registration(issued.options,{origin:BASE})}));return {...result,key};}
  return {sqlite,env,client,enrol,sessions};
}

test('the live Worker routes keep PLFC training private and honour group permissions with real sessions',async t=>{
  const f=fixture(t),owner=f.client(),learner=f.client(),visitor=f.client();
  await f.enrol(owner,'plfc.webmaster',true);
  const member=await f.enrol(learner,'plfc.learner');
  const base='/api/learning', group='plfc-training', course=base+'/courses/plfc-volunteer-onboarding/1';
  for(const path of [base+'/courses',base+'/course-staff/groups',course]) {
    const response=await visitor.request(path);
    assert.equal(response.status,401);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal((await learner.request(base+'/course-staff/groups/'+group)).status,404);
  const visible=await okay(await owner.request(base+'/course-staff/groups/'+group));
  assert.equal(visible.versions.length,2);
  await okay(await owner.request(base+'/course-staff/drafts/plfc-volunteer-onboarding/1','PATCH',{action:'publish',editVersion:1}));
  assert.equal((await learner.request(course)).status,404);
  await okay(await owner.request('/api/webmaster/sites/'+group+'/roles','PUT',{accountId:member.identity.accountId,role:'participant',expectedVersion:0}));
  const before=await okay(await learner.request(course));
  assert.equal(before.course.enrolmentId,null);
  assert.equal((await learner.request(course+'/enrol','POST',{},'https://foreign.example')).status,403);
  const enrolment=await okay(await learner.request(course+'/enrol','POST',{}));
  assert.ok(enrolment.course.enrolmentId);
  await okay(await owner.request('/api/webmaster/sites/'+group+'/roles','PUT',{accountId:member.identity.accountId,role:'none',expectedVersion:1}));
  assert.equal((await learner.request(course+'/progress','POST',{number:1})).status,404);
});

test('real Worker passkeys unlock own records and Webmaster tools while ordinary accounts stay scoped',async t=>{
  const f=fixture(t),owner=f.client(),person=f.client(),visitor=f.client();
  const shell=await visitor.request('/portal.html');assert.equal(shell.status,200);assert.equal(shell.headers.get('Cache-Control'),'no-store');assert.match(shell.headers.get('X-Robots-Tag'),/noindex/);
  const signedOut=await visitor.request('/manage.html');assert.equal(signedOut.status,303);assert.equal(signedOut.headers.get('Location'),'/portal.html');
  const admin=await f.enrol(owner,'webmaster.test',true),member=await f.enrol(person,'participant.test');
  assert.equal((await okay(await owner.request('/api/auth/session'))).identity.accountId,admin.identity.accountId);
  await okay(await owner.request('/api/admin/participants'));assert.equal((await person.request('/api/admin/participants')).status,403);
  assert.equal((await person.request('/api/admin/governance/workspaces')).status,403);
  const saved=await okay(await person.request('/api/member/profile','PATCH',{displayName:'Private participant',email:'participant@example.test',phone:'',organisation:'',locality:'Fictional',about:'Private profile',interests:['training'],consentContact:true,consentFutureHandover:false,expectedVersion:0}));assert.equal(saved.profile.accountId,member.identity.accountId);
  const app=await okay(await person.request('/api/member/applications','POST',{id:crypto.randomUUID(),siteId:'minjerribah',motivation:'Fictional participation',skills:'',availability:'',consentParticipation:true,consentVersion:'2026-11-27',consentFutureHandover:false}),201);
  const queue=await okay(await owner.request('/api/committee/sites/minjerribah/applications'));assert.equal(queue.applications[0].id,app.application.id);
  assert.equal((await visitor.request('/api/member/applications')).status,401);
  const mine=await person.request('/api/member/export');assert.equal(mine.headers.get('Cache-Control'),'no-store');assert.doesNotMatch(await mine.text(),/webmaster\.test|sessionHash|public_key|token_hash/);
  assert.ok(f.sessions.length>0);assert.ok(f.sessions.every(mode=>mode==='first-primary'));
});

test('native committee sessions see only linked governance and lose access immediately after revocation',async t=>{
  const f=fixture(t),owner=f.client(),committee=f.client();await f.enrol(owner,'site.owner',true);const committeeAccount=await f.enrol(committee,'local.committee');
  const make=async name=>(await okay(await owner.request('/api/admin/governance/workspaces','POST',{id:crypto.randomUUID(),name,locality:'Fictional',jurisdiction:'QLD',cooperativeType:'undecided',purpose:'Test only'}),201)).workspace;
  const own=await make('Visible local group'),other=await make('Other private group');
  await okay(await owner.request('/api/webmaster/sites/minjerribah','PATCH',{name:'Fictional local group',locality:'Test',summary:'Fictional only',governanceWorkspaceId:own.id,published:true,applicationsOpen:true,expectedVersion:1}));
  await okay(await owner.request('/api/webmaster/sites/minjerribah/roles','PUT',{accountId:committeeAccount.identity.accountId,role:'committee',expectedVersion:0}));
  const visible=await okay(await committee.request('/api/admin/governance/workspaces'));assert.deepEqual(visible.workspaces.map(w=>w.id),[own.id]);
  assert.equal((await committee.request('/manage.html')).status,200);
  for(const suffix of ['','/history','/export','/records'])assert.equal((await committee.request(`/api/admin/governance/workspaces/${other.id}${suffix}`)).status,404);
  for(const path of ['/api/admin/export','/api/admin/map/export','/api/webmaster/accounts','/api/webmaster/sites'])assert.equal((await committee.request(path)).status,403);
  const record=await okay(await committee.request(`/api/admin/governance/workspaces/${own.id}/records`,'POST',{id:crypto.randomUUID(),kind:'task',title:'Fictional assigned work',status:'draft',owner:'Committee',dueDate:'',sourceRef:'',evidenceRef:'',body:'Private local task',details:{}}),201);assert.equal(record.record.createdBy,`account:${committeeAccount.identity.accountId}`);
  const exported=await okay(await committee.request(`/api/admin/governance/workspaces/${own.id}/export`));assert.equal(exported.records.length,1);assert.doesNotMatch(JSON.stringify(exported),/Other private group/);
  await okay(await owner.request('/api/webmaster/sites/minjerribah/roles','PUT',{accountId:committeeAccount.identity.accountId,role:'none',expectedVersion:1}));
  assert.equal((await committee.request('/api/admin/governance/workspaces')).status,403);
  const account=(await okay(await owner.request('/api/webmaster/accounts?search=local.committee'))).accounts[0];
  await okay(await owner.request(`/api/webmaster/accounts/${account.accountId}`,'PATCH',{status:'disabled',expectedVersion:account.version}));
  assert.equal((await committee.request('/api/member/profile')).status,401);
  assert.equal((await okay(await committee.request('/api/auth/session'))).authenticated,false);
});

test('password accounts use the same private member and webmaster boundaries without requesting a passkey', async t => {
  await opaque.ready;
  const f=fixture(t), owner=f.client(), person=f.client(), visitor=f.client();
  const password='A fictional long phrase for testing only';
  async function enrolPassword(client, name, webmaster=false) {
    const purpose=webmaster?'bootstrap':'register';
    const start=opaque.client.startRegistration({password});
    const issued=await okay(await client.request(`/api/auth/password/${purpose}/options`,'POST',{
      username:name, displayName:`Fictional ${name}`, email:`${name}@example.test`,
      consentAccount:true, consentVersion:'2026-11-27', registrationRequest:start.registrationRequest,
      ...(webmaster?{bootstrapKey:f.env.READY_AUTH_SECRET}:{}),
    }));
    const complete=opaque.client.finishRegistration({password,clientRegistrationState:start.clientRegistrationState,
      registrationResponse:issued.registrationResponse,keyStretching:'memory-constrained'});
    return okay(await client.request(`/api/auth/password/${purpose}/verify`,'POST',{
      ceremonyId:issued.ceremonyId,registrationRecord:complete.registrationRecord,
    }));
  }
  const shell=await visitor.request('/portal.html');
  assert.match(shell.headers.get('Content-Security-Policy'),/'wasm-unsafe-eval'/);
  assert.doesNotMatch(shell.headers.get('Content-Security-Policy'),/(?:^|\s)'unsafe-eval'/);
  assert.match(shell.headers.get('Content-Security-Policy'),/worker-src 'self'/);
  const admin=await enrolPassword(owner,'password.owner',true);
  const member=await enrolPassword(person,'password.person');
  assert.equal(admin.identity.authentication,'password');
  assert.equal(member.identity.authentication,'password');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM member_passkeys').get().n,0);
  const session=await okay(await person.request('/api/auth/session'));
  assert.equal(session.identity.accountId,member.identity.accountId);
  assert.equal(session.identity.authentication,'password');
  assert.equal(session.identity.hasPassword,true);
  await okay(await owner.request('/api/admin/participants'));
  await okay(await owner.request('/api/webmaster/accounts'));
  assert.equal((await person.request('/api/admin/participants')).status,403);
  assert.equal((await person.request('/api/webmaster/accounts')).status,403);
  assert.equal((await visitor.request('/api/member/profile')).status,401);
  await okay(await person.request('/api/member/profile','PATCH',{
    displayName:'Password participant',email:'password.person@example.test',phone:'',organisation:'',
    locality:'Fictional',about:'Private test',interests:['training'],consentContact:true,
    consentFutureHandover:false,expectedVersion:0,
  }));
  const mine=await person.request('/api/member/export');
  assert.equal(mine.status,200);
  assert.doesNotMatch(await mine.text(),/password\.owner|registration_record|server_setup|token_hash/);
  await okay(await person.request('/api/auth/logout','POST',{}));
  assert.equal((await person.request('/api/member/profile')).status,401);
  assert.ok(f.sessions.every(mode=>mode==='first-primary'));
});
