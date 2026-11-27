(() => {
  'use strict';
  const BASE = '/api/admin/governance/workspaces';
  const TYPES = {
    task: ['Formation actions', 'Next steps, responsibilities and evidence', 'Give each action an owner and a clear completion condition. Keep the supporting approval or document reference when the work is completed.'],
    rule: ['Rules & active membership', 'Clause drafts and reasons for local choices', 'Prepare each clause for founder discussion and comparison with the applicable model rules. Adoption and regulator approval are recorded separately.'],
    meeting: ['Meetings & minutes', 'Notices, agendas, attendance and minutes', 'Prepare a meeting and preserve its notice, attendance, quorum check and minutes. A calendar entry does not convene a meeting or send invitations.'],
    decision: ['Decisions & resolutions', 'Motions, vote counts and recorded outcomes', 'Record the proposed motion, the people entitled to vote, the applicable threshold and the actual outcome. Check the law and adopted rules before declaring a resolution carried.'],
    membership: ['Membership records', 'Applications, admissions and participation', 'Keep expressions of interest separate from applications and admissions. Record the authorised admission decision, consent and active membership basis.'],
    role: ['Directors & responsibilities', 'Appointments, terms, delegations and conflicts', 'Record who accepted a role, its authority and its limits. A saved role entry does not send an invitation or grant software access.'],
    finance: ['Finances & disclosure', 'Budgets, shares, fees, reserves and reporting', 'Describe each financial proposal and its assumptions. Store references to approved budgets and financial statements; banking and payroll remain with their responsible providers.'],
    handover: ['Service handover', 'Agreed transfers with dates and consent', 'Identify the original operator, receiving legal entity, obligations, consent and acceptance. Preserve the historical party to each contract and employment arrangement.'],
    policy: ['Policies & reviews', 'Operational policies and review dates', 'Keep the scope, edition, approval and next review together so people can find the policy that applies to their work.'],
    asset: ['Shared assets', 'Ownership, care, licences and renewal', 'Record the real owner and custodian, the service plan and renewal needs. A site or asset record does not establish ownership or permission to use a place.'],
    risk: ['Risks & actions', 'Practical concerns, responses and follow-up', 'Name the concern, what would trigger action, who should respond and when the response will be reviewed.']
  };
  const STATUS = { draft: 'Draft', 'in-review': 'In review', approved: 'Approved, evidence recorded', completed: 'Completed, evidence recorded', archived: 'Archived' };
  const STAGES = { exploring: 'Exploring formation', drafting: 'Preparing rules and plans', 'regulator-review': 'Regulator review', 'formation-meeting': 'Formation meeting', 'registration-pending': 'Registration pending', registered: 'Registration evidenced', operating: 'Operating' };
  const COOP_TYPES = { undecided: 'For founders to decide', distributing: 'Distributing', 'non-distributing-shares': 'Non-distributing with shares', 'non-distributing-no-shares': 'Non-distributing without shares' };
  const JURISDICTIONS = { QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria', TAS: 'Tasmania', SA: 'South Australia', WA: 'Western Australia', ACT: 'Australian Capital Territory', NT: 'Northern Territory', other: 'Another jurisdiction' };
  const F = (key, label, type = 'text', max = 600, options = null) => ({ key, label, type, max, options });
  const FIELDS = {
    task: [F('milestone', 'Formation milestone'), F('dependency', 'What needs to happen first'), F('completionCriteria', 'Evidence of completion', 'textarea', 1500)],
    rule: [F('section', 'Rule section or topic'), F('modelRuleReference', 'Model rule / law reference'), F('proposedText', 'Proposed clause', 'textarea', 3000), F('rationale', 'Reason for this approach', 'textarea', 1000)],
    meeting: [F('meetingType', 'Meeting type', 'select', 0, {formation:'Formation',board:'Board',general:'General meeting',agm:'Annual general meeting',other:'Other'}), F('scheduledDate', 'Meeting date', 'date'), F('noticeDate', 'Notice issued on', 'date'), F('location', 'Venue / meeting access'), F('chair', 'Chair'), F('minuteTaker', 'Minute taker'), F('agenda', 'Agenda', 'textarea', 2000), F('attendanceCount', 'Attendance count', 'number'), F('quorumRequirement', 'Applicable quorum and source'), F('quorumConfirmed', 'Quorum was checked against the applicable rules', 'checkbox'), F('minutesRef', 'Signed / confirmed minutes reference')],
    decision: [F('resolutionType', 'Resolution type', 'select', 0, {ordinary:'Ordinary',special:'Special',board:'Board', 'formation-rules':'Adoption of formation rules',other:'Other'}), F('meetingRef', 'Meeting / ballot reference'), F('motion', 'Motion put to the meeting or ballot', 'textarea', 2000), F('eligibleVotes', 'People entitled to vote', 'number'), F('votesFor', 'Votes for', 'number'), F('votesAgainst', 'Votes against', 'number'), F('abstentions', 'Abstentions', 'number'), F('thresholdBasis', 'Required threshold and source'), F('outcome', 'Recorded outcome', 'select', 0, {proposed:'Proposed',carried:'Carried', 'not-carried':'Not carried',deferred:'Deferred',withdrawn:'Withdrawn'}), F('decisionDate', 'Decision date', 'date'), F('conflicts', 'Interests declared and how managed', 'textarea', 1000)],
    membership: [F('memberRef', 'Local member / applicant reference'), F('memberName', 'Person or legal entity name'), F('memberType', 'Member type', 'select', 0, {individual:'Individual', 'body-corporate':'Body corporate'}), F('membershipStage', 'Membership stage', 'select', 0, {prospective:'Prospective founder',applicant:'Application received',admitted:'Admission evidenced',resigned:'Resigned',cancelled:'Cancelled'}), F('applicationDate', 'Application date', 'date'), F('admissionDate', 'Admission date', 'date'), F('activeMembershipBasis', 'Primary activity and participation requirement', 'textarea', 1000), F('participationReviewDate', 'Participation review date', 'date'), F('decisionRef', 'Admission / exit decision reference'), F('consentRef', 'Relevant privacy / consent reference')],
    role: [F('roleName', 'Role or office'), F('holderName', 'Person accepting the role'), F('appointmentDate', 'Appointment date', 'date'), F('termEnd', 'Term ends', 'date'), F('appointmentRef', 'Election / appointment record'), F('delegation', 'Delegated authority and limits', 'textarea', 1500), F('conflicts', 'Interests and management arrangements', 'textarea', 1000)],
    finance: [F('category', 'Financial category', 'select', 0, {budget:'Budget',shares:'Share capital',fees:'Membership / service fees',reserves:'Reserves',reporting:'Financial reporting',other:'Other'}), F('amountCents', 'Amount (AUD)', 'money'), F('period', 'Period / financial year'), F('basis', 'Assumptions and calculation basis', 'textarea', 1000), F('restrictions', 'Restricted funds / conditions', 'textarea', 1000), F('approvalRef', 'Financial approval / report reference')],
    handover: [F('fromEntity', 'Original legal operator'), F('toEntity', 'Receiving legal entity'), F('scope', 'Services, rights and assets included', 'textarea', 1500), F('effectiveDate', 'Effective date', 'date'), F('consentRef', 'Contract / personal-data consent reference'), F('acceptanceRef', 'Receiving board acceptance reference'), F('liabilities', 'Liabilities, entitlements and continuing obligations', 'textarea', 1000), F('recordsPlan', 'Records transfer, access and retention', 'textarea', 1000)],
    policy: [F('topic', 'Policy topic'), F('versionLabel', 'Edition / version label'), F('reviewDate', 'Next review date', 'date'), F('approvalRef', 'Approving decision reference'), F('scope', 'Who and what the policy covers', 'textarea', 1500)],
    asset: [F('assetRef', 'Asset / installation reference'), F('legalOwner', 'Legal owner'), F('custodian', 'Responsible custodian'), F('location', 'Location'), F('servicePlan', 'Maintenance, training and service plan', 'textarea', 1500), F('renewalDate', 'Renewal / review date', 'date'), F('licenceRef', 'Licence / agreement reference')],
    risk: [F('likelihood', 'Likelihood', 'select', 0, {low:'Low',medium:'Medium',high:'High'}), F('impact', 'Impact', 'select', 0, {low:'Low',medium:'Medium',high:'High'}), F('mitigation', 'Response and prevention', 'textarea', 2000), F('reviewDate', 'Review date', 'date'), F('trigger', 'When to act'), F('escalationTo', 'Who needs to know')]
  };
  const CHECKLIST = [
    ['Agree the local purpose and first services', 'Describe the practical need, the prospective members who share it and the first service the cooperative could sustain. Record assumptions, costs and who will help test them.'],
    ['Confirm prospective founders and representation', 'Discuss eligibility, active participation and authority to speak for any organisation. Keep an expression of interest separate from a membership application.'],
    ['Choose the cooperative structure', 'Compare distributing and non-distributing arrangements, share capital, operating income, member benefits and relevant grant requirements. Record the founders\' reasons.'],
    ['Draft primary activities and active membership', 'Set out the cooperative\'s primary activities and a practical participation requirement. Check proposed wording against the applicable law and model rules.'],
    ['Prepare the rulebook for review', 'Work through membership, elections, meetings, voting, finances, disputes, exits and winding up. Keep clause versions and reasons for local choices.'],
    ['Prepare the budget and formation disclosure', 'Record capital needs, operating costs, commitments, risks and member obligations. Confirm with the registrar whether a formation disclosure statement is required.'],
    ['Seek the required regulator review', 'Use the current registrar process for the jurisdiction. Record submitted editions, correspondence, required changes and any approval before relying on it.'],
    ['Prepare and hold the formation meeting', 'Use the approved documents as applicable, give the required notice, verify attendance and voting entitlement, record rule adoption and director elections, and preserve signed minutes.'],
    ['Lodge the registration application', 'Check the current official form, required attachments, applicable lodgement period and fee. Record the submission receipt and any request for further information.'],
    ['Verify registration and establish operations', 'Record the registration evidence, adopted rules, officers and authorisations. Arrange the cooperative\'s own banking, tax registrations, insurance, records and relevant service permissions.'],
    ['Agree any service and asset handover', 'Record the original operator, receiving entity, scope, effective date, contractual consents, employment arrangements, rights, liabilities and board acceptance.'],
    ['Set the governance and reporting calendar', 'Record board and member meetings, reporting obligations, active-membership reviews, conflicts, policy reviews, financial controls, maintenance and renewal responsibilities.']
  ];
  function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
  function options(select, values, emptyLabel) {
    select.replaceChildren();
    if (emptyLabel) { const item = node('option', emptyLabel); item.value = ''; select.append(item); }
    for (const [value, label] of Object.entries(values)) { const item = node('option', label); item.value = value; select.append(item); }
  }
  function dateText(value) { if (!value) return 'Not recorded'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }); }
  function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,70) || 'cooperative'; }
  function download(value, type, name) {
    const url = URL.createObjectURL(new Blob([value], {type})); const link = node('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
  function displayDetail(field, value) {
    if (field.type === 'checkbox') return value ? 'Yes, recorded by the organiser' : 'Not confirmed';
    if (field.type === 'money') return new Intl.NumberFormat('en-AU', {style:'currency',currency:'AUD'}).format(value / 100);
    return field.options?.[value] || String(value);
  }
  function packHtml(workspace, records) {
    const list = records.map(record => {
      const details = (FIELDS[record.kind] || []).filter(field => record.details?.[field.key] !== undefined && record.details[field.key] !== '').map(field => `<dt>${escape(field.label)}</dt><dd>${escape(displayDetail(field, record.details[field.key]))}</dd>`).join('');
      return `<article><p class="eyebrow">${escape(TYPES[record.kind]?.[0] || record.kind)} · ${escape(STATUS[record.status] || record.status)}</p><h2>${escape(record.title)}</h2><dl><dt>Owner</dt><dd>${escape(record.owner || 'Unassigned')}</dd><dt>Due date</dt><dd>${escape(record.dueDate || 'Not set')}</dd><dt>Source reference</dt><dd>${escape(record.sourceRef || 'Not recorded')}</dd><dt>Evidence reference</dt><dd>${escape(record.evidenceRef || 'Not recorded')}</dd>${details}</dl><pre>${escape(record.body || '')}</pre><p>Version ${escape(record.version)} · Saved by ${escape(record.updatedBy || record.createdBy || 'Author not returned')} · ${escape(dateText(record.updatedAt || record.createdAt))}</p><p class="reference">Record ${escape(record.id)}</p></article>`;
    }).join('');
    return `<header><p>ready SET Co-op · Private working documents</p><h1>${escape(workspace.name)}</h1><p>${escape(workspace.locality)} · ${escape(JURISDICTIONS[workspace.jurisdiction] || workspace.jurisdiction)} · ${escape(COOP_TYPES[workspace.cooperativeType])}</p><p>Prepared ${escape(dateText(new Date().toISOString()))}. These records retain their individual status and evidence references. This pack is not proof of registration, membership, a valid vote or completed legal transfer.</p></header>${list || '<p>No records in this selection.</p>'}`;
  }
  function init({request}) {
    const host = document.querySelector('#governance');
    if (!host || typeof request !== 'function') return {load: async () => {}};
    if (host.dataset.initialised === 'true') return host.governanceController;
    host.dataset.initialised = 'true';
    const $ = id => document.getElementById(id);
    const select = $('gov-workspace-select'), status = $('gov-status'), createForm = $('gov-create-workspace'), settingsForm = $('gov-workspace-form');
    const recordForm = $('gov-record-form'), kindFilter = $('gov-kind'), statusFilter = $('gov-record-status-filter');
    let workspaces = [], workspacePage = 1, workspaceTotal = 0, workspace = null, records = [], recordPage = 1, recordTotal = 0;
    let selected = null, kind = 'task', recordDirty = false, workspaceDirty = false, createDirty = false, busy = false, generation = 0, recordGeneration = 0, workspaceGeneration = 0, createId = null, savedStatusFilter = '';
    let lastCreatePayload = null, pendingRecord = null;
    const pageSize = 30, workspacePageSize = 100;
    function notice(message, error = false, focus = false) { status.textContent = message; status.dataset.kind = error ? 'error' : 'success'; if (focus) status.focus(); }
    function setBusy(value) {
      busy = value; host.setAttribute('aria-busy', String(value));
      $('gov-controls').disabled = value;
    }
    function markDirty(scope, value) {
      if (scope === 'workspace') workspaceDirty = value; else if (scope === 'create') createDirty = value; else recordDirty = value;
      $('gov-record-dirty').hidden = !recordDirty; $('gov-workspace-dirty').hidden = !workspaceDirty; $('gov-create-dirty').hidden = !createDirty;
    }
    function canLeave({keepCreate=false} = {}) {
      if (busy) { notice('Wait for the current save to finish before changing records.', true, true); return false; }
      if (!recordDirty && !workspaceDirty && (!createDirty || keepCreate)) return true;
      if (!window.confirm('There are unsaved changes in this workspace. Discard them and continue?')) return false;
      markDirty('record',false); if (workspace) refreshSummary();
      if (!keepCreate && createDirty) {createForm.reset();markDirty('create',false);createId=null;lastCreatePayload=null;}
      return true;
    }
    function failure(error, fallback) {
      const message = error?.message || fallback;
      notice(error?.status === 409 ? `${message} Your unsaved text is still here. Copy it before using Reload workspace to inspect the saved version.` : message, true, true);
    }
    function currentPath() { return `${BASE}/${encodeURIComponent(workspace.id)}`; }
    function formValue(form, name) { return form.elements.namedItem(name)?.value.trim() || ''; }
    function workspaceValues(form) {
      return {name:formValue(form,'name'),locality:formValue(form,'locality'),jurisdiction:formValue(form,'jurisdiction'),cooperativeType:formValue(form,'cooperativeType'),purpose:formValue(form,'purpose')};
    }
    function refreshSummary() {
      const box = $('gov-workspace-summary'); box.replaceChildren();
      if (!workspace) return;
      box.append(node('strong',workspace.name),node('p',`${workspace.locality} · ${JURISDICTIONS[workspace.jurisdiction]} · ${COOP_TYPES[workspace.cooperativeType]}`),node('p',`${STAGES[workspace.stage]} · Version ${workspace.version} · Last saved by ${workspace.updatedBy || workspace.createdBy || 'Author not returned'} on ${dateText(workspace.updatedAt || workspace.createdAt)}`));
      if (workspace.jurisdiction !== 'QLD') box.append(node('p','This hub currently provides Queensland legal guidance. Confirm the local registrar process and local law before using this workspace for legal formation.','gov-help'));
      for (const name of ['name','locality','jurisdiction','cooperativeType','purpose','stage','registrationRef','registrationDate']) settingsForm.elements.namedItem(name).value = workspace[name] || '';
      updateRegistrationRequired(); markDirty('workspace',false);
    }
    function updateRegistrationRequired() {
      const registered = ['registered','operating'].includes(formValue(settingsForm,'stage'));
      settingsForm.elements.namedItem('registrationRef').required = registered;
      settingsForm.elements.namedItem('registrationDate').required = registered;
    }
    async function loadWorkspaces({keepId = workspace?.id, page = workspacePage} = {}) {
      const ticket = ++workspaceGeneration;
      const result = await request(`${BASE}?page=${page}&pageSize=${workspacePageSize}`);
      if (ticket !== workspaceGeneration) return result;
      workspaces = result.workspaces; workspacePage = result.page || page; workspaceTotal = result.total ?? workspaces.length;
      select.replaceChildren(); const initial = node('option','Choose a cooperative workspace'); initial.value = ''; select.append(initial);
      for (const item of workspaces) { const option = node('option',`${item.name} · ${item.locality}`); option.value = item.id; select.append(option); }
      if (keepId && !workspaces.some(item => item.id === keepId) && workspace?.id === keepId) { const option=node('option',`${workspace.name} · ${workspace.locality}`); option.value=keepId; select.append(option); }
      select.value = keepId || '';
      $('gov-workspace-page').textContent = `Page ${workspacePage} · ${workspaceTotal} ${workspaceTotal===1?'workspace':'workspaces'}`;
      $('gov-workspaces-prev').disabled = workspacePage <= 1;
      $('gov-workspaces-next').disabled = workspacePage * workspacePageSize >= workspaceTotal;
      $('gov-workspace-pages').hidden = workspaceTotal <= workspacePageSize;
      $('gov-controls').hidden = false; $('gov-no-workspaces').hidden = workspaceTotal > 0;
      return result;
    }
    function closeEditor() { selected=null; pendingRecord=null; recordForm.reset(); $('gov-editor').hidden=true; markDirty('record',false); }
    async function chooseWorkspace(id) {
      const ticket = ++generation; closeEditor(); markDirty('workspace',false); workspace = null; records = []; $('gov-record-list').replaceChildren(); $('gov-active-workspace').hidden = true;
      if (!id) return;
      const result = await request(`${BASE}/${encodeURIComponent(id)}`); if (ticket !== generation) return;
      workspace = result.workspace; select.value = workspace.id; refreshSummary(); $('gov-active-workspace').hidden=false; recordPage=1;
      await loadRecords();
    }
    async function loadRecords() {
      if (!workspace) return;
      const workspaceId=workspace.id, requestedKind=kind, requestedPage=recordPage, ticket=generation, recordTicket=++recordGeneration;
      records=[]; $('gov-record-list').replaceChildren(); $('gov-empty-records').hidden=true; $('gov-record-count').textContent='Loading saved records…';
      const query = new URLSearchParams({kind,page:String(recordPage),pageSize:String(pageSize)});
      if (statusFilter.value) query.set('status',statusFilter.value);
      const result = await request(`${currentPath()}/records?${query}`);
      if (ticket !== generation || recordTicket!==recordGeneration || workspace?.id!==workspaceId || kind!==requestedKind || recordPage!==requestedPage) return;
      records=result.records; recordTotal=result.total ?? records.length; renderRecords();
    }
    function renderRecords() {
      const search=$('gov-record-search').value.trim().toLowerCase(); const visible=records.filter(record=>`${record.title} ${record.owner} ${record.body}`.toLowerCase().includes(search));
      const list=$('gov-record-list'); list.replaceChildren();
      for (const record of visible) {
        const li=node('li'), button=node('button',undefined,'gov-record-button'); button.type='button'; button.setAttribute('aria-current',String(selected?.id===record.id));
        button.append(node('strong',record.title)); const pill=node('span',STATUS[record.status] || record.status,'gov-status-pill'); pill.dataset.status=record.status; button.append(pill);
        button.append(node('small',`${record.owner || 'Owner not assigned'}${record.dueDate ? ` · Due ${record.dueDate}` : ''}`));
        button.addEventListener('click',()=>{if(canLeave()){markDirty('workspace',false);refreshSummary();openRecord(record);}}); li.append(button); list.append(li);
      }
      $('gov-record-count').textContent=`${recordTotal} ${recordTotal===1?'record':'records'} in ${TYPES[kind][0].toLowerCase()}. Showing ${visible.length} on this page${search?' matching your search':''}.`;
      $('gov-empty-records').hidden=visible.length>0; $('gov-record-prev').disabled=recordPage<=1; $('gov-record-next').disabled=recordPage*pageSize>=recordTotal; $('gov-record-page').textContent=`Page ${recordPage}`;
    }
    function buildFields(type, values={}) {
      const container=$('gov-detail-fields'); container.replaceChildren();
      for (const field of FIELDS[type]) {
        const label=node('label',field.type==='checkbox'?undefined:field.label,field.type==='textarea'?'gov-wide':undefined);
        let input;
        if (field.type==='select') { input=node('select'); options(input,field.options,'Not yet recorded'); }
        else if (field.type==='textarea') { input=node('textarea'); input.rows=4; input.maxLength=field.max; }
        else { input=node('input'); input.type=field.type==='money'?'text':field.type; if (field.type==='money') {input.inputMode='decimal';input.pattern='[0-9]+([.][0-9]{1,2})?';input.placeholder='0.00';} else if (field.type==='number') {input.min='0';input.step='1';} else if (field.type==='text') input.maxLength=field.max; }
        input.name=`detail_${field.key}`; input.id=`gov-detail-${field.key}`;
        if (field.type==='checkbox') {input.checked=values[field.key]===true;label.className='gov-check gov-wide';label.append(input,node('span',field.label));}
        else {input.value=field.type==='money' && values[field.key] !== undefined ? (values[field.key]/100).toFixed(2) : values[field.key] ?? '';label.append(input);}
        container.append(label);
      }
    }
    function updateEvidenceRequired() {
      const carried=kind==='decision' && formValue(recordForm,'detail_outcome')==='carried';
      const needsEvidence=['approved','completed'].includes(formValue(recordForm,'status')) || (kind==='membership' && formValue(recordForm,'detail_membershipStage')==='admitted') || carried;
      recordForm.elements.namedItem('evidenceRef').required=needsEvidence;
      if(kind==='decision')for(const key of ['detail_decisionDate','detail_meetingRef'])recordForm.elements.namedItem(key).required=carried;
      $('gov-evidence-hint').textContent=needsEvidence?'Required for this status. Use the actual approving decision or completion evidence reference.':'Use a private document, signed minute or receipt reference when evidence is available.';
    }
    function openRecord(record=null) {
      selected=record; pendingRecord=null; recordForm.reset();
      $('gov-editor').hidden=false; $('gov-editor-title').textContent=record?'Edit saved record':`New ${TYPES[kind][0].toLowerCase()} record`;
      $('gov-record-help').textContent=TYPES[kind][2];
      for (const name of ['title','owner','dueDate','sourceRef','evidenceRef','body']) recordForm.elements.namedItem(name).value=record?.[name] || '';
      recordForm.elements.namedItem('status').value=record?.status || 'draft';
      buildFields(kind,record?.details || {}); updateEvidenceRequired();
      $('gov-saved-meta').textContent=record?`Version ${record.version} · Saved by ${record.updatedBy || record.createdBy || 'Author not returned'} on ${dateText(record.updatedAt || record.createdAt)}`:'New draft. It has not been saved.';
      $('gov-record-archive').hidden=!record || record.status==='archived'; $('gov-history-section').hidden=!record; $('gov-history-list').replaceChildren(); $('gov-history-section').open=false;
      markDirty('record',false); renderRecords(); recordForm.elements.namedItem('title').focus();
    }
    function collectDetails() {
      const details={};
      for (const field of FIELDS[kind]) {
        const input=recordForm.elements.namedItem(`detail_${field.key}`);
        if (field.type==='checkbox') {details[field.key]=input.checked;continue;}
        const value=input.value.trim(); if(!value) continue;
        if(field.type==='money') {const [whole,fraction='']=value.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(cents))throw new Error('Enter an amount within a safe numerical range.');details[field.key]=cents;details.currency='AUD';}
        else if(field.type==='number') {const count=Number(value);if(!Number.isSafeInteger(count)||count<0)throw new Error(`Check ${field.label.toLowerCase()}.`);details[field.key]=count;}
        else details[field.key]=value;
      }
      if(kind==='decision' && details.eligibleVotes!==undefined) {const counted=['votesFor','votesAgainst','abstentions'].reduce((sum,key)=>sum+(details[key]||0),0);if(counted>details.eligibleVotes)throw new Error('The recorded votes and abstentions exceed the people entitled to vote. Check the counts.');}
      return details;
    }
    function collectRecord() {
      const data={}; for(const name of ['title','status','owner','dueDate','sourceRef','evidenceRef','body']) data[name]=formValue(recordForm,name);
      data.details=collectDetails();
      if(selected)data.expectedVersion=selected.version; else {data.id=pendingRecord?.id || crypto.randomUUID();data.kind=kind;}
      if(new TextEncoder().encode(JSON.stringify(data)).length>11000)throw new Error('This record is too long to save together. Split long annexures into separate records and use their references.');
      return data;
    }
    async function saveRecord(archive=false) {
      if(!workspace || busy)return; updateEvidenceRequired(); if(!archive && !recordForm.reportValidity())return;
      let payload; try {payload=collectRecord();if(archive)payload.status='archived';}catch(error){failure(error);return;}
      if(!selected && pendingRecord && JSON.stringify(payload)!==JSON.stringify(pendingRecord)) {notice('A previous save may have reached the server. Retry its unchanged details or reload the workspace before creating a changed record.',true,true);return;}
      if(!selected)pendingRecord=payload; setBusy(true);
      try {
        const result=await request(selected?`${currentPath()}/records/${encodeURIComponent(selected.id)}`:`${currentPath()}/records`,{method:selected?'PATCH':'POST',body:JSON.stringify(payload)});
        markDirty('record',false); selected=result.record; pendingRecord=null; openRecord(result.record); await loadRecords();
        notice(`${archive?'Archived':'Saved'} on the server. Version ${result.record.version}, recorded by ${result.record.updatedBy || result.record.createdBy}.`);
      }catch(error){if(error?.status>=400 && error.status<500 && error.status!==409)pendingRecord=null;failure(error,'The record could not be saved. Your text is still here.');}finally{setBusy(false);}
    }
    async function loadHistory() {
      if(!selected || !workspace)return;
      const list=$('gov-history-list'), id=selected.id;list.replaceChildren(node('li','Loading saved versions…'));
      try{
        const result=await request(`${currentPath()}/records/${encodeURIComponent(id)}/history`);if(selected?.id!==id)return;list.replaceChildren();
        for(const revision of result.revisions){const li=node('li');li.append(node('strong',`Version ${revision.version} · ${revision.actor}`),node('p',dateText(revision.createdAt)));
          const details=node('details'),summary=node('summary','Read this saved version');const snapshot=revision.snapshot?.record || revision.snapshot || {};
          const lines=[snapshot.title || '',`Status: ${STATUS[snapshot.status]||snapshot.status||''}`,`Owner: ${snapshot.owner||'Unassigned'}`,`Source: ${snapshot.sourceRef||'Not recorded'}`,`Evidence: ${snapshot.evidenceRef||'Not recorded'}`,snapshot.body||''];
          for(const field of FIELDS[snapshot.kind || kind] || [])if(snapshot.details?.[field.key]!==undefined)lines.push(`${field.label}: ${displayDetail(field,snapshot.details[field.key])}`);
          details.append(summary,node('pre',lines.join('\n\n')));li.append(details);list.append(li);
        }if(!result.revisions.length)list.append(node('li','No saved versions were returned.'));
        if(result.total>result.revisions.length)list.append(node('li',`Showing the latest ${result.revisions.length} of ${result.total} saved versions. Use the complete private workspace export to keep the full history.`));
      }catch(error){list.replaceChildren(node('li','Saved history is unavailable.'));failure(error);}
    }
    async function exportWorkspace() {
      if(!workspace||busy)return;setBusy(true);
      try{const value=await request(`${currentPath()}/export`);download(JSON.stringify(value,null,2),'application/json',`${slug(workspace.name)}-private-governance-${new Date().toISOString().slice(0,10)}.json`);notice('Private workspace and its saved history downloaded. Keep this file in authorised records storage.');}
      catch(error){failure(error);}finally{setBusy(false);}
    }
    async function preparePack(print=false) {
      if(!workspace||busy)return;setBusy(true);
      try{
        const value=await request(`${currentPath()}/export`);const all=value.records || value.data?.records || [];const selection=$('gov-pack-selection').value;
        const saved=all.filter(record=>record.status!=='archived' && (selection==='all'||(selection==='meeting' && ['meeting','decision'].includes(record.kind))||(selection==='rules' && record.kind==='rule')||(selection==='handover' && ['handover','asset'].includes(record.kind))));
        if(!saved.length){notice('There are no saved records in this pack selection. Save a record first.',true,true);return;}
        const contents=packHtml(value.workspace || workspace,saved);
        if(print){let area=$('gov-print-pack');if(!area){area=node('section',undefined,'gov-print-pack');area.id='gov-print-pack';document.body.append(area);}area.innerHTML=contents;area.hidden=false;document.body.classList.add('gov-printing');try{window.print();}finally{document.body.classList.remove('gov-printing');area.hidden=true;}}
        else {const html=`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(workspace.name)} | Private document pack</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1.25rem;color:#19243a}h1{font-size:2rem}h2{font-size:1.4rem}article{border-top:1px solid #bac4d5;margin-top:2rem;padding-top:1rem;break-inside:avoid}dl{display:grid;grid-template-columns:1fr 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}.reference{font-size:.9rem;overflow-wrap:anywhere}@media(max-width:600px){dl{grid-template-columns:1fr}dd{margin-bottom:.5rem}}@media print{body{font-size:11pt;margin:0}}</style></head><body>${contents}</body></html>`;download(html,'text/html',`${slug(workspace.name)}-${selection}-working-pack.html`);}
        notice('Prepared a private pack of saved records. Unsaved edits are not included.');
      }catch(error){failure(error);}finally{setBusy(false);}
    }
    async function addChecklist() {
      if(!workspace||busy||!canLeave())return;setBusy(true);let added=0;const target=workspace.id;
      try{
        let existing=[],page=1,total=Infinity;
        while(existing.length<total){const result=await request(`${currentPath()}/records?kind=task&page=${page}&pageSize=100`);existing.push(...result.records);total=result.total ?? existing.length;if(!result.records.length)break;page++;}
        const titles=new Set(existing.map(item=>item.title)),ids=new Set(existing.map(item=>item.id));
        for(const [index,[title,body]]of CHECKLIST.entries()){
          const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`ready-setco-formation-checklist-v1:${target}:${index}`))).slice(0,16);bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
          const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join(''),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
          if(titles.has(title)||ids.has(id))continue;
          const payload={id,kind:'task',title,status:'draft',owner:'',dueDate:'',sourceRef:workspace.jurisdiction==='QLD'?'https://www.qld.gov.au/community/fair-trading/associations-charities-and-non-for-profits/cooperatives/registering-a-cooperative':'Confirm the current local registrar guidance',evidenceRef:'',body,details:{milestone:title}};
          await request(`${BASE}/${encodeURIComponent(target)}/records`,{method:'POST',body:JSON.stringify(payload)});added++;
        }
        closeEditor();kind='task';kindFilter.value=kind;statusFilter.value='';savedStatusFilter='';recordPage=1;refreshModules();await loadRecords();notice(`Saved ${added} new formation ${added===1?'action':'actions'}. Existing checklist titles were retained. Assign owners and dates as the founding group agrees.`);
      }catch(error){failure(error,`Saved ${added} actions before the request stopped. Reload and use the checklist again to add missing titles.`);}finally{setBusy(false);}
    }
    function refreshModules(){for(const button of $('gov-modules').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));$('gov-current-module').textContent=TYPES[kind][0];$('gov-module-help').textContent=TYPES[kind][2];}
    async function changeKind(next){if(!canLeave()){kindFilter.value=kind;return;}setBusy(true);closeEditor();refreshSummary();kind=next;kindFilter.value=kind;recordPage=1;$('gov-record-search').value='';refreshModules();try{await loadRecords();}catch(error){failure(error);}finally{setBusy(false);}}
    options(kindFilter,Object.fromEntries(Object.entries(TYPES).map(([value,data])=>[value,data[0]])));
    options(statusFilter,STATUS,'All record statuses');options(recordForm.elements.namedItem('status'),STATUS);
    for(const form of [createForm,settingsForm]){options(form.elements.namedItem('jurisdiction'),JURISDICTIONS);options(form.elements.namedItem('cooperativeType'),COOP_TYPES);}
    options(settingsForm.elements.namedItem('stage'),STAGES);
    for(const [value,data]of Object.entries(TYPES)){const button=node('button');button.type='button';button.dataset.kind=value;button.append(node('strong',data[0],'gov-module-label'),node('span',data[1]));button.addEventListener('click',()=>changeKind(value));$('gov-modules').append(button);}refreshModules();
    for(const [title]of CHECKLIST)$('gov-template-list').append(node('li',title));
    select.addEventListener('change',async()=>{const id=select.value;if(!canLeave()){select.value=workspace?.id||'';return;}setBusy(true);try{await chooseWorkspace(id);notice(id?'Loaded the saved cooperative workspace.':'Choose a workspace or create one.');}catch(error){failure(error);}finally{setBusy(false);}});
    async function workspacePageTo(next){if(!canLeave())return;setBusy(true);try{await loadWorkspaces({page:next});notice('Choose a workspace from this page.');}catch(error){failure(error);}finally{setBusy(false);}}
    $('gov-workspaces-prev').addEventListener('click',()=>workspacePageTo(Math.max(1,workspacePage-1)));
    $('gov-workspaces-next').addEventListener('click',()=>workspacePageTo(workspacePage+1));
    createForm.addEventListener('input',()=>markDirty('create',true));createForm.addEventListener('change',()=>markDirty('create',true));
    createForm.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!createForm.reportValidity()||!canLeave({keepCreate:true}))return;
      const payload={id:createId || crypto.randomUUID(),...workspaceValues(createForm)};createId=payload.id;
      if(lastCreatePayload && JSON.stringify(payload)!==JSON.stringify(lastCreatePayload)){notice('A previous creation may have reached the server. Retry the unchanged details or reload before starting a different workspace.',true,true);return;}
      lastCreatePayload=payload;setBusy(true);
      try{const result=await request(BASE,{method:'POST',body:JSON.stringify(payload)});workspace=result.workspace;createId=null;lastCreatePayload=null;createForm.reset();markDirty('create',false);$('gov-create-section').open=false;await loadWorkspaces({keepId:workspace.id,page:1});await chooseWorkspace(workspace.id);notice('Cooperative workspace created and saved. Add actions or use the formation checklist to begin.');}
      catch(error){if(error?.status>=400 && error.status<500 && error.status!==409){createId=null;lastCreatePayload=null;}failure(error);}finally{setBusy(false);}
    });
    settingsForm.addEventListener('input',()=>markDirty('workspace',true));settingsForm.addEventListener('change',()=>{markDirty('workspace',true);updateRegistrationRequired();});
    settingsForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!workspace||busy)return;updateRegistrationRequired();if(!settingsForm.reportValidity())return;
      const payload={...workspaceValues(settingsForm),stage:formValue(settingsForm,'stage'),registrationRef:formValue(settingsForm,'registrationRef'),registrationDate:formValue(settingsForm,'registrationDate'),expectedVersion:workspace.version};setBusy(true);
      try{const result=await request(currentPath(),{method:'PATCH',body:JSON.stringify(payload)});workspace=result.workspace;refreshSummary();await loadWorkspaces({keepId:workspace.id});notice(`Workspace details saved, version ${workspace.version}.`);}catch(error){failure(error);}finally{setBusy(false);}
    });
    recordForm.addEventListener('input',()=>markDirty('record',true));recordForm.addEventListener('change',()=>{markDirty('record',true);updateEvidenceRequired();});recordForm.addEventListener('submit',event=>{event.preventDefault();saveRecord();});
    $('gov-record-archive').addEventListener('click',()=>{if(selected && window.confirm('Archive this record? Its saved history will remain available.'))saveRecord(true);});
    $('gov-create-record').addEventListener('click',()=>{if(canLeave()){refreshSummary();openRecord();}});
    $('gov-record-close').addEventListener('click',()=>{if(canLeave()){refreshSummary();closeEditor();renderRecords();}});
    kindFilter.addEventListener('change',()=>changeKind(kindFilter.value));
    statusFilter.addEventListener('change',async()=>{if(!canLeave()){statusFilter.value=savedStatusFilter;return;}setBusy(true);savedStatusFilter=statusFilter.value;closeEditor();recordPage=1;try{await loadRecords();}catch(error){failure(error);}finally{setBusy(false);}});
    $('gov-record-search').addEventListener('input',renderRecords);
    async function recordPageTo(next){if(!canLeave())return;setBusy(true);closeEditor();recordPage=next;try{await loadRecords();}catch(error){failure(error);}finally{setBusy(false);}}
    $('gov-record-prev').addEventListener('click',()=>recordPageTo(Math.max(1,recordPage-1)));$('gov-record-next').addEventListener('click',()=>recordPageTo(recordPage+1));
    $('gov-history-section').addEventListener('toggle',()=>{if($('gov-history-section').open)loadHistory();});
    $('gov-export').addEventListener('click',exportWorkspace);$('gov-pack-download').addEventListener('click',()=>preparePack());$('gov-pack-print').addEventListener('click',()=>preparePack(true));$('gov-template-add').addEventListener('click',addChecklist);
    $('gov-reload').addEventListener('click',async()=>{if(!canLeave())return;setBusy(true);try{const id=workspace?.id;await loadWorkspaces({keepId:id});if(id)await chooseWorkspace(id);notice('Reloaded the saved workspace.');}catch(error){failure(error);}finally{setBusy(false);}});
    window.addEventListener('beforeunload',event=>{if(recordDirty||workspaceDirty||createDirty||busy){event.preventDefault();event.returnValue='';}});
    host.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{if(!canLeave())event.preventDefault();}));
    const controller={load:async()=>{if(busy)return;setBusy(true);try{await loadWorkspaces();notice(workspaces.length?'Choose a cooperative workspace to continue.':'Ready to create the first cooperative workspace.');}catch(error){$('gov-controls').hidden=true;failure(error,'The private governance service is unavailable.');}finally{setBusy(false);}}};
    host.governanceController=controller;return controller;
  }
  window.ReadySetGovernance=Object.freeze({init});
})();
