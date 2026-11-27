import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createSqliteD1} from '../scripts/sqlite-d1.mjs';
import {handleMemberServiceRequest,memberGovernanceScope} from '../cloudflare/member-services.mjs';
import {handleGovernanceRequest} from '../cloudflare/governance.mjs';

const ORIGIN='https://ready-setco.example',NOW='2026-11-27T08:00:00.000Z';
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());const env={DB:createSqliteD1(sqlite)};
  const add=(username,webmaster=false)=>{const accountId=crypto.randomUUID();sqlite.prepare(`INSERT INTO member_accounts(id,username,display_name,email,status,webmaster,created_at,updated_at,created_by,original_payload_json,last_operation_id) VALUES(?,?,?,?,'active',?,?,?,'test','{}',?)`).run(accountId,username,username,`${username}@example.test`,Number(webmaster),NOW,NOW,crypto.randomUUID());return {accountId,username,displayName:username,email:`${username}@example.test`,webmaster,status:'active',authentication:'passkey'};};
  const owner=add('owner',true),alice=add('alice'),bob=add('bob'),committee=add('committee');
  async function call(path,method='GET',data,identity=alice,{origin=ORIGIN}={}){const request=new Request(`${ORIGIN}${path}`,{method,headers:{...(origin?{Origin:origin}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});return handleMemberServiceRequest(request,env,{identity,now:NOW,readJSON:async()=>data});}
  async function gov(path,method='GET',data,identity=owner,scope=null){return handleGovernanceRequest(new Request(`${ORIGIN}/api/admin/governance/workspaces${path}`,{method}),env,{actor:`account:${identity.accountId}`,now:NOW,workspaceScope:scope,readJSON:async()=>data});}
  return {sqlite,env,owner,alice,bob,committee,add,call,gov};
}
const profile=(extra={})=>({displayName:'Test person',email:'person@example.test',phone:'',organisation:'Fictional group',locality:'Fictional locality',interests:['founding'],about:'Test data only',consentContact:true,consentFutureHandover:false,expectedVersion:0,...extra});
const application=(extra={})=>({id:crypto.randomUUID(),siteId:'minjerribah',motivation:'Help with the fictional test programme.',skills:'A test skill',availability:'A fictional time',consentParticipation:true,consentFutureHandover:false,consentVersion:'2026-11-27',...extra});
const review=(record,extra={})=>({expectedVersion:record.version,status:'accepted_participant',reviewNote:'Participation accepted for this test.',decisionRef:'',evidenceRef:'',admissionDate:'',...extra});
async function saved(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
async function apply(f,identity=f.alice){await saved(await f.call('/api/member/profile','PATCH',profile({displayName:identity.username,email:identity.email}),identity));return (await saved(await f.call('/api/member/applications','POST',application(),identity),201)).application;}
async function role(f,identity,siteId='minjerribah',value='committee'){return saved(await f.call(`/api/webmaster/sites/${siteId}/roles`,'PUT',{accountId:identity.accountId,role:value,expectedVersion:0},f.owner));}
async function makeSite(f,id,extra={}){return (await saved(await f.call('/api/webmaster/sites','POST',{id,name:`Fictional ${id}`,locality:'Test',summary:'Test group only',published:true,applicationsOpen:true,governanceWorkspaceId:'',...extra},f.owner),201)).site;}

test('public listing contains only service information and personal routes require sign-in and same origin',async t=>{
  const f=fixture(t);await makeSite(f,'private-group',{published:false});
  const publicData=await saved(await f.call('/api/member/sites','GET',undefined,null));assert.deepEqual(publicData.sites.map(s=>s.id),['minjerribah']);assert.doesNotMatch(JSON.stringify(publicData),/@example\.test|accountId/);
  for(const path of ['/api/member/profile','/api/member/applications','/api/member/export','/api/committee/sites','/api/webmaster/sites'])assert.equal((await f.call(path,'GET',undefined,null)).status,401);
  for(const origin of [null,'https://foreign.example'])assert.equal((await f.call('/api/member/profile','PATCH',profile(),f.alice,{origin})).status,403);
  assert.equal((await f.call('/api/member/profile','PATCH',profile({webmaster:true}))).status,400);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM member_profiles').get().n,0);
});
test('profiles use versions, preserve consent history, roll back on audit failure and export only the owner',async t=>{
  const f=fixture(t);await saved(await f.call('/api/member/profile','PATCH',profile()));
  assert.equal((await f.call('/api/member/profile','PATCH',profile())).status,409);
  await saved(await f.call('/api/member/profile','PATCH',profile({expectedVersion:1,consentFutureHandover:true})));
  await saved(await f.call('/api/member/profile','PATCH',profile({displayName:'Bobs private record',email:'secretbob@example.test'}),f.bob));
  f.sqlite.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON member_service_history WHEN NEW.entity_type='profile' AND NEW.version=3 BEGIN SELECT RAISE(ABORT,'test failure');END");
  await assert.rejects(f.call('/api/member/profile','PATCH',profile({expectedVersion:2,displayName:'Must roll back'})));
  const current=(await saved(await f.call('/api/member/profile'))).profile;assert.equal(current.displayName,'Test person');assert.equal(current.version,2);
  const exported=await saved(await f.call('/api/member/export'));assert.equal(exported.history.length,2);assert.equal(exported.profile.consentFutureHandover,true);assert.doesNotMatch(JSON.stringify(exported),/secretbob|Bobs private/);
  assert.throws(()=>f.sqlite.exec('DELETE FROM member_service_history'));
});
test('applications require explicit consent, retain original details, retry safely and hide other people history',async t=>{
  const f=fixture(t),data=application();assert.equal((await f.call('/api/member/applications','POST',data)).status,400);
  await saved(await f.call('/api/member/profile','PATCH',profile()));
  assert.equal((await f.call('/api/member/applications','POST',{...data,consentParticipation:false})).status,400);
  const first=(await saved(await f.call('/api/member/applications','POST',data),201)).application;
  assert.equal(first.status,'submitted');assert.equal(first.consentFutureHandover,false);assert.equal(first.originalOperator,'Luke Hayes trading as Strange But True');
  await saved(await f.call('/api/member/applications','POST',data));assert.equal((await f.call('/api/member/applications','POST',{...data,motivation:'A different payload'})).status,409);
  assert.equal((await f.call('/api/member/applications','POST',data,f.bob)).status,409);
  assert.equal((await f.call(`/api/member/applications/${first.id}/history`,'GET',undefined,f.bob)).status,404);
  assert.equal((await f.call(`/api/member/applications/${first.id}`,'PATCH',{expectedVersion:1,action:'withdraw'},f.bob)).status,404);
  const history=await saved(await f.call(`/api/member/applications/${first.id}/history`));assert.equal(history.total,1);
  assert.throws(()=>f.sqlite.prepare('UPDATE member_applications SET account_id=? WHERE id=?').run(f.bob.accountId,first.id));
});
test('a consent change between validation and durable submission prevents the application',async t=>{
  const f=fixture(t);await saved(await f.call('/api/member/profile','PATCH',profile()));
  const batch=f.env.DB.batch;f.env.DB.batch=async statements=>{f.sqlite.prepare("UPDATE member_profiles SET data_json=json_set(data_json,'$.consentContact',json('false')),version=version+1 WHERE account_id=?").run(f.alice.accountId);f.env.DB.batch=batch;return batch(statements);};
  assert.equal((await f.call('/api/member/applications','POST',application())).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM member_applications').get().n,0);
});
test('committee reviews are local, versioned and acceptance grants participation without legal admission',async t=>{
  const f=fixture(t),record=await apply(f);await role(f,f.committee);await makeSite(f,'elsewhere');
  assert.equal((await f.call('/api/committee/sites/minjerribah/applications','GET',undefined,f.bob)).status,403);
  assert.equal((await f.call('/api/committee/sites/elsewhere/applications','GET',undefined,f.committee)).status,403);
  const response=await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',review(record),f.committee);const accepted=(await saved(response)).application;assert.equal(accepted.version,2);
  const groups=(await saved(await f.call('/api/member/groups'))).groups;assert.equal(groups.length,1);assert.equal(groups[0].role,'participant');assert.equal(groups[0].legalMembershipStatus,'not_admitted');
  assert.equal((await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',review(record,{status:'declined'}),f.committee)).status,409);
  assert.equal((await f.call(`/api/webmaster/sites/minjerribah/roles`,'PUT',{accountId:f.bob.accountId,role:'committee',expectedVersion:0},f.committee)).status,403);
  await saved(await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',review(accepted,{status:'declined',reviewNote:'Fictional review changed'}),f.committee));
  assert.equal((await saved(await f.call('/api/member/groups'))).groups.length,0);
  assert.equal((await f.call('/api/member/groups/minjerribah/bulletins')).status,403);
});
test('withdrawing participation removes group access and retains application history',async t=>{
  const f=fixture(t),record=await apply(f);await saved(await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',review(record),f.owner));
  await saved(await f.call(`/api/member/applications/${record.id}`,'PATCH',{expectedVersion:2,action:'withdraw'}));
  assert.equal((await f.call('/api/member/groups/minjerribah/bulletins')).status,403);
  const history=await saved(await f.call(`/api/member/applications/${record.id}/history`));assert.equal(history.total,3);assert.equal(history.revisions[0].snapshot.status,'withdrawn');
});
test('admission requires a registered linked entity and dated decision evidence',async t=>{
  const f=fixture(t),record=await apply(f);const decision=review(record,{status:'admitted',decisionRef:'Fictional resolution',evidenceRef:'Fictional signed minute',admissionDate:'2026-11-27'});
  assert.equal((await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',decision,f.owner)).status,400);
  const workspace=(await saved(await f.gov('','POST',{id:crypto.randomUUID(),name:'Fictional registered cooperative',locality:'Fictional',jurisdiction:'QLD',cooperativeType:'undecided',purpose:'Test only'}),201)).workspace;
  await saved(await f.gov(`/${workspace.id}`,'PATCH',{name:workspace.name,locality:workspace.locality,jurisdiction:workspace.jurisdiction,cooperativeType:workspace.cooperativeType,purpose:workspace.purpose,stage:'registered',registrationRef:'Fictional certificate',registrationDate:'2026-11-27',expectedVersion:1}));
  await saved(await f.call('/api/webmaster/sites/minjerribah','PATCH',{name:'Fictional pilot test',locality:'Fictional',summary:'Test',published:true,applicationsOpen:true,governanceWorkspaceId:workspace.id,expectedVersion:1},f.owner));
  assert.equal((await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',{...decision,admissionDate:'2026-11-26'},f.owner)).status,400);
  const admitted=(await saved(await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',decision,f.owner))).application;assert.equal(admitted.status,'admitted');
  assert.equal((await f.call(`/api/member/applications/${record.id}`,'PATCH',{expectedVersion:2,action:'withdraw'})).status,409);
});
test('group notices persist privately, reject unsafe links, preserve history and exclude archived posts',async t=>{
  const f=fixture(t);await role(f,f.committee);await role(f,f.alice,'minjerribah','participant');await makeSite(f,'elsewhere');
  const post={id:crypto.randomUUID(),title:'Private fictional notice',body:'A private group update',link:'https://example.test/document',label:'Document'};
  assert.equal((await f.call('/api/member/groups/minjerribah/bulletins','POST',post)).status,403);
  assert.equal((await f.call('/api/member/groups/minjerribah/bulletins','POST',{...post,link:'javascript:alert(1)'},f.committee)).status,400);
  await saved(await f.call('/api/member/groups/minjerribah/bulletins','POST',post,f.committee),201);await saved(await f.call('/api/member/groups/minjerribah/bulletins','POST',post,f.committee));
  assert.equal((await f.call('/api/member/groups/minjerribah/bulletins','GET',undefined,f.bob)).status,403);
  const bulletin=(await saved(await f.call('/api/member/groups/minjerribah/bulletins'))).bulletins[0];assert.equal(bulletin.title,post.title);
  await saved(await f.call(`/api/member/groups/minjerribah/bulletins/${post.id}`,'PATCH',{title:post.title,body:post.body,link:post.link,label:post.label,archived:true,expectedVersion:1},f.committee));
  assert.equal((await saved(await f.call('/api/member/groups/minjerribah/bulletins'))).bulletins.length,0);
  assert.equal((await saved(await f.call('/api/member/groups/minjerribah/bulletins','GET',undefined,f.committee))).bulletins[0].archived,true);
});
test('permission revocation immediately before commit prevents a committee mutation and its audit',async t=>{
  const f=fixture(t),record=await apply(f);await role(f,f.committee);const batch=f.env.DB.batch;
  f.env.DB.batch=async statements=>{f.sqlite.prepare("UPDATE member_site_roles SET role='none',version=version+1 WHERE account_id=?").run(f.committee.accountId);f.env.DB.batch=batch;return batch(statements);};
  assert.equal((await f.call(`/api/committee/sites/minjerribah/applications/${record.id}`,'PATCH',review(record),f.committee)).status,409);
  assert.equal((await f.sqlite.prepare('SELECT status FROM member_applications WHERE id=?').get(record.id)).status,'submitted');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM member_service_history WHERE entity_type='application'").get().n,1);
});
test('group pagination and governance scoping handle more than 100 local groups with bounded parameters',async t=>{
  const f=fixture(t);const workspaceIds=[];
  for(let n=0;n<105;n++){
    const id=crypto.randomUUID(),siteId=`test-${n}`;workspaceIds.push(id);
    f.sqlite.prepare("INSERT INTO governance_workspaces VALUES(?,?, 'QLD','exploring','{}','{}',1,?,'test',?,'test',?)").run(id,`Test ${n}`,NOW,NOW,id);
    f.sqlite.prepare("INSERT INTO member_sites VALUES(?,?,?,'',?,1,1,1,?,?,?,?)").run(siteId,`Test ${String(n).padStart(3,'0')}`,'Test',id,NOW,NOW,'test',id);
    f.sqlite.prepare("INSERT INTO member_site_roles VALUES(?,?,'committee',1,?,?,?,?)").run(siteId,f.committee.accountId,NOW,NOW,'test',id);
  }
  const first=await saved(await f.call('/api/member/groups?pageSize=100','GET',undefined,f.committee)),second=await saved(await f.call('/api/member/groups?page=2&pageSize=100','GET',undefined,f.committee));assert.equal(first.total,105);assert.equal(first.groups.length,100);assert.equal(second.groups.length,5);
  const scope=await memberGovernanceScope(f.env.DB,f.committee);assert.equal(scope.length,105);
  const list=await saved(await f.gov('?pageSize=100','GET',undefined,f.committee,scope));assert.equal(list.total,105);
  assert.equal((await f.gov('/'+crypto.randomUUID(),'GET',undefined,f.committee,scope)).status,404);
  assert.equal((await f.gov('','POST',{id:crypto.randomUUID()},f.committee,scope)).status,403);
  const noAccess=await saved(await f.gov('','GET',undefined,f.bob,[]));assert.equal(noAccess.total,0);
});
