import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../formation-planner.html',import.meta.url),'utf8');
const data = await readFile(new URL('../formation-data.js',import.meta.url),'utf8');
const script = await readFile(new URL('../formation.js',import.meta.url),'utf8');
const key = 'ready-setco:formation-plan:v1';
function page(saved) {
  const dom=new JSDOM(html,{url:'https://ready-setco.example/formation-planner.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
  const downloads=[];
  w.fetch=()=>{throw new Error('A public formation draft must never make a network request.');};
  w.confirm=()=>true;
  w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:fictional-download';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  if(saved)w.localStorage.setItem(key,saved);
  w.eval(data);w.eval(script);
  const set=(form,name,value)=>{const input=d.querySelector(form).elements.namedItem(name);input.value=String(value);input.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {dom,w,d,set,downloads};
}
test('public planner keeps capital separate, excludes shares for the no-share structure and restores an explicitly saved draft',()=>{
  const f=page();
  try {
    assert.equal(f.w.localStorage.length,0);
    f.set('#formation-plan','name','Fictional community co-op');f.set('#formation-plan','purpose','A shared workshop for a test community.');
    for(const [name,value] of Object.entries({members:10,share:100,fee:25,revenue:1500,costs:1200,reserve:200,startup:1500,funds:300}))f.set('#finance-plan',name,value);
    const results=()=>[...f.d.querySelectorAll('#finance-output dd')].map(x=>x.textContent);
    assert.deepEqual(results(),['$1,000.00','$1,750.00','$350.00','-$200.00']);
    f.set('#finance-plan','share',-100);f.set('#formation-plan','structure','non-distributing-no-shares');
    assert.deepEqual(results(),['$0.00','$1,750.00','$350.00','-$1,200.00']);
    assert.equal(f.d.querySelector('#finance-plan').elements.namedItem('share').disabled,true);
    const leaving=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(leaving);assert.equal(leaving.defaultPrevented,true);
    f.d.querySelector('#plan-save').click();const saved=f.w.localStorage.getItem(key);assert.ok(saved);assert.equal(JSON.parse(saved).budget.share,0);
    const restored=page(saved);try{assert.equal(restored.d.querySelector('#formation-plan').elements.namedItem('name').value,'Fictional community co-op');assert.equal(restored.d.querySelector('#formation-plan').elements.namedItem('purpose').value,'A shared workshop for a test community.');assert.match(restored.d.querySelector('#plan-status').textContent,/Restored/);}finally{restored.dom.window.close();}
    f.set('#formation-plan','jurisdiction','NSW');assert.match(f.d.querySelector('#jurisdiction-note').textContent,/has not been legally reviewed/);
  }finally{f.dom.window.close();}
});
test('invalid imports preserve the on-screen plan, and blocked storage is reported rather than claiming success',async()=>{
  const f=page();
  try{
    f.set('#formation-plan','name','Keep this draft');f.d.querySelector('#plan-save').click();const valid=JSON.parse(f.w.localStorage.getItem(key));
    const invalid={...valid,unexpected:'must reject'};const input=f.d.querySelector('#plan-import');
    Object.defineProperty(input,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(invalid)}]});
    input.dispatchEvent(new f.w.Event('change',{bubbles:true}));await new Promise(r=>setImmediate(r));
    assert.match(f.d.querySelector('#plan-status').textContent,/not imported/);assert.equal(f.d.querySelector('#formation-plan').elements.namedItem('name').value,'Keep this draft');
    Object.defineProperty(f.w,'localStorage',{configurable:true,value:{setItem(){throw new Error('Storage unavailable');}}});
    f.d.querySelector('#plan-save').click();assert.equal(f.d.querySelector('#plan-status').dataset.error,'true');assert.match(f.d.querySelector('#plan-status').textContent,/Could not save/);
    f.d.querySelector('[data-template="meeting"]').click();assert.equal(f.downloads.length,1);assert.match(f.d.querySelector('#template-status').textContent,/Formation meeting/);
  }finally{f.dom.window.close();}
});
