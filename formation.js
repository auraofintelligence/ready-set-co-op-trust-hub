(() => {
  'use strict';
  const data = window.READY_FORMATION;
  if (!data) return;
  const $ = selector => document.querySelector(selector);
  const plan = $('#formation-plan');
  const finance = $('#finance-plan');
  const storageKey = 'ready-setco:formation-plan:v1';
  const textFields = {name:160,locality:160,purpose:1800,activities:1800,questions:1800};
  const jurisdictions = ['QLD','NSW','VIC','SA','WA','TAS','NT','ACT','other'];
  const structures = ['undecided','distributing','non-distributing-shares','non-distributing-no-shares'];
  const progressValues = ['not-started','discussing','ready-for-review','evidence-held'];
  const budgetKeys = ['members','share','fee','revenue','costs','reserve','startup','funds'];
  let dirty = false;
  const message = (text, error = false) => {
    const target = $('#plan-status') || $('#template-status');
    if (target) { target.textContent = text; target.dataset.error = String(error); }
  };
  const date = () => new Date().toISOString();
  const field = (form, name) => form.elements.namedItem(name);
  const safeName = name => (name || 'cooperative').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70) || 'cooperative';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
  function budgetValues() {
    const result = {};
    for (const key of budgetKeys) {
      if (key === 'share' && field(plan,'structure').value === 'non-distributing-no-shares') { result[key] = 0; continue; }
      const input = field(finance,key);
      const value = input.value.trim() === '' ? 0 : Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > (key === 'members' ? 1000000 : 1000000000) || (key === 'members' && !Number.isInteger(value))) throw new Error('Enter non-negative numbers within the displayed limits. Members must be a whole number.');
      result[key] = value;
    }
    return result;
  }
  function calculate(b, structure) {
    const shareCapital = structure === 'non-distributing-no-shares' ? 0 : b.members * b.share;
    const annualRevenue = b.members * b.fee + b.revenue;
    return {shareCapital,annualRevenue,operatingBalance:annualRevenue-b.costs-b.reserve,startupBalance:shareCapital+b.funds-b.startup};
  }
  function renderBudget() {
    if (!finance || !plan) return;
    const output = $('#finance-output');
    const noShares = field(plan,'structure').value === 'non-distributing-no-shares';
    field(finance,'share').disabled = noShares;
    $('#finance-note').textContent = noShares ? 'This structure has no share capital. The share contribution is excluded from the calculation.' : 'Share capital is a one-off capital contribution in this scenario. Annual fees are trading income. Check the chosen structure and detailed funding terms.';
    try {
      const result = calculate(budgetValues(),field(plan,'structure').value);
      const money = value => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2}).format(value);
      const list = document.createElement('dl');
      for (const [label,value] of [['One-off member share capital',result.shareCapital],['Annual revenue, including fees',result.annualRevenue],['Annual balance after costs and reserve',result.operatingBalance],['Start-up funding balance',result.startupBalance]]) {
        const term=document.createElement('dt'), detail=document.createElement('dd'); term.textContent=label;detail.textContent=money(value);list.append(term,detail);
      }
      const explanation=document.createElement('p');explanation.className='hub-subtle';explanation.style.marginTop='1rem';
      explanation.textContent = result.startupBalance < 0 ? `The start-up plan has an unfunded gap of ${money(-result.startupBalance)}.` : `Start-up funds exceed the listed start-up costs by ${money(result.startupBalance)}.`;
      output.replaceChildren(list,explanation);
    } catch(error) { output.textContent=error.message; }
  }
  function collect() {
    const fields = {};
    for (const key of Object.keys(textFields)) fields[key]=field(plan,key).value.trim();
    fields.jurisdiction=field(plan,'jurisdiction').value;
    fields.structure=field(plan,'structure').value;
    const progress={};
    for(const step of data.steps) progress[step.id]=field(plan,'step-'+step.id).value;
    return {format:'ready-setco-formation-plan',schemaVersion:1,sourceVersion:data.version,exportedAt:date(),fields,progress,budget:budgetValues()};
  }
  function validate(value) {
    if (!onlyKeys(value,['format','schemaVersion','sourceVersion','exportedAt','fields','progress','budget']) || value.format!=='ready-setco-formation-plan' || value.schemaVersion!==1 ||
      typeof value.sourceVersion!=='string' || value.sourceVersion.length>80 || typeof value.exportedAt!=='string' || value.exportedAt.length>40 || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('This file is not a supported formation plan.');
    if(!onlyKeys(value.fields,[...Object.keys(textFields),'jurisdiction','structure']) || !jurisdictions.includes(value.fields.jurisdiction) || !structures.includes(value.fields.structure)) throw new Error('The plan has unsupported fields or choices.');
    for(const [key,max] of Object.entries(textFields)) if(typeof value.fields[key]!=='string' || value.fields[key].length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.fields[key])) throw new Error('A plan text field is missing or too long.');
    if(!onlyKeys(value.progress,data.steps.map(s=>s.id)) || !data.steps.every(s=>progressValues.includes(value.progress[s.id]))) throw new Error('The plan progress is incomplete or unsupported.');
    if(!onlyKeys(value.budget,budgetKeys) || !budgetKeys.every(k=>typeof value.budget[k]==='number' && Number.isFinite(value.budget[k]) && value.budget[k]>=0 && value.budget[k]<=(k==='members'?1000000:1000000000)) || !Number.isInteger(value.budget.members)) throw new Error('The plan contains invalid budget amounts.');
    return value;
  }
  function updateJurisdiction() {
    if(!plan) return;
    $('#jurisdiction-note').textContent=field(plan,'jurisdiction').value==='QLD' ? 'Queensland guidance is available in this hub. Confirm the current requirements before a formal step.' : 'This jurisdiction has not been legally reviewed in this hub. Use this plan for discussion and confirm its registration pathway, law and model rules with the local regulator.';
  }
  function apply(value) {
    validate(value);
    for(const key of [...Object.keys(textFields),'jurisdiction','structure'])field(plan,key).value=value.fields[key];
    for(const step of data.steps)field(plan,'step-'+step.id).value=value.progress[step.id];
    for(const key of budgetKeys)field(finance,key).value=String(value.budget[key]);
    updateJurisdiction();renderBudget();
  }
  function download(text,name,type='text/plain;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([text],{type}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function planText(value) {
    const result=calculate(value.budget,value.fields.structure);
    return ['# '+(value.fields.name || 'Proposed cooperative')+' formation discussion brief','', 'DRAFT FOR DISCUSSION. This is not a registration, adopted rulebook or evidence of approval.', '', 'Prepared: '+value.exportedAt, 'Locality: '+value.fields.locality, 'Jurisdiction: '+value.fields.jurisdiction, 'Structure for discussion: '+value.fields.structure, '', '## Local purpose', value.fields.purpose || '[To discuss]', '', '## Activities and active membership',value.fields.activities || '[To discuss]','', '## Questions',value.fields.questions || '[To discuss]', '', '## Formation progress',...data.steps.flatMap(s=>['',s.title+': '+value.progress[s.id],s.prompt,'Evidence to retain: '+s.evidence]),'', '## Budget assumptions (AUD)',...Object.entries(value.budget).map(([key,amount])=>key+': '+amount),'','## Scenario results (AUD)',...Object.entries(result).map(([key,amount])=>key+': '+amount),'','Capital and annual trading are separate. Balances are before separate tax and financing adjustments; they are not dividends or a viability assessment.','','## Reference sources',...Object.values(data.sources).map(s=>s.title+': '+s.url),'','Source review: '+data.checked+'. Other jurisdictions need local review.',''].join('\n');
  }
  function draftChanged() { dirty=true;message('Unsaved changes. Save on this device or download your plan.');updateJurisdiction();renderBudget(); }
  if(plan && finance) {
    plan.addEventListener('submit',event=>event.preventDefault());finance.addEventListener('submit',event=>event.preventDefault());
    plan.addEventListener('input',draftChanged);plan.addEventListener('change',event=>{if(event.target.id!=='plan-import')draftChanged();});finance.addEventListener('input',draftChanged);
    $('#plan-save').addEventListener('click',()=>{try{const value=validate(collect());localStorage.setItem(storageKey,JSON.stringify(value));dirty=false;message('Saved on this device at '+new Date().toLocaleTimeString('en-AU')+'. Nothing was sent to the organiser.');}catch(error){message('Could not save: '+error.message+' You can download a copy instead.',true);}});
    $('#plan-json').addEventListener('click',()=>{try{const value=validate(collect());download(JSON.stringify(value,null,2)+'\n',safeName(value.fields.name)+'-formation-plan.json','application/json');message('Plan download prepared. Keep the file somewhere you can find again.');}catch(error){message(error.message,true);}});
    $('#plan-text').addEventListener('click',()=>{try{const value=validate(collect());download(planText(value),safeName(value.fields.name)+'-founder-brief.md');message('Discussion brief download prepared. The draft remains on screen.');}catch(error){message(error.message,true);}});
    $('#plan-new').addEventListener('click',()=>{
      if(!window.confirm('Start a blank plan for another community? Current on-screen changes will be cleared. Download anything you want to keep first.'))return;
      plan.reset();finance.reset();for(const key of Object.keys(textFields))field(plan,key).value='';
      dirty=true;updateJurisdiction();renderBudget();message('Blank community plan started. A previously saved device draft remains until you save this plan or remove it.');field(plan,'name').focus();
    });
    $('#plan-clear').addEventListener('click',()=>{
      if(!window.confirm('Remove the saved formation plan from this device? The plan currently on screen and downloaded files will stay.'))return;
      try{localStorage.removeItem(storageKey);dirty=true;message('Saved device draft removed. The current plan is still on screen.');}catch{message('This browser could not remove the saved draft.',true);}
    });
    $('#plan-import').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>50*1024)throw new Error('Choose a plan file smaller than 50 KB.');const value=validate(JSON.parse(await file.text()));
        if(!window.confirm('Replace the plan on screen with this imported draft? Download current changes first if you need to keep them.'))return;
        apply(value);dirty=true;message('Draft imported for review. It has not been saved on this device.');
      }catch(error){message('Plan not imported: '+error.message,true);}finally{event.target.value='';}
    });
    try{
      const saved=localStorage.getItem(storageKey);
      if(new URLSearchParams(location.search).get('new')==='community'){plan.reset();finance.reset();for(const key of Object.keys(textFields))field(plan,key).value='';message('Blank plan for another community. Any existing saved device draft remains unchanged.');}
      else if(saved){if(saved.length>50*1024)throw new Error('Saved draft is too large.');apply(JSON.parse(saved));message('Restored the saved device draft. Review it before making new decisions.');}
      else message('No draft saved on this device. You choose when to save.');
    }catch{message('The saved draft could not be loaded. You can start a new plan or import a downloaded copy.',true);}
    updateJurisdiction();renderBudget();
    window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  }
  for(const button of document.querySelectorAll('[data-template]'))button.addEventListener('click',()=>{
    const template=data.templates[button.dataset.template];if(!template)return;
    const name=plan?field(plan,'name').value.trim():'';
    const locality=plan?field(plan,'locality').value.trim():'';
    const text=['# '+template.title,'','DRAFT PREPARATION WORKBOOK. Not an adopted rulebook, regulator form, approval or registration.','','Proposed cooperative: '+(name||'[Name]'),'Locality: '+(locality||'[Locality]'),'Prepared: '+date(),'',...template.sections.flatMap(heading=>['## '+heading,'','[Complete with the founding group. Record unresolved questions and evidence references.]','']),'## Official sources','',...Object.values(data.sources).map(s=>'- '+s.title+': '+s.url),'','Queensland reference review: '+data.checked+'. Confirm current local requirements before a formal step.',''].join('\n');
    try{download(text,safeName(name)+'-'+button.dataset.template+'.md');$('#template-status').textContent='Workbook download prepared: '+template.title+'.';}catch{$('#template-status').textContent='Download could not be prepared in this browser.';}
  });
  const search=$('#law-search');
  if(search){$('[data-law-filter]').hidden=false;const topics=[...document.querySelectorAll('[data-law-topic]')];const original=topics.map(node=>({node,text:(node.dataset.lawTopic+' '+node.textContent).toLowerCase()}));
    search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();let count=0;for(const {node,text} of original){node.hidden=Boolean(query&&!text.includes(query));if(!node.hidden)count++;}$('#law-results').textContent=count+' of '+topics.length+' topics shown.';$('#law-empty').hidden=count!==0;});
  }
})();
