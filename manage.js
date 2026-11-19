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
  const interestNames = { events: 'Events & guest services', tourism: 'Tours & visitor experiences', training: 'Training & mentoring', employment: 'Paid work', working_holiday: 'Working holiday / specified-work enquiry', grants: 'Grants & projects', media: 'Notices, news & media', mapping: 'Local mapping & information checks', support: 'Administration & compliance support', resources: 'Shared resources & expertise', founding: 'Cooperative formation' };
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
    summary('Interests', record.interests.map(value => interestNames[value] || value).join(', ')); summary('Idea, offer or need', record.offer);
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
  const mapFilter = document.querySelector('#map-review-filter');
  const mapList = document.querySelector('#map-queue-list');
  const mapDecision = document.querySelector('#map-review-decision');
  const mapArchive = document.querySelector('#map-archive-form');
  let mapOffset = 0; let placeOffset = 0; let mapSelected = null; let publishedPlaces = [];
  const pageSize = 20;
  const categoryNames = { business: 'Business', bus_stop: 'Bus stop / shelter', picnic: 'Picnic facilities', seat: 'Seat', toilet: 'Toilets', club: 'Club', beach: 'Beach', water: 'Drinking water', other: 'Other place' };
  function mapNotice(message, error = false) {
    const element = document.querySelector('#map-review-status');
    if (!element) return;
    element.textContent = message; element.dataset.kind = error ? 'error' : 'success'; element.hidden = false;
  }
  function mapSummary(label, value) {
    document.querySelector('#map-suggestion-summary').append(cell(label, 'dt'), cell(value, 'dd'));
  }
  function openMapSuggestion(suggestion) {
    mapSelected = suggestion;
    const value = suggestion.data;
    document.querySelector('#map-suggestion-title').textContent = value.name;
    document.querySelector('#map-suggestion-summary').replaceChildren();
    mapSummary('Request', suggestion.placeId ? 'Correction to an existing place' : 'New place');
    mapSummary('Type', categoryNames[value.category] || value.category);
    mapSummary('Selected position', `${value.latitude}, ${value.longitude}`);
    mapSummary('Finding it', value.locationDescription);
    mapSummary('Helpful information', value.description);
    mapSummary('Access', value.access); mapSummary('Step-free access', value.wheelchair);
    mapSummary('Facilities', value.facilities.join(', '));
    if (value.category === 'bus_stop') mapSummary('Bus stop marking', value.stopMarking);
    mapSummary('Source', value.sourceType); mapSummary('Observed on', value.observedOn);
    mapSummary('Public credit', value.publicCredit || 'No public credit requested');
    if (value.sourceUrl) {
      const source = new URL(value.sourceUrl);
      if (['https:', 'http:'].includes(source.protocol) && !source.username && !source.password) {
        const dt = cell('Source website', 'dt'); const dd = document.createElement('dd'); const link = document.createElement('a');
        link.href = source.href; link.textContent = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; dd.append(link);
        document.querySelector('#map-suggestion-summary').append(dt, dd);
      }
    }
    mapSummary('Stage', suggestion.status); mapSummary('Reference', suggestion.id);
    mapDecision.elements.namedItem('notes').value = suggestion.reviewNotes || '';
    for (const element of mapDecision.elements) element.disabled = suggestion.status !== 'pending';
    document.querySelector('#map-suggestion-detail').hidden = false;
  }
  async function loadMapQueue() {
    if (!mapFilter || !mapList) return;
    document.querySelector('#map-review-count').textContent = 'Loading suggestions…';
    try {
      const query = new URLSearchParams({status: mapFilter.elements.namedItem('status').value, limit: String(pageSize), offset: String(mapOffset)});
      const result = await request(`/api/admin/map/suggestions?${query}`);
      mapList.replaceChildren();
      for (const suggestion of result.suggestions) {
        const row = document.createElement('div'); row.className = 'map-queue-row';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = suggestion.data.name;
        button.addEventListener('click', () => openMapSuggestion(suggestion));
        const hint = document.createElement('span'); hint.className = 'field-hint'; hint.textContent = `${suggestion.placeId ? 'Correction' : 'New place'} · ${categoryNames[suggestion.data.category] || suggestion.data.category} · ${suggestion.status}`;
        row.append(button, hint); mapList.append(row);
      }
      document.querySelector('#map-review-count').textContent = `${result.total} matching ${result.total === 1 ? 'suggestion' : 'suggestions'}. ${result.suggestions.length ? 'Choose one to review.' : ''}`;
      document.querySelector('#map-queue-page').textContent = `Page ${Math.floor(mapOffset / pageSize) + 1}`;
      document.querySelector('#map-queue-previous').disabled = mapOffset === 0;
      document.querySelector('#map-queue-next').disabled = !result.hasMore;
    } catch (error) { mapNotice(error.message, true); document.querySelector('#map-review-count').textContent = 'Suggestions are unavailable.'; }
  }
  async function reviewMap(decision) {
    if (!mapSelected || mapSelected.status !== 'pending' || !mapDecision.reportValidity()) return;
    for (const element of mapDecision.elements) element.disabled = true;
    try {
      await request(`/api/admin/map/suggestions/${encodeURIComponent(mapSelected.id)}/review`, {method:'POST', body:JSON.stringify({decision, expectedUpdatedAt:mapSelected.updatedAt, notes:mapDecision.elements.namedItem('notes').value})});
      mapNotice(decision === 'publish' ? 'Published. This information can now appear on the public map.' : 'Suggestion declined. The private history has been retained.');
      mapSelected = null; document.querySelector('#map-suggestion-detail').hidden = true;
      await loadMapQueue(); await loadPublishedPlaces();
    } catch (error) { mapNotice(error.message, true); }
    finally { for (const element of mapDecision.elements) element.disabled = false; }
  }
  async function loadPublishedPlaces() {
    if (!mapArchive) return;
    try {
      const result = await request(`/api/map/places?limit=${pageSize}&offset=${placeOffset}`);
      publishedPlaces = result.features;
      const select = mapArchive.elements.namedItem('place'); select.replaceChildren();
      const first = document.createElement('option'); first.value = ''; first.textContent = 'Choose a place'; select.append(first);
      for (const feature of publishedPlaces) { const option = document.createElement('option'); option.value = feature.id; option.textContent = feature.properties.name; select.append(option); }
      document.querySelector('#map-place-page').textContent = `Page ${Math.floor(placeOffset / pageSize) + 1}`;
      document.querySelector('#map-place-previous').disabled = placeOffset === 0;
      document.querySelector('#map-place-next').disabled = !result.metadata.hasMore;
    } catch (error) { mapNotice(error.message, true); }
  }
  if (mapFilter && mapList && mapDecision && mapArchive) {
    mapFilter.addEventListener('submit', event => { event.preventDefault(); mapOffset = 0; loadMapQueue(); });
    document.querySelector('#map-queue-previous').addEventListener('click', () => { mapOffset = Math.max(0,mapOffset-pageSize); loadMapQueue(); });
    document.querySelector('#map-queue-next').addEventListener('click', () => { mapOffset += pageSize; loadMapQueue(); });
    mapDecision.addEventListener('submit', event => { event.preventDefault(); reviewMap('publish'); });
    document.querySelector('#map-reject').addEventListener('click', () => reviewMap('reject'));
    document.querySelector('#map-place-previous').addEventListener('click', () => { placeOffset = Math.max(0,placeOffset-pageSize); loadPublishedPlaces(); });
    document.querySelector('#map-place-next').addEventListener('click', () => { placeOffset += pageSize; loadPublishedPlaces(); });
    mapArchive.addEventListener('submit', async event => {
      event.preventDefault(); if (!mapArchive.reportValidity()) return;
      const selectedPlace = publishedPlaces.find(feature => feature.id === mapArchive.elements.namedItem('place').value);
      if (!selectedPlace) return;
      const button = mapArchive.querySelector('button[type=submit]'); button.disabled = true;
      try { await request(`/api/admin/map/places/${encodeURIComponent(selectedPlace.id)}`, {method:'PATCH',body:JSON.stringify({status:'archived',expectedVersion:selectedPlace.properties.version,reason:mapArchive.elements.namedItem('reason').value})}); mapNotice('Removed from the public map. The place and its history remain in the private register.'); mapArchive.reset(); await loadPublishedPlaces(); }
      catch(error) { mapNotice(error.message,true); } finally { button.disabled = false; }
    });
    document.querySelector('#export-map-register').addEventListener('click', async () => {
      try { const value = await request('/api/admin/map/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = `ready-setco-private-map-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); mapNotice('Private map register downloaded. Keep it in your private operations storage.'); }
      catch(error) { mapNotice(error.message,true); }
    });
  }
  if (local) {
    document.querySelector('#local-login').hidden = false;
    document.querySelector('#local-login-form').addEventListener('submit', event => { event.preventDefault(); token = event.target.elements.namedItem('token').value; event.target.reset(); document.querySelector('#local-login').hidden = true; load(); loadMapQueue(); loadPublishedPlaces(); });
    document.querySelector('#review-count').textContent = 'Enter the local session token to load records.';
  } else { load(); loadMapQueue(); loadPublishedPlaces(); }
})();
