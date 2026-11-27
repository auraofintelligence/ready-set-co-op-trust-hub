const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CONSENT_VERSION = '2026-11-27';
const PROFILE_FIELDS = ['displayName','email','phone','organisation','locality','interests','about','consentContact','consentFutureHandover'];
const INTERESTS = ['founding','events','training','employment','working_holiday','tourism','grants','resources','media','support','mapping'];
const STATUSES = ['submitted','in_review','more_info','accepted_participant','declined','withdrawn','admitted'];
const rows = value => value?.results ?? [];
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8', ...headers}});
class ServiceError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } }
const fail = (status, code, message) => { throw new ServiceError(status, code, message); };
const actorFor = identity => identity.authentication === 'access' ? `access:${identity.email}` : identity.authentication === 'local' ? 'local_reviewer' : `account:${identity.accountId}`;
const externalOperator = identity => identity?.webmaster && ['access','local'].includes(identity.authentication);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function only(data, fields) { if (!object(data) || Object.keys(data).some(key => !fields.includes(key))) fail(400,'invalid_fields','Some fields are not supported. Refresh the form and try again.'); }
function text(data,key,max,required=false) {
  const raw = data[key] ?? '';
  if (typeof raw !== 'string' || raw.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) fail(400,'invalid_fields',`Check ${key}.`);
  const value=raw.trim(); if (required && !value) fail(400,'invalid_fields',`Enter ${key}.`); return value;
}
function bool(data,key) { if (typeof data[key] !== 'boolean') fail(400,'invalid_fields',`Choose ${key}.`); return data[key]; }
function version(data,min=1) { if (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion<min) fail(400,'version_required','Refresh this record before saving.'); return data.expectedVersion; }
function uuid(value) { if(typeof value!=='string'||!UUID.test(value)) fail(400,'invalid_reference','Check the record reference.'); return value.toLowerCase(); }
function slug(value) { if(typeof value!=='string'||!SLUG.test(value)) fail(400,'invalid_reference','Use a group ID containing lowercase letters, numbers and hyphens.'); return value; }
function date(data,key) {
  const value=text(data,key,10); if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)) fail(400,'invalid_fields',`Check ${key}.`); return value;
}
async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join(''); }
function page(url) {
  for(const key of url.searchParams.keys()) if(!['page','pageSize'].includes(key)) fail(400,'invalid_query','Unsupported list filter.');
  const number=(key,fallback,max)=>{const value=url.searchParams.get(key); if(value===null)return fallback;if(!/^[1-9]\d*$/.test(value)||Number(value)>max)fail(400,'invalid_query',`Check ${key}.`);return Number(value);};
  const current=number('page',1,1000000),size=number('pageSize',50,100);return {page:current,pageSize:size,offset:(current-1)*size};
}
function sameOrigin(request) { const url=new URL(request.url); if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)||(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin))fail(403,'origin_not_allowed','Use the member portal on this site.'); }
function requireAccount(identity) { if(!identity)fail(401,'sign_in_required','Sign in to your account first.');if(externalOperator(identity))fail(403,'personal_account_required','Use a personal member account for this action.'); }
function requireWebmaster(identity) { if(!identity?.webmaster)fail(403,'forbidden','This action requires Webmaster access.'); }
function siteFrom(row,role=null) { return {id:row.id,name:row.name,locality:row.locality,summary:row.summary,governanceWorkspaceId:row.governance_workspace_id??'',published:!!row.published,applicationsOpen:!!row.applications_open,version:row.version,role}; }
function profileFrom(row,identity) { return row ? {...JSON.parse(row.data_json),accountId:row.account_id,version:row.version,updatedAt:row.updated_at} : {accountId:identity.accountId,displayName:identity.displayName??'',email:identity.email??'',phone:'',organisation:'',locality:'',interests:[],about:'',consentContact:false,consentFutureHandover:false,version:0,updatedAt:null}; }
function applicationFrom(row) { return {...JSON.parse(row.data_json),id:row.id,accountId:row.account_id,siteId:row.site_id,siteName:row.site_name??'',status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}; }
function bulletinFrom(row) { return {...JSON.parse(row.data_json),id:row.id,siteId:row.site_id,archived:!!row.archived,version:row.version,publishedAt:row.created_at,updatedAt:row.updated_at}; }
function revisionFrom(row) { return {id:row.id,entityType:row.entity_type,entityId:row.entity_id,version:row.version,event:row.event,snapshot:JSON.parse(row.snapshot_json),actor:row.actor,createdAt:row.created_at}; }
function guard(identity,siteId,mode='committee') {
  if(externalOperator(identity))return {sql:'1',values:[]};
  const local = mode==='webmaster' ? '' : ` OR EXISTS (SELECT 1 FROM member_site_roles r WHERE r.account_id=a.id AND r.site_id=? AND ${mode==='committee' ? "r.role='committee'" : "r.role IN ('participant','committee')"})`;
  return {sql:`EXISTS (SELECT 1 FROM member_accounts a WHERE a.id=? AND a.status='active' AND (a.webmaster=1${local}))`,values:[identity?.accountId??'',...(mode==='webmaster'?[]:[siteId])]};
}
async function groupRole(db,identity,siteId,committee=false) {
  if(!identity)fail(401,'sign_in_required','Sign in to your account first.');
  const condition=guard(identity,siteId,committee?'committee':'participant');
  if(!await db.prepare(`SELECT 1 AS allowed WHERE ${condition.sql}`).bind(...condition.values).first())fail(403,'forbidden',committee?'This action requires committee access for this group.':'You do not have access to this group.');
  if(identity.webmaster)return 'webmaster';
  return (await db.prepare('SELECT role FROM member_site_roles WHERE site_id=? AND account_id=?').bind(siteId,identity.accountId).first())?.role;
}
function audit(db,{type,id,accountId=null,siteId=null,version:revision,event,snapshot,actor,now,writeId,table,key='id',keyValue=id}) {
  return db.prepare(`INSERT INTO member_service_history (id,entity_type,entity_id,account_id,site_id,version,event,snapshot_json,actor,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${key}=? AND write_id=?)`).bind(crypto.randomUUID(),type,id,accountId,siteId,revision,event,JSON.stringify(snapshot),actor,now,keyValue,writeId);
}
function changed(result) { if(!rows(result[0]).length)fail(409,'record_changed','This record or your access has changed. Refresh before trying again.'); }
async function getSite(db,id) { const row=await db.prepare('SELECT * FROM member_sites WHERE id=?').bind(id).first();if(!row)fail(404,'not_found','The local group was not found.');return row; }
async function getApplication(db,id) { const row=await db.prepare('SELECT a.*,s.name AS site_name FROM member_applications a JOIN member_sites s ON s.id=a.site_id WHERE a.id=?').bind(id).first();if(!row)fail(404,'not_found','The application was not found.');return row; }

export async function memberGovernanceScope(db,identity) {
  if(identity?.webmaster)return null;
  if(!identity)return [];
  return rows(await db.prepare(`SELECT s.governance_workspace_id AS id FROM member_sites s JOIN member_site_roles r ON r.site_id=s.id JOIN member_accounts a ON a.id=r.account_id
    WHERE r.account_id=? AND r.role='committee' AND a.status='active' AND s.governance_workspace_id IS NOT NULL`).bind(identity.accountId).all()).map(row=>row.id);
}

async function saveProfile(db,identity,data,now) {
  only(data,[...PROFILE_FIELDS,'expectedVersion']);const expected=version(data,0);
  const profile={displayName:text(data,'displayName',120,true),email:text(data,'email',254,true),phone:text(data,'phone',80),organisation:text(data,'organisation',160),locality:text(data,'locality',160),interests:data.interests,about:text(data,'about',2000),consentContact:bool(data,'consentContact'),consentFutureHandover:bool(data,'consentFutureHandover')};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))fail(400,'invalid_fields','Enter a contact email address.');
  if(!Array.isArray(profile.interests)||profile.interests.length>INTERESTS.length||profile.interests.some(item=>!INTERESTS.includes(item))||new Set(profile.interests).size!==profile.interests.length)fail(400,'invalid_fields','Choose the listed participation interests.');
  profile.interests=[...profile.interests].sort();const writeId=crypto.randomUUID(),actor=actorFor(identity),next=expected+1;
  const query=expected===0 ? db.prepare(`INSERT INTO member_profiles(account_id,data_json,version,updated_at,write_id) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM member_accounts WHERE id=? AND status='active') ON CONFLICT(account_id) DO NOTHING RETURNING *`).bind(identity.accountId,JSON.stringify(profile),now,writeId,identity.accountId)
    : db.prepare(`UPDATE member_profiles SET data_json=?,version=version+1,updated_at=?,write_id=? WHERE account_id=? AND version=? AND EXISTS(SELECT 1 FROM member_accounts WHERE id=? AND status='active') RETURNING *`).bind(JSON.stringify(profile),now,writeId,identity.accountId,expected,identity.accountId);
  const result=await db.batch([query,audit(db,{type:'profile',id:identity.accountId,accountId:identity.accountId,version:next,event:'profile_saved',snapshot:profile,actor,now,writeId,table:'member_profiles',key:'account_id'})]);changed(result);
  return json({profile:profileFrom(rows(result[0])[0],identity)});
}
async function createApplication(db,identity,data,now) {
  only(data,['id','siteId','motivation','skills','availability','consentParticipation','consentVersion','consentFutureHandover']);
  const id=uuid(data.id),siteId=slug(data.siteId),payload={siteId,motivation:text(data,'motivation',2000,true),skills:text(data,'skills',2000),availability:text(data,'availability',1000),consentParticipation:data.consentParticipation,consentVersion:data.consentVersion,consentFutureHandover:bool(data,'consentFutureHandover')};
  if(payload.consentParticipation!==true||payload.consentVersion!==CONSENT_VERSION)fail(400,'consent_required','Read and agree to the current participation application terms.');
  const requestHash=await hash(payload),existing=await db.prepare('SELECT * FROM member_applications WHERE id=?').bind(id).first();
  if(existing){if(existing.account_id!==identity.accountId||existing.request_hash!==requestHash)fail(409,'submission_conflict','That request reference was already used.');return json({application:applicationFrom(await getApplication(db,id))});}
  const site=await getSite(db,siteId);if(!site.published||!site.applications_open)fail(409,'applications_closed','Applications for this group are currently closed.');
  const profile=profileFrom(await db.prepare('SELECT * FROM member_profiles WHERE account_id=?').bind(identity.accountId).first(),identity);
  if(!profile.version||!profile.consentContact)fail(400,'profile_required','Save your contact details and contact consent before applying.');
  const details={...payload,displayName:profile.displayName,email:profile.email,organisation:profile.organisation,originalOperator:'Luke Hayes trading as Strange But True',reviewNote:'',decisionRef:'',evidenceRef:'',admissionDate:''};
  const actor=actorFor(identity),writeId=crypto.randomUUID();
  if(await db.prepare("SELECT id FROM member_applications WHERE account_id=? AND site_id=? AND status NOT IN ('declined','withdrawn')").bind(identity.accountId,siteId).first())fail(409,'application_exists','You already have an active application for this group.');
  const result=await db.batch([
    db.prepare(`INSERT INTO member_applications(id,account_id,site_id,status,data_json,request_hash,version,created_at,updated_at,updated_by,write_id)
      SELECT ?,?,?,'submitted',?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM member_accounts WHERE id=? AND status='active') AND EXISTS(SELECT 1 FROM member_sites WHERE id=? AND published=1 AND applications_open=1)
      AND EXISTS(SELECT 1 FROM member_profiles WHERE account_id=? AND version=? AND json_extract(data_json,'$.consentContact')=1)
      ON CONFLICT DO NOTHING RETURNING *`).bind(id,identity.accountId,siteId,JSON.stringify(details),requestHash,now,now,actor,writeId,identity.accountId,siteId,identity.accountId,profile.version),
    audit(db,{type:'application',id,accountId:identity.accountId,siteId,version:1,event:'application_submitted',snapshot:{...details,status:'submitted'},actor,now,writeId,table:'member_applications'}),
  ]);changed(result);return json({application:applicationFrom({...rows(result[0])[0],site_name:site.name})},201);
}
async function changeApplication(db,identity,row,data,now,committee) {
  const expected=version(data),details=JSON.parse(row.data_json),actor=actorFor(identity),writeId=crypto.randomUUID();let nextStatus,condition;
  if(committee){
    only(data,['expectedVersion','status','reviewNote','decisionRef','evidenceRef','admissionDate']);
    nextStatus=data.status;if(!STATUSES.includes(nextStatus)||['submitted','withdrawn'].includes(nextStatus))fail(400,'invalid_fields','Choose a review status.');
    if(['withdrawn','admitted'].includes(row.status))fail(409,'review_closed','This application is closed to ordinary review. Record a new legal decision through the governance workspace.');
    details.reviewNote=text(data,'reviewNote',2000);details.decisionRef=text(data,'decisionRef',600);details.evidenceRef=text(data,'evidenceRef',600);details.admissionDate=date(data,'admissionDate');
    if(['declined','more_info'].includes(nextStatus)&&!details.reviewNote)fail(400,'review_note_required','Provide a response the applicant can read.');
    condition=guard(identity,row.site_id);
    if(nextStatus==='admitted'){
      if(!details.decisionRef||!details.evidenceRef||!details.admissionDate||details.admissionDate>now.slice(0,10))fail(400,'admission_evidence_required','Record the real admission date, decision and evidence before recording legal membership.');
      condition.sql+=` AND EXISTS(SELECT 1 FROM member_sites s JOIN governance_workspaces w ON w.id=s.governance_workspace_id WHERE s.id=? AND w.stage IN ('registered','operating') AND json_extract(w.data_json,'$.registrationRef')<>'' AND json_extract(w.data_json,'$.registrationDate')<>'')`;condition.values.push(row.site_id);
      const site=await getSite(db,row.site_id),workspace=site.governance_workspace_id?await db.prepare('SELECT * FROM governance_workspaces WHERE id=?').bind(site.governance_workspace_id).first():null;
      const registration=workspace?JSON.parse(workspace.data_json):{};
      if(!workspace||!['registered','operating'].includes(workspace.stage)||!registration.registrationRef||!registration.registrationDate)fail(400,'registration_required','Link this group to its registered cooperative workspace before recording legal membership.');
      if(details.admissionDate<registration.registrationDate)fail(400,'invalid_admission_date','Admission cannot be recorded before the cooperative registration date.');
    }
  }else{
    only(data,['expectedVersion','action','motivation','skills','availability']);
    if(row.account_id!==identity.accountId)fail(404,'not_found','The application was not found.');
    if(data.action==='withdraw'){
      if(!['submitted','in_review','more_info','accepted_participant'].includes(row.status))fail(409,'withdrawal_unavailable','Contact the organiser about changing this membership or closed application.');nextStatus='withdrawn';
    }else if(data.action==='resubmit'&&row.status==='more_info'){
      nextStatus='submitted';details.motivation=text(data,'motivation',2000,true);details.skills=text(data,'skills',2000);details.availability=text(data,'availability',1000);
    }else fail(400,'invalid_action','This application cannot be changed in that way.');
    condition={sql:"EXISTS(SELECT 1 FROM member_accounts WHERE id=? AND status='active')",values:[identity.accountId]};
  }
  const snapshot={...details,status:nextStatus};
  const queries=[db.prepare(`UPDATE member_applications SET data_json=?,status=?,version=version+1,updated_at=?,updated_by=?,write_id=? WHERE id=? AND version=? AND ${condition.sql} RETURNING *`).bind(JSON.stringify(details),nextStatus,now,actor,writeId,row.id,expected,...condition.values),
    audit(db,{type:'application',id:row.id,accountId:row.account_id,siteId:row.site_id,version:expected+1,event:committee?'application_reviewed':data.action==='withdraw'?'application_withdrawn':'application_resubmitted',snapshot,actor,now,writeId,table:'member_applications'})];
  if(['accepted_participant','admitted'].includes(nextStatus)){
    queries.push(db.prepare(`INSERT INTO member_site_roles(site_id,account_id,role,version,created_at,updated_at,updated_by,write_id)
      SELECT ?,?,'participant',1,?,?,?,? WHERE EXISTS(SELECT 1 FROM member_applications WHERE id=? AND write_id=?)
      ON CONFLICT(site_id,account_id) DO UPDATE SET role=CASE WHEN member_site_roles.role='committee' THEN 'committee' ELSE 'participant' END,version=member_site_roles.version+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by,write_id=excluded.write_id`).bind(row.site_id,row.account_id,now,now,actor,writeId,row.id,writeId));
    queries.push(roleAudit(db,row.site_id,row.account_id,actor,now,writeId,'participation_access_granted'));
  }else if(row.status==='accepted_participant'){
    queries.push(db.prepare(`UPDATE member_site_roles SET role='none',version=version+1,updated_at=?,updated_by=?,write_id=? WHERE site_id=? AND account_id=? AND role='participant' AND EXISTS(SELECT 1 FROM member_applications WHERE id=? AND write_id=?)`).bind(now,actor,writeId,row.site_id,row.account_id,row.id,writeId));
    queries.push(roleAudit(db,row.site_id,row.account_id,actor,now,writeId,'participation_access_removed'));
  }
  const result=await db.batch(queries);changed(result);return json({application:applicationFrom({...rows(result[0])[0],site_name:row.site_name})});
}
function roleAudit(db,siteId,accountId,actor,now,writeId,event) {
  return db.prepare(`INSERT INTO member_service_history(id,entity_type,entity_id,account_id,site_id,version,event,snapshot_json,actor,created_at)
    SELECT ?,'role',site_id||':'||account_id,account_id,site_id,version,?,json_object('siteId',site_id,'accountId',account_id,'role',role),?,? FROM member_site_roles WHERE site_id=? AND account_id=? AND write_id=?`).bind(crypto.randomUUID(),event,actor,now,siteId,accountId,writeId);
}

async function saveSite(db,identity,id,data,now,create) {
  requireWebmaster(identity);only(data,['id','name','locality','summary','governanceWorkspaceId','published','applicationsOpen','expectedVersion']);
  id=slug(id??data.id);if(!create&&data.id!==undefined&&data.id!==id)fail(400,'invalid_reference','A group ID cannot change.');
  const expected=create?0:version(data),payload={id,name:text(data,'name',160,true),locality:text(data,'locality',160),summary:text(data,'summary',2000),governanceWorkspaceId:text(data,'governanceWorkspaceId',36),published:bool(data,'published'),applicationsOpen:bool(data,'applicationsOpen')};
  if(payload.governanceWorkspaceId){uuid(payload.governanceWorkspaceId);if(!await db.prepare('SELECT id FROM governance_workspaces WHERE id=?').bind(payload.governanceWorkspaceId).first())fail(400,'workspace_not_found','Create the governance workspace before linking it.');}
  const condition=guard(identity,id,'webmaster'),actor=actorFor(identity),writeId=crypto.randomUUID();
  const query=create?db.prepare(`INSERT INTO member_sites(id,name,locality,summary,governance_workspace_id,published,applications_open,version,created_at,updated_at,created_by,write_id) SELECT ?,?,?,?,?,?,?,1,?,?,?,? WHERE ${condition.sql} ON CONFLICT DO NOTHING RETURNING *`).bind(id,payload.name,payload.locality,payload.summary,payload.governanceWorkspaceId||null,Number(payload.published),Number(payload.applicationsOpen),now,now,actor,writeId,...condition.values)
    :db.prepare(`UPDATE member_sites SET name=?,locality=?,summary=?,governance_workspace_id=?,published=?,applications_open=?,version=version+1,updated_at=?,write_id=? WHERE id=? AND version=? AND ${condition.sql} RETURNING *`).bind(payload.name,payload.locality,payload.summary,payload.governanceWorkspaceId||null,Number(payload.published),Number(payload.applicationsOpen),now,writeId,id,expected,...condition.values);
  const result=await db.batch([query,audit(db,{type:'site',id,siteId:id,version:expected+1,event:create?'site_created':'site_updated',snapshot:payload,actor,now,writeId,table:'member_sites'})]);changed(result);return json({site:siteFrom(rows(result[0])[0],'webmaster')},create?201:200);
}
async function assignRole(db,identity,siteId,data,now) {
  requireWebmaster(identity);only(data,['accountId','role','expectedVersion']);const accountId=uuid(data.accountId),expected=version(data,0);
  if(!['participant','committee','none'].includes(data.role))fail(400,'invalid_fields','Choose participant, committee or none.');
  await getSite(db,siteId);if(!await db.prepare("SELECT id FROM member_accounts WHERE id=? AND status='active'").bind(accountId).first())fail(400,'account_unavailable','Choose an active account.');
  const condition=guard(identity,siteId,'webmaster'),actor=actorFor(identity),writeId=crypto.randomUUID();
  condition.sql+=" AND EXISTS(SELECT 1 FROM member_accounts target WHERE target.id=? AND target.status='active')";condition.values.push(accountId);
  const query=expected===0?db.prepare(`INSERT INTO member_site_roles(site_id,account_id,role,version,created_at,updated_at,updated_by,write_id) SELECT ?,?,?,1,?,?,?,? WHERE ${condition.sql} ON CONFLICT DO NOTHING RETURNING *`).bind(siteId,accountId,data.role,now,now,actor,writeId,...condition.values)
    :db.prepare(`UPDATE member_site_roles SET role=?,version=version+1,updated_at=?,updated_by=?,write_id=? WHERE site_id=? AND account_id=? AND version=? AND ${condition.sql} RETURNING *`).bind(data.role,now,actor,writeId,siteId,accountId,expected,...condition.values);
  const result=await db.batch([query,roleAudit(db,siteId,accountId,actor,now,writeId,'group_role_assigned')]);changed(result);
  const row=rows(result[0])[0];return json({assignment:{siteId,accountId,role:row.role,version:row.version,updatedAt:row.updated_at}});
}
async function saveBulletin(db,identity,siteId,id,data,now,create,origin) {
  await groupRole(db,identity,siteId,true);only(data,['id','title','body','link','label','archived','expectedVersion']);
  id=uuid(id??data.id);const expected=create?0:version(data),payload={title:text(data,'title',200,true),body:text(data,'body',6000,true),link:text(data,'link',2000),label:text(data,'label',160)};
  if(payload.link){let link;try{link=new URL(payload.link,origin);}catch{fail(400,'invalid_link','Use a valid HTTPS document link or a link on this site.');}if(link.username||link.password||(link.protocol!=='https:'&&link.origin!==origin)||!['https:','http:'].includes(link.protocol))fail(400,'invalid_link','Use a valid HTTPS document link or a link on this site.');payload.link=link.href;}
  const archived=create?false:bool(data,'archived'),requestHash=await hash(payload),actor=actorFor(identity),writeId=crypto.randomUUID(),condition=guard(identity,siteId);
  if(create){const existing=await db.prepare('SELECT * FROM member_bulletins WHERE id=?').bind(id).first();if(existing){if(existing.site_id!==siteId||existing.request_hash!==requestHash)fail(409,'submission_conflict','That bulletin reference was already used.');return json({bulletin:bulletinFrom(existing)});}}
  const query=create?db.prepare(`INSERT INTO member_bulletins(id,site_id,data_json,request_hash,archived,version,created_at,updated_at,updated_by,write_id) SELECT ?,?,?,?,0,1,?,?,?,? WHERE ${condition.sql} ON CONFLICT DO NOTHING RETURNING *`).bind(id,siteId,JSON.stringify(payload),requestHash,now,now,actor,writeId,...condition.values)
    :db.prepare(`UPDATE member_bulletins SET data_json=?,archived=?,version=version+1,updated_at=?,updated_by=?,write_id=? WHERE id=? AND site_id=? AND version=? AND ${condition.sql} RETURNING *`).bind(JSON.stringify(payload),Number(archived),now,actor,writeId,id,siteId,expected,...condition.values);
  const result=await db.batch([query,audit(db,{type:'bulletin',id,siteId,version:expected+1,event:create?'bulletin_published':archived?'bulletin_archived':'bulletin_updated',snapshot:{...payload,archived},actor,now,writeId,table:'member_bulletins'})]);changed(result);return json({bulletin:bulletinFrom(rows(result[0])[0])},create?201:200);
}

async function paginated(db,url,select,count,values,key,map=value=>value) {
  const pagination=page(url),result=await db.batch([db.prepare(`${select} LIMIT ? OFFSET ?`).bind(...values,pagination.pageSize,pagination.offset),db.prepare(count).bind(...values)]);
  return json({[key]:rows(result[0]).map(map),total:rows(result[1])[0].total,page:pagination.page,pageSize:pagination.pageSize});
}
export async function handleMemberServiceRequest(request,env,{identity,now,readJSON}) {
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/member/')&&!path.startsWith('/api/committee/')&&!path.startsWith('/api/webmaster/sites'))return null;
  try{
    sameOrigin(request);const db=env.DB;
    if(!db?.prepare||!db?.batch)fail(503,'service_unavailable','Member services are temporarily unavailable.');
    if(path==='/api/member/sites'&&request.method==='GET'){
      const condition=identity?.webmaster?'1':'s.published=1';
      return paginated(db,url,`SELECT s.*,r.role FROM member_sites s LEFT JOIN member_site_roles r ON r.site_id=s.id AND r.account_id=? WHERE ${condition} ORDER BY s.name,s.id`,`SELECT COUNT(*) AS total FROM member_sites s LEFT JOIN member_site_roles r ON r.site_id=s.id AND r.account_id=? WHERE ${condition}`,[identity?.accountId??''],'sites',row=>siteFrom(row,row.role==='none'?null:row.role));
    }
    if(!identity)fail(401,'sign_in_required','Sign in to your account first.');
    if(path==='/api/member/profile'){
      requireAccount(identity);if(request.method==='GET')return json({profile:profileFrom(await db.prepare('SELECT * FROM member_profiles WHERE account_id=?').bind(identity.accountId).first(),identity)});
      if(request.method==='PATCH')return await saveProfile(db,identity,await readJSON(),now);
    }
    if(path==='/api/member/applications'){
      requireAccount(identity);if(request.method==='POST')return await createApplication(db,identity,await readJSON(),now);
      if(request.method==='GET')return paginated(db,url,'SELECT a.*,s.name AS site_name FROM member_applications a JOIN member_sites s ON s.id=a.site_id WHERE a.account_id=? ORDER BY a.updated_at DESC,a.id','SELECT COUNT(*) AS total FROM member_applications WHERE account_id=?',[identity.accountId],'applications',applicationFrom);
    }
    let match=/^\/api\/member\/applications\/([^/]+)(?:\/(history))?$/.exec(path);
    if(match){requireAccount(identity);const row=await getApplication(db,uuid(match[1]));if(row.account_id!==identity.accountId)fail(404,'not_found','The application was not found.');
      if(match[2]&&request.method==='GET')return paginated(db,url,"SELECT * FROM member_service_history WHERE entity_type='application' AND entity_id=? ORDER BY version DESC","SELECT COUNT(*) AS total FROM member_service_history WHERE entity_type='application' AND entity_id=?",[row.id],'revisions',revisionFrom);
      if(!match[2]&&request.method==='PATCH')return await changeApplication(db,identity,row,await readJSON(),now,false);
    }
    if(path==='/api/member/groups'&&request.method==='GET'){
      const from=`FROM member_sites s LEFT JOIN member_site_roles r ON r.site_id=s.id AND r.account_id=? LEFT JOIN member_applications a ON a.site_id=s.id AND a.account_id=? AND a.status NOT IN ('withdrawn','declined')`,clause=identity.webmaster?'1':"r.role IN ('participant','committee')";
      return paginated(db,url,`SELECT s.*,r.role,a.status AS application_status ${from} WHERE ${clause} ORDER BY s.name,s.id`,`SELECT COUNT(*) AS total ${from} WHERE ${clause}`,[identity.accountId,identity.accountId],'groups',row=>({...siteFrom(row,identity.webmaster?'webmaster':row.role),legalMembershipStatus:row.application_status==='admitted'?'admitted':'not_admitted'}));
    }
    match=/^\/api\/member\/groups\/([^/]+)\/bulletins(?:\/([^/]+))?$/.exec(path);
    if(match){const siteId=slug(match[1]);await getSite(db,siteId);const role=await groupRole(db,identity,siteId),staff=['committee','webmaster'].includes(role);
      if(!match[2]&&request.method==='GET'){const clause=staff?'site_id=?':'site_id=? AND archived=0';return paginated(db,url,`SELECT * FROM member_bulletins WHERE ${clause} ORDER BY created_at DESC,id`,`SELECT COUNT(*) AS total FROM member_bulletins WHERE ${clause}`,[siteId],'bulletins',bulletinFrom);}
      if(!match[2]&&request.method==='POST')return await saveBulletin(db,identity,siteId,null,await readJSON(),now,true,url.origin);
      if(match[2]&&request.method==='PATCH')return await saveBulletin(db,identity,siteId,match[2],await readJSON(),now,false,url.origin);
    }
    if(path==='/api/committee/sites'&&request.method==='GET'){
      const clause=identity.webmaster?'1':"s.id IN (SELECT site_id FROM member_site_roles WHERE account_id=? AND role='committee')",parameters=identity.webmaster?[]:[identity.accountId];
      return paginated(db,url,`SELECT s.* FROM member_sites s WHERE ${clause} ORDER BY name,id`,`SELECT COUNT(*) AS total FROM member_sites s WHERE ${clause}`,parameters,'sites',row=>siteFrom(row,identity.webmaster?'webmaster':'committee'));
    }
    match=/^\/api\/committee\/sites\/([^/]+)\/applications(?:\/([^/]+))?(?:\/(history))?$/.exec(path);
    if(match){const siteId=slug(match[1]);await groupRole(db,identity,siteId,true);
      if(!match[2]&&request.method==='GET')return paginated(db,url,'SELECT a.*,s.name AS site_name FROM member_applications a JOIN member_sites s ON s.id=a.site_id WHERE a.site_id=? ORDER BY a.updated_at DESC,a.id','SELECT COUNT(*) AS total FROM member_applications WHERE site_id=?',[siteId],'applications',applicationFrom);
      if(match[2]){const row=await getApplication(db,uuid(match[2]));if(row.site_id!==siteId)fail(404,'not_found','The application was not found.');
        if(match[3]&&request.method==='GET')return paginated(db,url,"SELECT * FROM member_service_history WHERE entity_type='application' AND entity_id=? ORDER BY version DESC","SELECT COUNT(*) AS total FROM member_service_history WHERE entity_type='application' AND entity_id=?",[row.id],'revisions',revisionFrom);
        if(!match[3]&&request.method==='PATCH')return await changeApplication(db,identity,row,await readJSON(),now,true);
      }
    }
    if(path==='/api/webmaster/sites'){
      requireWebmaster(identity);if(request.method==='GET')return paginated(db,url,'SELECT * FROM member_sites ORDER BY name,id','SELECT COUNT(*) AS total FROM member_sites',[],'sites',row=>siteFrom(row,'webmaster'));
      if(request.method==='POST')return await saveSite(db,identity,null,await readJSON(),now,true);
    }
    match=/^\/api\/webmaster\/sites\/([^/]+)(?:\/(roles)(?:\/([^/]+))?)?$/.exec(path);
    if(match){requireWebmaster(identity);const siteId=slug(match[1]);await getSite(db,siteId);
      if(!match[2]&&request.method==='PATCH')return await saveSite(db,identity,siteId,await readJSON(),now,false);
      if(match[2]&&match[3]&&request.method==='GET'){const accountId=uuid(match[3]),row=await db.prepare('SELECT * FROM member_site_roles WHERE site_id=? AND account_id=?').bind(siteId,accountId).first();return json({assignment:row?{siteId,accountId,role:row.role,version:row.version,updatedAt:row.updated_at}:null});}
      if(match[2]&&!match[3]&&request.method==='GET')return paginated(db,url,'SELECT r.*,a.username,a.display_name FROM member_site_roles r JOIN member_accounts a ON a.id=r.account_id WHERE site_id=? ORDER BY a.username','SELECT COUNT(*) AS total FROM member_site_roles WHERE site_id=?',[siteId],'assignments',row=>({siteId:row.site_id,accountId:row.account_id,username:row.username,displayName:row.display_name,role:row.role,version:row.version,updatedAt:row.updated_at}));
      if(match[2]&&!match[3]&&request.method==='PUT')return await assignRole(db,identity,siteId,await readJSON(),now);
    }
    if(path==='/api/member/export'&&request.method==='GET'){
      requireAccount(identity);
      const bound='(SELECT COUNT(*)<=10000 AND COALESCE(SUM(length(CAST(snapshot_json AS BLOB))),0)<=4194304 FROM member_service_history WHERE account_id=?)';
      const result=await db.batch([db.prepare('SELECT * FROM member_profiles WHERE account_id=?').bind(identity.accountId),db.prepare(`SELECT a.*,s.name AS site_name FROM member_applications a JOIN member_sites s ON s.id=a.site_id WHERE a.account_id=? AND ${bound} ORDER BY a.created_at LIMIT 10001`).bind(identity.accountId,identity.accountId),db.prepare('SELECT site_id,role,version,updated_at FROM member_site_roles WHERE account_id=? LIMIT 10001').bind(identity.accountId),db.prepare(`SELECT * FROM member_service_history WHERE account_id=? AND ${bound} ORDER BY created_at,id LIMIT 10001`).bind(identity.accountId,identity.accountId),db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(length(CAST(snapshot_json AS BLOB))),0) AS bytes FROM member_service_history WHERE account_id=?').bind(identity.accountId)]);
      const counts=rows(result[4])[0];if(counts.total>10000||counts.bytes>4*1024*1024||rows(result[1]).length>10000||rows(result[2]).length>10000)fail(413,'export_too_large','Contact the site organiser for a complete database export of your records.');
      return json({schemaVersion:1,exportedAt:now,account:{id:identity.accountId,username:identity.username,emailVerified:false},profile:profileFrom(rows(result[0])[0],identity),applications:rows(result[1]).map(applicationFrom),groupAccess:rows(result[2]),history:rows(result[3]).map(revisionFrom)},200,{'Content-Disposition':'attachment; filename="ready-setco-my-records.json"'});
    }
    fail(405,'method_not_allowed','This member action or method is not supported.');
  }catch(error){
    if(error instanceof ServiceError)return json({error:error.message,code:error.code},error.status);
    if(/no such table:.*member_/i.test(String(error?.message??'')))return json({error:'Member services are waiting for the database update.',code:'member_setup_required'},503);
    if(/UNIQUE constraint failed.*member_(?:sites|applications)/i.test(String(error?.message??'')))return json({error:'A matching group or active application already exists. Refresh before trying again.',code:'record_conflict'},409);
    throw error;
  }
}
