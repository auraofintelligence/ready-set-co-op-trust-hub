import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { JSDOM } from 'jsdom';
import { createWorker } from '../cloudflare/worker.mjs';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';

const origin = 'http://localhost:8792';
const base = '/api/admin/governance/workspaces';
const html = readFileSync(new URL('../manage.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../governance-workspace.js', import.meta.url), 'utf8');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql', '0004_governance.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const token = 'fictional-governance-interface-token'.repeat(2);
  const env = { LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: token, DB: createSqliteD1(sqlite) };
  const worker = createWorker();
  const windows = [];
  let hold = null;
  t.after(() => { for (const window of windows) window.close(); sqlite.close(); });
  async function api(path, options = {}) {
    if (hold && ['POST', 'PATCH'].includes(options.method)) {
      const pending = hold; hold = null; pending.started(); await pending.gate;
    }
    const response = await worker.fetch(new Request(origin + path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    }), env);
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error); error.status = response.status; error.code = value.code; throw error; }
    return value;
  }
  function pauseNextWrite() {
    let release, start;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { start = resolve; });
    hold = { gate, started: start };
    return { release, started };
  }
  async function openUI() {
    const dom = new JSDOM(html, { url: origin + '/manage.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const window = dom.window; windows.push(window);
    Object.defineProperty(window, 'crypto', { value: crypto });
    window.TextEncoder = TextEncoder; window.Blob = Blob; window.confirm = () => true;
    const downloads = [];
    window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:fictional-governance-export'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {};
    window.eval(script);
    const $ = id => window.document.getElementById(id);
    const set = (form, name, value) => {
      const input = form.elements.namedItem(name); assert.ok(input, `Missing ${name}`);
      input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };
    const submit = form => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    async function waitFor(predicate) {
      for (let attempt = 0; attempt < 400; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error(`Timed out waiting for UI: ${$('gov-status').textContent}`);
    }
    const idle = () => waitFor(() => $('governance').getAttribute('aria-busy') === 'false');
    async function chooseKind(kind) {
      $('gov-kind').value = kind; $('gov-kind').dispatchEvent(new window.Event('change', { bubbles: true })); await idle();
    }
    async function chooseWorkspace(id) {
      $('gov-workspace-select').value = id;
      $('gov-workspace-select').dispatchEvent(new window.Event('change', { bubbles: true })); await idle();
    }
    await window.ReadySetGovernance.init({ request: api }).load();
    return { window, $, set, submit, waitFor, idle, chooseKind, chooseWorkspace, downloads };
  }
  async function createWorkspace(ui) {
    const form = ui.$('gov-create-workspace');
    ui.set(form, 'name', 'Fictional island cooperative'); ui.set(form, 'locality', 'Fictional test community'); ui.submit(form);
    await ui.idle(); assert.equal(ui.$('gov-active-workspace').hidden, false, ui.$('gov-status').textContent);
    const result = await api(base); assert.equal(result.total, 1); return result.workspaces[0];
  }
  return { api, openUI, createWorkspace, pauseNextWrite };
}

test('governance UI saves to the real Worker, locks edits during saves, preserves dirty conflicts and reloads persisted records', async t => {
  const f = fixture(t), ui = await f.openUI(), workspace = await f.createWorkspace(ui);
  ui.$('gov-create-record').click(); const form = ui.$('gov-record-form');
  ui.set(form, 'title', 'Prepare founding rules'); ui.set(form, 'detail_milestone', 'Rulebook discussion');
  const pending = f.pauseNextWrite(); ui.submit(form); await pending.started;
  assert.equal(form.elements.namedItem('title').matches(':disabled'), true, 'Editing is blocked while a submitted snapshot is being saved.');
  assert.equal(ui.$('gov-workspace-select').matches(':disabled'), true);
  pending.release(); await ui.idle(); assert.match(ui.$('gov-status').textContent, /Saved on the server/);
  const record = (await f.api(`${base}/${workspace.id}/records`)).records[0];
  assert.equal(record.title, 'Prepare founding rules'); assert.equal(record.createdBy, 'local_reviewer'); assert.equal(record.version, 1);
  assert.equal(form.elements.namedItem('title').matches(':disabled'), false);

  ui.set(form, 'body', 'Unsaved wording that must survive a conflict.');
  ui.window.confirm = () => false;
  await ui.chooseKind('rule');
  assert.equal(ui.$('gov-kind').value, 'task'); assert.equal(form.elements.namedItem('body').value, 'Unsaved wording that must survive a conflict.');
  const otherEdit = Object.fromEntries(['title', 'status', 'owner', 'dueDate', 'sourceRef', 'evidenceRef', 'body', 'details'].map(key => [key, record[key]]));
  otherEdit.body = 'A newer version saved by another session.'; otherEdit.expectedVersion = record.version;
  await f.api(`${base}/${workspace.id}/records/${record.id}`, { method: 'PATCH', body: JSON.stringify(otherEdit) });
  ui.submit(form); await ui.idle();
  assert.equal(ui.$('gov-status').dataset.kind, 'error'); assert.match(ui.$('gov-status').textContent, /unsaved text is still here/);
  assert.equal(form.elements.namedItem('body').value, 'Unsaved wording that must survive a conflict.'); assert.equal(ui.$('gov-record-dirty').hidden, false);
  assert.equal((await f.api(`${base}/${workspace.id}/records`)).records[0].body, otherEdit.body);

  const fresh = await f.openUI(); await fresh.chooseWorkspace(workspace.id);
  fresh.$('gov-record-list').querySelector('button').click();
  assert.equal(fresh.$('gov-record-form').elements.namedItem('body').value, otherEdit.body);
  assert.match(fresh.$('gov-saved-meta').textContent, /Version 2/);
  assert.equal(fresh.window.localStorage.length, 0, 'Private records and session tokens are not stored in browser storage.');
});

test('governance UI exports escaped saved documents and repeats the formation checklist without duplicating records', async t => {
  const f = fixture(t), ui = await f.openUI(), workspace = await f.createWorkspace(ui);
  await ui.chooseKind('rule'); ui.$('gov-create-record').click();
  const form = ui.$('gov-record-form');
  ui.set(form, 'title', '<img src=x onerror=alert(1)>');
  ui.set(form, 'detail_proposedText', 'A fictional clause containing <script>untrusted()</script>.');
  ui.submit(form); await ui.idle();
  assert.match(ui.$('gov-status').textContent, /Saved on the server/);
  assert.equal(ui.window.document.querySelectorAll('#gov-record-list img').length, 0);
  ui.$('gov-pack-selection').value = 'rules'; ui.$('gov-pack-download').click(); await ui.idle();
  assert.equal(ui.downloads.length, 1);
  const exported = await ui.downloads[0].text();
  assert.match(exported, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(exported, /&lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.ok(!exported.includes('<script>')); assert.match(exported, /Content-Security-Policy/);
  assert.match(exported, /local_reviewer/);

  ui.$('gov-template-add').click(); await ui.idle(); assert.match(ui.$('gov-status').textContent, /Saved 12 new formation actions/);
  const before = (await f.api(`${base}/${workspace.id}/records?kind=task`)).records;
  const fresh = await f.openUI(); await fresh.chooseWorkspace(workspace.id);
  fresh.$('gov-template-add').click(); await fresh.idle(); assert.match(fresh.$('gov-status').textContent, /Saved 0 new formation actions/);
  const after = (await f.api(`${base}/${workspace.id}/records?kind=task`)).records;
  assert.equal(after.length, 12); assert.deepEqual(after.map(record => record.id).sort(), before.map(record => record.id).sort());
  const exportedWorkspace = await f.api(`${base}/${workspace.id}/export`);
  assert.equal(exportedWorkspace.records.length, 13); assert.equal(exportedWorkspace.recordRevisions.length, 13);
});
