(() => {
  const rows = document.querySelector('#participants');
  if (!rows) return;
  const feedback = document.querySelector('#review-status');
  const filter = document.querySelector('#review-filter');
  const editor = document.querySelector('#participant-review');
  const apiBase = (window.READY_SETCO?.apiBase || '').replace(/\/$/, '');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (apiBase && new URL(apiBase).origin !== location.origin && !local) {
    location.replace(new URL('/manage.html', apiBase));
    return;
  }
  let token = ''; let page = 1; let records = []; let selected = null;
  const stages = { interest: 'Interest received', contacted: 'Contacted', pilot_partner: 'Pilot partner agreed', founding_interest: 'Interested in founding', withdrawn: 'Withdrawn' };
  function notice(message, error = false) { feedback.textContent = message; feedback.dataset.kind = error ? 'error' : 'success'; feedback.hidden = false; }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token && local) headers.set('Authorization', `Bearer ${token}`);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    const value = await response.json().catch(() => null);
    if (!response.ok || !value) throw new Error(value?.error || (response.status === 401 ? 'Sign in with your authorised organiser account, then reload this page.' : 'The organiser service is unavailable. Please try again.'));
    return value;
  }
  function cell(text, tag = 'td') { const element = document.createElement(tag); element.textContent = text || '—'; return element; }
  function summary(label, value) { document.querySelector('#participant-summary').append(cell(label, 'dt'), cell(value, 'dd')); }
  function openRecord(record) {
    selected = record; const detail = document.querySelector('#participant-detail');
    document.querySelector('#participant-summary').replaceChildren();
    document.querySelector('#detail-title').textContent = record.name;
    summary('Contact', [record.email, record.phone].filter(Boolean).join('\n'));
    summary('Organisation / role', [record.organisation, record.participantType].filter(Boolean).join('\n'));
    summary('Interests', record.interests.join(', ')); summary('Idea, offer or need', record.offer);
    summary('Original operator', record.initialOperatingEntityId === 'sbt' ? 'Strange But True' : record.initialOperatingEntityId);
    summary('Authority confirmed', record.authorityConfirmed ? 'Yes' : 'Individual enquiry');
    summary('Contact consent', `${record.consentContact ? 'Agreed' : 'Not agreed'} · version ${record.consentVersion}`);
    summary('Future cooperative handover consent', record.consentFutureHandover ? 'Agreed; handover still requires a separate record' : 'Not given');
    summary('Reference', record.id);
    editor.elements.namedItem('status').value = record.status; editor.elements.namedItem('notes').value = record.notes || ''; detail.hidden = false;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function load() {
    document.querySelector('#review-count').textContent = 'Loading records…';
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20', search: filter.elements.namedItem('search').value.trim(), status: filter.elements.namedItem('status').value });
      const result = await request(`/api/admin/participants?${query}`);
      records = result.participants; rows.replaceChildren();
      for (const record of records) {
        const row = document.createElement('tr'); const nameCell = document.createElement('td');
        const button = document.createElement('button'); button.textContent = record.name; button.type = 'button'; button.addEventListener('click', () => openRecord(record));
        nameCell.append(button, cell(record.organisation || record.email, 'small'));
        row.append(nameCell, cell(record.participantType), cell(stages[record.status] || record.status), cell(new Date(record.createdAt).toLocaleDateString('en-AU'))); rows.append(row);
      }
      document.querySelector('#review-count').textContent = `${result.total} matching ${result.total === 1 ? 'record' : 'records'}. ${records.length ? 'Choose a name to review.' : 'New expressions of interest will appear here.'}`;
      document.querySelector('#page-label').textContent = `Page ${page}`;
      document.querySelector('#previous-page').disabled = page <= 1;
      document.querySelector('#next-page').disabled = page * 20 >= result.total;
    } catch (error) { rows.replaceChildren(); document.querySelector('#review-count').textContent = 'Records are unavailable.'; notice(error.message, true); }
  }
  filter.addEventListener('submit', event => { event.preventDefault(); page = 1; load(); });
  document.querySelector('#previous-page').addEventListener('click', () => { page--; load(); });
  document.querySelector('#next-page').addEventListener('click', () => { page++; load(); });
  editor.addEventListener('submit', async event => {
    event.preventDefault(); if (!selected) return;
    const save = document.querySelector('#save-review'); save.disabled = true;
    try {
      await request(`/api/admin/participants/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: JSON.stringify({ status: editor.elements.namedItem('status').value, notes: editor.elements.namedItem('notes').value, expectedUpdatedAt: selected.updatedAt }) });
      notice('Review saved. The change is recorded in the private history.');
      selected = null; document.querySelector('#participant-detail').hidden = true; await load();
    } catch (error) { notice(error.message, true); } finally { save.disabled = false; }
  });
  document.querySelector('#export-register').addEventListener('click', async () => {
    try {
      const value = await request('/api/admin/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `ready-setco-private-register-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Private register exported. Keep the downloaded file in your private operations storage.');
    } catch (error) { notice(error.message, true); }
  });
  if (local) {
    document.querySelector('#local-login').hidden = false;
    document.querySelector('#local-login-form').addEventListener('submit', event => { event.preventDefault(); token = event.target.elements.namedItem('token').value; event.target.reset(); document.querySelector('#local-login').hidden = true; load(); });
    document.querySelector('#review-count').textContent = 'Enter the local session token to load records.';
  } else load();
})();
