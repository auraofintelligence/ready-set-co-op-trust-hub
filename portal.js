(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('portal-status')) return;
  const CONSENT_VERSION = '2026-11-27';
  const INTERESTS = { founding: 'Forming the cooperative', employment: 'Paid work', training: 'Training and learning', events: 'Events', grants: 'Grants', resources: 'Shared resources', media: 'Media and notices', support: 'Practical support', mapping: 'Community map', working_holiday: 'Working holiday work', tourism: 'Tourism' };
  const STATUS = { submitted: 'Submitted', in_review: 'Under review', more_info: 'More information requested', accepted_participant: 'Participation accepted', declined: 'Declined', withdrawn: 'Withdrawn', admitted: 'Cooperative admission recorded', active: 'Active', invited: 'Invited', disabled: 'Disabled', participant: 'Participant', committee: 'Committee', none: 'No group access', pending: 'Pending', expired: 'Expired', accepted: 'Accepted', cancelled: 'Cancelled' };
  const state = { identity: null, profile: null, participantView: false, participantLoaded: false, sites: [], groups: [], applications: [], committeeSites: [], accounts: [], accountTotal: 0, accountPage: 1, accountSearch: '', invitations: [], invitationTotal: 0, invitationPage: 1, invitationSearch: '', invitationContext: null, selectedAccount: null, selectedApplication: null, selectedSite: null, selectedGroup: '', selectedCommittee: '', selectedPost: null, roleAssignment: null, allSites: [], recoveryCodes: [], recoveryUsername: '', token: '', authMode: '', busy: false, profileDirty: false };
  const retries = new Map();
  const controls = new Map();
  const passwordTasks = new Map();
  let passwordWorker = null, passwordRequest = 0, authRevision = 0;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function field(form, name) { return form.elements.namedItem(name); }
  function value(form, name) { return field(form, name)?.value?.trim() || ''; }
  function checked(form, name) { return field(form, name)?.checked === true; }
  function readPassword(form, name = 'password', confirm = false) {
    const raw = field(form, name).value;
    const repeated = confirm ? field(form, 'confirmPassword').value : '';
    if (raw.length > 1024 || repeated.length > 1024) throw new Error('Use no more than 128 characters.');
    const password = raw.normalize('NFC');
    const length = Array.from(password).length;
    if (!length) throw new Error('Enter a password.');
    if (length > 128) throw new Error('Use no more than 128 characters.');
    if (confirm && password !== repeated.normalize('NFC')) throw new Error('The two passwords do not match. Check them and try again.');
    return password;
  }
  function revealPassword(input, visible) {
    input.type = visible ? 'text' : 'password';
    const control = input.closest('.portal-password-control')?.querySelector('[data-password-toggle]');
    if (control) { const label = visible ? 'Hide password' : 'Show password'; control.setAttribute('aria-label', label); control.setAttribute('aria-pressed', String(visible)); control.title = label; }
  }
  function hidePasswords(root = document) { root.querySelectorAll('[data-account-password]').forEach(input => revealPassword(input, false)); }
  function clearPasswords(form) { form.querySelectorAll('[data-account-password]').forEach(input => { input.value = ''; revealPassword(input, false); }); }
  function checkAuthRevision(revision) { if (revision !== authRevision) throw new Error('Sign-in was cancelled. Please try again.'); }
  function stopPasswordWorker(message = 'Password sign-in was interrupted. Please try again.') {
    passwordWorker?.terminate(); passwordWorker = null;
    for (const pending of passwordTasks.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    passwordTasks.clear();
  }
  function passwordTask(method, params) {
    return new Promise((resolve, reject) => {
      try {
        if (!passwordWorker) {
          passwordWorker = new Worker('/password-crypto-worker.js', { type: 'module' });
          passwordWorker.addEventListener('message', event => {
            const reply = event.data, pending = passwordTasks.get(reply?.id);
            if (!pending) return;
            clearTimeout(pending.timer); passwordTasks.delete(reply.id);
            if (reply.ok === true) pending.resolve(reply.result);
            else { const error = new Error(reply.error?.message || 'Password sign-in could not be completed. Please try again.'); error.code = reply.error?.code; pending.reject(error); }
          });
          passwordWorker.addEventListener('error', event => { event.preventDefault?.(); stopPasswordWorker('Password support did not load. Refresh this page and try again.'); });
          passwordWorker.addEventListener('messageerror', () => stopPasswordWorker());
        }
        const id = String(++passwordRequest);
        const timer = setTimeout(() => stopPasswordWorker('The password check took too long. Please try again.'), 60000);
        passwordTasks.set(id, { resolve, reject, timer });
        passwordWorker.postMessage({ id, method, params });
      } catch { stopPasswordWorker('Password support did not load. Refresh this page and try again.'); reject(new Error('Password support did not load. Refresh this page and try again.')); }
    });
  }
  async function passwordExchange(purpose, data, password, registration = false) {
    if (state.passwordAvailable === false) throw new Error('Password access is being updated. Try again shortly.');
    let stateId;
    const method = registration ? 'registration' : 'login', revision = authRevision;
    try {
      const started = await passwordTask(`${method}.start`, { password }); stateId = started.stateId;
      checkAuthRevision(revision);
      const issued = await api(`/api/auth/password/${purpose}/options`, { method: 'POST', data: { ...data, ...(registration ? { registrationRequest: started.registrationRequest } : { startLoginRequest: started.startLoginRequest }) } });
      checkAuthRevision(revision);
      const finished = await passwordTask(`${method}.finish`, { stateId, ...(registration ? { registrationResponse: issued.registrationResponse } : { loginResponse: issued.loginResponse }) }); stateId = undefined;
      checkAuthRevision(revision);
      const result = await api(`/api/auth/password/${purpose}/verify`, { method: 'POST', data: { ceremonyId: issued.ceremonyId, ...(registration ? { registrationRecord: finished.registrationRecord } : { finishLoginRequest: finished.finishLoginRequest }) } });
      checkAuthRevision(revision); return result;
    } finally { if (stateId && passwordWorker && revision === authRevision) await passwordTask('cancel', { stateId }).catch(() => {}); }
  }
  async function withPassword(form, action, { confirm = false, name = 'password' } = {}) {
    const password = readPassword(form, name, confirm);
    try { return await action(password); } finally { clearPasswords(form); }
  }
  function updateAuthMethods() {
    hidePasswords();
    for (const [id, prefix, passwordLabel, passkeyLabel] of [['portal-register', 'register', 'Create my account', 'Create account with a passkey'], ['portal-recover', 'recover', 'Recover my account', 'Recover with a passkey'], ['portal-activate', 'activate', 'Set password and continue', 'Continue with a passkey']]) {
      const form = $(id), passkey = checked(form, 'usePasskey');
      $(`${prefix}-passwords`).hidden = passkey;
      for (const name of ['password', 'confirmPassword']) { field(form, name).required = !passkey; if (passkey) field(form, name).value = ''; }
      form.querySelector('[type="submit"]').textContent = passkey ? passkeyLabel : passwordLabel;
    }
  }
  function updateSecurityAuth() {
    const hasPassword = state.identity?.hasPassword === true;
    $('portal-password-title').textContent = hasPassword ? 'Change your password' : 'Add a password';
    $('portal-current-password-label').hidden = !hasPassword; field($('portal-password'), 'currentPassword').required = hasPassword;
    $('portal-reauth-form').hidden = !hasPassword; field($('portal-reauth-form'), 'password').required = hasPassword;
    $('portal-reauth-passkey-only').hidden = hasPassword;
    $('portal-recovery-password').hidden = !hasPassword; field($('portal-recovery-password'), 'password').required = hasPassword;
  }
  function date(value) {
    if (!value) return 'Not recorded';
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? String(value) : result.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function setStatus(message, kind = '') {
    $('portal-status').textContent = message;
    $('portal-status').dataset.kind = kind;
  }
  function badge(text, status) {
    const result = node('span', text, 'portal-badge');
    if (status) result.dataset.state = status;
    return result;
  }
  function empty(container, message) { container.replaceChildren(node('p', message, 'portal-empty')); }
  function option(select, text, val) { const item = node('option', text); item.value = val; select.append(item); }
  function fillOptions(select, rows, label = 'Choose a group', selected = '') {
    select.replaceChildren(); option(select, label, '');
    for (const row of rows) option(select, row.name, row.id);
    select.value = selected;
  }
  function button(text, fn, kind = 'secondary') {
    const result = node('button', text, `button ${kind}`); result.type = 'button'; result.addEventListener('click', fn); return result;
  }
  function mergeRows(current, incoming, page) {
    if (page === 1) return incoming;
    const byId = new Map(current.map(row => [row.id, row]));
    for (const row of incoming) byId.set(row.id, row);
    return [...byId.values()];
  }
  function showMore(anchor, result, next) {
    const id = `${anchor.id}-more`;
    $(id)?.remove();
    const page = Number(result.page || 1), size = Number(result.pageSize || 50), total = Number(result.total || 0);
    if (page * size >= total) return;
    const control = button(`Load more (${Math.min(page * size, total)} of ${total} shown)`, () => run(() => next(page + 1)));
    control.id = id; control.dataset.pageMore = 'true'; (anchor.matches('select') ? anchor.closest('label') || anchor : anchor).insertAdjacentElement('afterend', control);
  }
  function actionRow(...children) { const result = node('div', undefined, 'portal-actions'); result.append(...children); return result; }
  function record(title, status, heading = 'h3') {
    const result = node('article', undefined, 'portal-record');
    result.append(node(heading, title));
    if (status) result.append(badge(STATUS[status] || status, status));
    return result;
  }
  function safeLink(raw, text) {
    if (!raw) return null;
    try {
      const target = new URL(raw, location.origin);
      if (target.username || target.password || (target.protocol !== 'https:' && target.origin !== location.origin)) return null;
      if (!['http:', 'https:'].includes(target.protocol)) return null;
      const link = node('a', text || 'Open document'); link.href = target.href;
      if (target.origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      return link;
    } catch { return null; }
  }
  function lessonInstructions(body) {
    const instructions = node('p', undefined, 'portal-preserve');
    for (const [index, line] of String(body ?? '').split('\n').entries()) {
      if (index) instructions.append('\n');
      const resource = line.match(/^([^|]+) \| (https:\/\/\S+)$/);
      const link = resource && safeLink(resource[2], resource[1].trim());
      instructions.append(link || line);
    }
    return instructions;
  }
  function download(content, name, type = 'application/json') {
    const href = URL.createObjectURL(new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 2)], { type }));
    const link = node('a'); link.href = href; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function stableCreate(key, data) {
    const serialised = JSON.stringify(data);
    let pending = retries.get(key);
    if (!pending || pending.serialised !== serialised) { pending = { serialised, id: crypto.randomUUID() }; retries.set(key, pending); }
    return { id: pending.id, ...data };
  }
  function setBusy(busy) {
    state.busy = busy; $('main').setAttribute('aria-busy', String(busy));
    if (busy) {
      for (const control of document.querySelectorAll('main button, main input, main textarea, main select')) { controls.set(control, control.disabled); control.disabled = true; }
    } else {
      for (const [control, disabled] of controls) if (control.isConnected) control.disabled = disabled;
      controls.clear(); updatePagination();
      if (state.selectedSite) field($('portal-site'), 'id').disabled = true;
    }
  }
  function clearPrivate() {
    authRevision++; stopPasswordWorker();
    clearLearning();
    state.participantView = false; state.participantLoaded = false;
    state.identity = null; state.profile = null; state.sites = []; state.groups = []; state.applications = []; state.committeeSites = []; state.accounts = []; state.allSites = []; state.selectedAccount = null; state.selectedApplication = null; state.selectedSite = null; state.selectedGroup = ''; state.selectedCommittee = ''; state.selectedPost = null; state.roleAssignment = null; state.profileDirty = false; state.resubmission = null; state.accountEvents = []; state.reviewApplications = []; state.committeePosts = []; state.groupPosts = []; retries.clear();
    state.invitations = []; state.invitationTotal = 0; state.invitationPage = 1; state.invitationSearch = ''; clearInvitationContext();
    $('portal-signed-in').hidden = true; $('portal-reauth').hidden = true; document.querySelectorAll('[data-page-more]').forEach(control => control.remove());
    $('tab-committee').hidden = true; $('tab-webmaster').hidden = true;
    for (const id of ['portal-application-list', 'portal-groups-list', 'portal-post-list', 'portal-review-list', 'portal-committee-posts', 'portal-account-list', 'portal-invitation-list', 'portal-account-roles', 'portal-audit-list', 'portal-passkey-list']) $(id).replaceChildren();
    for (const id of ['portal-profile', 'portal-application', 'portal-review', 'portal-post', 'portal-account-state', 'portal-role', 'portal-invite', 'portal-committee-invite', 'portal-invitation-search', 'portal-site', 'portal-add-passkey', 'portal-password', 'portal-reauth-form', 'portal-recovery-password']) $(id).reset();
    $('portal-committee-invite-details').open = false;
    for (const id of ['portal-group-content', 'portal-committee-content', 'portal-account-editor', 'portal-review-editor', 'portal-private-link']) $(id).hidden = true;
    $('portal-private-link-value').value = ''; $('portal-account-name').textContent = ''; $('portal-account-label').textContent = '';
    for (const id of ['portal-group-name', 'portal-group-role', 'portal-group-membership', 'portal-review-applicant', 'portal-review-statement', 'portal-account-info', 'account-editor-title', 'portal-profile-meta', 'portal-private-link-help']) $(id).textContent = '';
    for (const id of ['portal-application-workspace', 'portal-committee-workspace', 'portal-role-workspace', 'portal-invitation-workspace', 'portal-site-select']) fillOptions($(id), []);
    clearRecovery(); showAuth();
  }
  async function api(path, { method = 'GET', data, file } = {}) {
    const headers = { Accept:'application/json' };
    if (file) headers['Content-Type'] = file.type;
    else if (data !== undefined) headers['Content-Type'] = 'application/json';
    const body = file ?? (data === undefined ? undefined : JSON.stringify(data));
    const response = await fetch(path, { method, credentials:'same-origin', cache:'no-store', headers, body });
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) {
      const error = new Error(result.error || 'The server could not complete this request.'); error.status = response.status; error.code = result.code;
      const retryableAuth = /^\/api\/auth\/(?:password\/)?(?:login|reauth|recovery-codes)\/(?:options|verify)$/.test(path) && ['password_invalid', 'invalid_ceremony'].includes(error.code);
      if (response.status === 401 && state.identity && !retryableAuth) clearPrivate();
      else if (response.status === 403 && error.code === 'webmaster_required' && path.startsWith('/api/webmaster/') && state.identity?.webmaster) clearPrivate();
      throw error;
    }
    return result;
  }
  async function run(action, message = '') {
    if (state.busy) return;
    setBusy(true);
    try { await action(); if (message) setStatus(message, 'success'); }
    catch (error) {
      let message = error.message || 'The request could not be completed.';
      if (error.name === 'NotAllowedError' || error.code === 'ERROR_CEREMONY_ABORTED') message = 'The passkey step was cancelled or timed out. Nothing has been changed. You can try again.';
      else if (error.name === 'TypeError') message = 'The server did not confirm this request. Your form is still here. Check your connection before trying again.';
      else if (error.code === 'reauthentication_required') { updateSecurityAuth(); $('portal-reauth').hidden = false; message = 'Confirm it is you above, then repeat the action. Your form edits are still here.'; }
      else if (error.status === 409) message += ' Your unsaved text is still here. Reload the latest record before trying again.';
      setStatus(message, 'error');
    } finally { setBusy(false); }
  }
  function listenForm(id, action) {
    const form = $(id); form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity() || state.busy) return; action(form); });
  }
  function selectPanel(name, focus = false) {
    hidePasswords();
    for (const tab of document.querySelectorAll('[data-panel]')) {
      const selected = tab.dataset.panel === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; $(`panel-${tab.dataset.panel}`).hidden = !selected;
      if (selected && focus) tab.focus();
    }
  }
  function updatePortalView() {
    const webmaster = state.identity?.webmaster === true, administration = webmaster && !state.participantView;
    for (const panel of ['profile', 'learning', 'applications', 'groups']) $(`tab-${panel}`).hidden = administration;
    $('tab-webmaster').hidden = !administration;
    $('portal-learning-desk').hidden = !administration || ['access', 'local'].includes(state.identity?.authentication);
    $('tab-committee').hidden = webmaster ? !administration : !state.committeeSites.length;
    $('tab-course-staff').hidden = ['access','local'].includes(state.identity?.authentication) ||
      (webmaster ? !administration : !state.committeeSites.length);
    $('portal-participant-view').hidden = !webmaster;
    $('portal-participant-view').textContent = state.participantView ? 'Back to administration' : 'Open participant view (optional)';
    $('portal-participant-view').setAttribute('aria-pressed', String(webmaster && state.participantView));
    $('portal-title').textContent = administration ? 'Webmaster administration' : webmaster ? 'Participant view' : 'Member portal';
    $('portal-eyebrow').textContent = administration ? 'Accounts · groups · governance' : webmaster ? 'Optional · your participation' : 'People · participation · local groups';
    $('portal-member-intro').hidden = administration; $('portal-admin-intro').hidden = !administration;
  }
  function showAuth() {
    hidePasswords();
    updatePortalView();
    $('portal-signed-out').hidden = !!state.identity;
    $('portal-auth-ordinary').hidden = ['setup', 'invite', 'recover'].includes(state.authMode);
    $('portal-setup').hidden = state.authMode !== 'setup';
    $('portal-activation').hidden = !['invite', 'recover'].includes(state.authMode);
    $('portal-activate').hidden = state.authMode === 'invite' && !state.invitationContext;
    $('activation-title').textContent = state.authMode === 'recover' ? 'Restore your account' : 'Activate your account';
    $('portal-activation-consent').hidden = state.authMode === 'recover'; field($('portal-activate'), 'consent').required = state.authMode !== 'recover';
  }
  function readFragment() {
    const hash = location.hash.slice(1), params = new URLSearchParams(hash);
    state.authMode = hash === 'setup' ? 'setup' : params.has('invite') ? 'invite' : params.has('recover') ? 'recover' : '';
    state.token = params.get('invite') || params.get('recover') || '';
    if (state.token) history.replaceState(null, '', location.pathname + location.search);
  }
  function clearInvitationContext() {
    state.invitationContext = null; $('portal-invitation-context').hidden = true;
    for (const id of ['portal-invitation-person', 'portal-invitation-group', 'portal-invitation-explanation', 'portal-invitation-expiry']) $(id).textContent = '';
  }
  async function loadInvitationContext() {
    clearInvitationContext(); $('portal-activate').hidden = true;
    const revision = authRevision, token = state.token;
    const result = await api('/api/auth/invitation', { method: 'POST', data: { token } });
    checkAuthRevision(revision);
    if (state.authMode !== 'invite' || state.token !== token) return;
    const invitation = result.invitation;
    if (!invitation?.username) throw new Error('This invitation could not be confirmed. Ask the webmaster for a new link.');
    state.invitationContext = invitation;
    const committee = invitation.role === 'committee';
    $('portal-invitation-context-title').textContent = committee ? 'Committee invitation' : 'Your account invitation';
    $('portal-invitation-person').textContent = `${invitation.displayName} · @${invitation.username}`;
    $('portal-invitation-group').textContent = committee ? `Committee access · ${invitation.siteName}` : 'Participant account';
    $('portal-invitation-explanation').textContent = committee ? 'Activating this account accepts committee access for this group, including reviewing applications and publishing group information. This does not appoint a cooperative director.' : 'Activate your account to manage your own participation. Group access is assigned separately.';
    $('portal-invitation-expiry').textContent = `This invitation expires ${date(invitation.expiresAt)}.`;
    $('portal-invitation-context').hidden = false; $('portal-activate').hidden = false;
  }
  function showRecovery(codes, username) {
    if (!Array.isArray(codes) || !codes.length) return;
    state.recoveryCodes = [...codes]; state.recoveryUsername = username || state.identity?.username || '';
    $('portal-code-list').replaceChildren(...codes.map(code => node('li', code)));
    $('portal-recovery-codes').open = false; $('portal-recovery-codes').hidden = false;
  }
  function clearRecovery() { state.recoveryCodes = []; state.recoveryUsername = ''; $('portal-code-list').replaceChildren(); $('portal-recovery-codes').open = false; $('portal-recovery-codes').hidden = true; }
  async function ceremony(purpose, data) {
    const webauthn = window.SimpleWebAuthnBrowser;
    if (!webauthn?.startRegistration || !webauthn?.startAuthentication) throw new Error('Passkey support did not load. Refresh this page in a current browser on the Cloudflare site.');
    const revision = authRevision, issued = await api(`/api/auth/${purpose}/options`, { method: 'POST', data });
    checkAuthRevision(revision);
    const response = ['login', 'recovery-codes'].includes(purpose)
      ? await webauthn.startAuthentication({ optionsJSON: issued.options })
      : await webauthn.startRegistration({ optionsJSON: issued.options });
    checkAuthRevision(revision);
    const result = await api(`/api/auth/${purpose}/verify`, { method: 'POST', data: { ceremonyId: issued.ceremonyId, response } });
    checkAuthRevision(revision); return result;
  }
  async function signedIn(result) {
    state.identity = result.identity; state.authMode = ''; state.token = ''; $('portal-unavailable').hidden = true; $('portal-signed-out').hidden = true;
    clearInvitationContext();
    state.participantView = false; state.participantLoaded = false;
    $('portal-signed-in').hidden = false; $('portal-account-name').textContent = state.identity.displayName; $('portal-account-label').textContent = `@${state.identity.username}${state.identity.webmaster ? ' · Webmaster' : ' · Private account'}`;
    for (const id of ['portal-login', 'portal-passkey-login', 'portal-register', 'portal-bootstrap', 'portal-recover', 'portal-activate']) $(id).reset();
    updateAuthMethods(); updateSecurityAuth(); updatePortalView(); selectPanel(state.identity.webmaster ? 'webmaster' : 'profile');
    showRecovery(result.recoveryCodes, state.identity.username);
    await loadPortalData();
  }
  async function refreshAuthIdentity(result) {
    const previous = state.identity, next = result?.identity;
    if (!next?.accountId || next.status !== 'active') { clearPrivate(); throw new Error('Sign in again to continue with an active account.'); }
    const changed = !previous || previous.accountId !== next.accountId || (previous.webmaster === true) !== (next.webmaster === true) || previous.status !== next.status;
    if (changed) { clearPrivate(); await signedIn(result); }
    else { state.identity = next; updateSecurityAuth(); }
    return changed;
  }
  async function confirmAuthIdentity(result) {
    const changed = await refreshAuthIdentity(result); $('portal-reauth').hidden = true;
    setStatus(changed ? 'Account access has changed. Review the current account before continuing.' : 'Identity confirmed. You can now repeat your account action.', 'success');
  }
  async function loadSession() {
    $('portal-unavailable').hidden = true;
    const result = await api('/api/auth/session');
    state.authConfigured = result.authConfigured === true;
    state.passwordAvailable = result.passwordAvailable !== false;
    if (!result.authConfigured) {
      clearPrivate();
      if (state.authMode === 'setup' && result.setupComplete !== true) { $('portal-signed-out').hidden = false; $('portal-setup-help').hidden = false; setStatus('Complete the one-time Cloudflare setting below, then create your webmaster account.'); }
      else { $('portal-signed-out').hidden = true; $('portal-unavailable').hidden = false; setStatus('The public hub is open. Private account setup is not complete yet.'); }
      return;
    }
    if (result.authenticated && result.identity) { await signedIn(result); setStatus(state.identity.webmaster ? 'Your webmaster administration is ready.' : 'Your private portal is ready.'); return; }
    clearPrivate();
    if (state.authMode === 'setup' && (result.setupComplete === true || !result.bootstrapAvailable)) { state.authMode = ''; showAuth(); setStatus('The first webmaster account has already been established. Sign in to continue.'); }
    else { if (state.authMode === 'setup') { $('portal-setup-help').hidden = true; setStatus('Cloudflare account setup is ready. Keep the setup key below, complete your details and choose your own password.', 'success'); } else { if (state.authMode === 'invite') await loadInvitationContext(); setStatus(state.authMode ? 'Complete the private account step below.' : 'Sign in or create an account to continue.'); } }
  }
  const evidenceStates = { submitted: 'Review requested', more_info: 'More information requested', verified: 'Verified', declined: 'Declined', revoked: 'Revoked', withdrawn: 'Withdrawn', expired: 'Expired' };
  const evidenceTypes = {
    work_rights: ['Working holiday work rights', ['vevo']],
    licence: ['Licence', ['issuer', 'sighted']],
    qualification: ['Qualification or training credential', ['issuer', 'sighted']],
    english: ['Workplace English', ['practical', 'issuer', 'sighted']],
    skill: ['Practical skill', ['practical', 'issuer', 'sighted']]
  };
  const evidenceMethods = {
    vevo: 'Checked in VEVO with the person’s permission',
    issuer: 'Confirmed with the issuer',
    sighted: 'Document sighted',
    practical: 'Observed in a practical task'
  };
  const learning = { profile: null, profileDirty: false, review: null };

  function clearLearning() {
    clearCourses();
    learning.profile = null;
    learning.profileDirty = false;
    learning.review = null;
    for (const id of ['portal-learning-profile', 'portal-learning-evidence-form', 'portal-learning-review-form']) $(id).reset();
    for (const id of ['portal-learning-completions', 'portal-learning-evidence', 'portal-learning-reviews']) $(id).replaceChildren();
    for (const id of ['portal-learning-desk', 'portal-learning-request-panel']) $(id).open = false;
    $('portal-learning-review-form').hidden = true;
    $('portal-learning-content').hidden = true;
    $('portal-learning-review-title').textContent = 'Record an evidence decision';
  }

  function renderLearningProfile(profile) {
    const form = $('portal-learning-profile');
    learning.profile = profile;
    learning.profileDirty = false;
    for (const name of ['availableFrom', 'availableUntil', 'english', 'skills', 'licences']) field(form, name).value = profile[name];
    for (const control of form.querySelectorAll('[name="pathways"]')) control.checked = profile.pathways.includes(control.value);
  }

  async function reloadLearningProfile() {
    renderLearningProfile((await api('/api/learning/profile')).profile);
  }

  function renderLearningPage(id, page, more, entries, format, next, noEntries, appendEntry) {
    const container = $(id);
    const moreId = `${id}-more`;
    $(moreId)?.remove();
    if (page === 1) container.replaceChildren();
    if (!entries.length && page === 1) empty(container, noEntries);
    for (const entry of entries) {
      const card = format(entry);
      if (appendEntry) appendEntry(container, entry, card);
      else container.append(card);
    }
    if (more) {
      const control = button('Load more', () => run(() => next(page + 1)));
      control.id = moreId;
      control.dataset.pageMore = 'true';
      container.insertAdjacentElement('afterend', control);
    }
  }

  async function loadLearningCompletions(page = 1) {
    const result = await api(`/api/learning/completions?page=${page}`);
    renderLearningPage('portal-learning-completions', page, result.more, result.completions, item => {
      const card = record(item.title);
      if (item.assessed !== undefined) card.append(badge(item.assessed ? 'Assessed' : 'Read-through', 'passed'));
      card.append(node('p', `${item.provider} · Course version ${item.revision} · Completed ${date(item.completedAt)}`));
      return card;
    }, loadLearningCompletions, 'Your completed courses will appear here.');
  }

  function evidenceCard(item) {
    const card = record(item.label);
    const label = item.status === 'verified' && item.method === 'sighted' ? 'Document sighted' : evidenceStates[item.status];
    card.append(badge(label, item.status));
    card.append(node('p', [evidenceTypes[item.category][0], item.issuer].filter(Boolean).join(' · ')));
    if (item.method) card.append(node('p', evidenceMethods[item.method]));
    if (item.expiresOn) {
      const expiry = new Date(`${item.expiresOn}T00:00:00Z`).toLocaleDateString('en-AU', { dateStyle: 'medium', timeZone: 'UTC' });
      card.append(node('p', `Expiry ${expiry}`));
    }
    if (item.reviewedBy) card.append(node('p', `Reviewed by ${item.reviewedBy} on ${date(item.reviewedAt)}`));
    if (item.note) card.append(node('p', item.note));
    return card;
  }

  async function loadLearningEvidence(page = 1) {
    const result = await api(`/api/learning/evidence?page=${page}`);
    renderLearningPage('portal-learning-evidence', page, result.more, result.evidence, item => {
      const card = evidenceCard(item);
      if (item.status === 'more_info') {
        card.append(button('Request another review', () => run(async () => {
          await api(`/api/learning/evidence/${item.id}`, { method: 'PATCH', data: { expectedVersion: item.version, action: 'resubmit' } });
          await loadLearningEvidence();
        }, 'Your evidence is back in the review queue.')));
      }
      if (!['withdrawn', 'revoked'].includes(item.status)) {
        const confirm = node('details', undefined, 'portal-record');
        confirm.append(node('summary', 'Withdraw this request'), node('p', 'This will close the request and change the status on your profile.'));
        confirm.append(button('Confirm withdrawal', () => run(async () => {
          await api(`/api/learning/evidence/${item.id}`, { method: 'PATCH', data: { expectedVersion: item.version, action: 'withdraw' } });
          await loadLearningEvidence();
        }, 'Your evidence request has been withdrawn.')));
        card.append(confirm);
      }
      return card;
    }, loadLearningEvidence, 'Your evidence requests and their review status will appear here.');
  }

  async function loadLearning() {
    await Promise.all([learning.profile ? null : reloadLearningProfile(), loadLearningCompletions(), loadLearningEvidence(), loadCourses()]);
    $('portal-learning-content').hidden = false;
  }

  function updateLearningReviewFields() {
    const form = $('portal-learning-review-form');
    const verify = value(form, 'status') === 'verified';
    $('portal-learning-method').hidden = !verify;
    $('portal-learning-expiry').hidden = !verify;
    field(form, 'method').required = verify;
    field(form, 'expiresOn').required = verify && learning.review?.category === 'work_rights';
    field(form, 'note').required = !verify;
  }

  function editLearningReview(item) {
    const form = $('portal-learning-review-form');
    form.reset();
    learning.review = item;
    $('portal-learning-review-title').textContent = `Review ${item.label} for ${item.applicant}`;
    const decisions = field(form, 'status');
    decisions.replaceChildren();
    option(decisions, 'Choose a decision', '');
    if (item.recordedStatus === 'verified') option(decisions, 'Revoke verification', 'revoked');
    else {
      option(decisions, 'Verify evidence', 'verified');
      if (item.recordedStatus === 'submitted') option(decisions, 'Request more information', 'more_info');
      option(decisions, 'Decline evidence', 'declined');
    }
    const methods = field(form, 'method');
    methods.replaceChildren();
    option(methods, 'Choose how you checked', '');
    for (const method of evidenceTypes[item.category][1]) option(methods, evidenceMethods[method], method);
    updateLearningReviewFields();
    form.hidden = false;
    $('portal-learning-review-title').focus();
  }

  async function loadLearningReviews(page = 1) {
    const result = await api(`/api/learning/reviews?page=${page}`);
    renderLearningPage('portal-learning-reviews', page, result.more, result.evidence, item => {
      const card = evidenceCard(item);
      card.append(node('p', `Submitted by ${item.applicant}`), button('Review evidence', () => editLearningReview(item)));
      return card;
    }, loadLearningReviews, 'There are no evidence records to review.');
  }

  const courses = { groups: [], site: '', categories: [], editorDirty: false };
  const practicalStates = { submitted: 'Awaiting assessment', revise: 'Changes requested', passed: 'Completed' };
  const courseField = (name, title, max, rows = 0, initial = '', required = true) => {
    const label = node('label', title);
    const input = node(rows ? 'textarea' : 'input');
    input.name = name;
    input.maxLength = max;
    input.required = required;
    if (rows) input.rows = rows;
    input.value = initial;
    label.append(input);
    return label;
  };
  function courseSubmit(label) {
    const control = node('button', label, 'button primary');
    control.type = 'submit';
    return control;
  }
  function courseForm(form, action, message) {
    form.addEventListener('invalid', event => {
      if (form.revealCourseField) form.revealCourseField(event.target);
      for (let element = event.target.parentElement; element && element !== form; element = element.parentElement) {
        if (element.tagName === 'DETAILS') element.open = true;
      }
    }, true);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!state.busy && form.reportValidity()) run(() => action(form), message);
    });
  }
  async function courseApi(path, options) {
    const revision = authRevision;
    const result = await api('/api/learning/' + path, options);
    checkAuthRevision(revision);
    return result;
  }
  function courseSlug(course) { return `courses/${course.id}/${course.revision}`; }
  function draftSlug(course) { return `course-staff/drafts/${course.id}/${course.revision}`; }

  function courseSprite(name) {
    const art = node('span', undefined, `course-sprite course-sprite--${name}`);
    art.setAttribute('aria-hidden','true');
    return art;
  }

  function courseTool(label, sprite, activate) {
    const control = button(label, activate);
    control.className = 'course-tool';
    if (sprite) control.prepend(courseSprite(sprite));
    return control;
  }

  function addLessonOrder(control, number, title) {
    const order = node('span',number,'course-outline-order');
    order.setAttribute('aria-hidden','true');
    control.setAttribute('aria-label',`Lesson ${number}, ${title}`);
    control.prepend(order);
  }

  const categoryArtwork = {
    'site-tours': 'preview', 'member-start': 'library', committee: 'handover', volunteers: 'volunteer',
    'community-media': 'video', noticeboard: 'screenshot', 'working-holiday': 'practical',
    employers: 'handover', grants: 'write', events: 'practical', 'digital-stewardship': 'settings',
    'digital-skills': 'ai'
  };

  function courseArtwork(course) {
    if (course.id === 'plfc-officer-handover') return 'handover';
    if (course.id === 'plfc-volunteer-onboarding') return 'volunteer';
    return categoryArtwork[course.category] || 'library';
  }

  function appendCourseCard(container, item, card) {
    const key = item.category || 'courses';
    let section = [...container.children].find(child => child.dataset.category === key);
    if (!section) {
      section = node('section', undefined, 'course-shelf');
      section.dataset.category = key;
      const name = item.categoryName || courses.categories.find(category => category.id === key)?.name || 'Courses';
      const heading = node('h4', name, 'course-shelf-heading');
      heading.id = `${container.id}-${key}`;
      section.setAttribute('aria-labelledby', heading.id);
      const list = node('div', undefined, 'course-card-grid');
      section.append(heading, list);
      container.append(section);
    }
    section.querySelector('.course-card-grid').append(card);
  }

  function courseHomeSection(section) {
    for (const name of ['courses','assessments']) {
      const active = section === name;
      $(`portal-course-home-${name}`).setAttribute('aria-pressed', String(active));
      $((name === 'courses') ? 'portal-course-course-list' : 'portal-course-assessment-list').hidden = !active;
    }
  }

  function clearCourses() {
    Object.assign(courses, { groups: [], site: '', categories: [], editorDirty: false });
    for (const id of ['portal-courses-group','portal-courses-group-actions','portal-courses-versions',
      'portal-courses-assessments','portal-courses-catalogue','portal-courses-reader']) $(id).replaceChildren();
    closeCourseEditor();
    closeCourseAssessment();
    courseHomeSection('courses');
    $('portal-courses-staff').hidden = true;
    $('tab-course-staff').hidden = true;
  }

  async function loadCourses(page = 1) {
    const result = await courseApi(`courses?page=${page}`);
    renderLearningPage('portal-courses-catalogue', page, result.more, result.courses, item => {
      const card = record(item.title, undefined, 'h5');
      card.classList.add('course-learner-card');
      card.prepend(courseSprite(courseArtwork(item)));
      card.append(node('p', `${item.provider} · ${item.categoryName} · Version ${item.revision}`, 'portal-hint'));
      card.append(node('p', item.description));
      if (item.completedAt) card.append(badge(item.requiresAssessment ? 'Assessed and completed' : 'Guide completed', 'passed'));
      else if (item.practicalStatus) card.append(badge(practicalStates[item.practicalStatus], item.practicalStatus));
      else if (item.enrolmentId) card.append(node('p', `${item.lessonsDone} of ${item.lessonCount} lessons complete`));
      if (item.requiresAssessment !== undefined && !item.completedAt) {
        card.append(node('p', item.requiresAssessment ? 'Assessment required' : 'Read-through guide', 'portal-hint'));
      }
      const label = item.completedAt || item.practicalStatus === 'passed' ? 'Open completed course' : item.enrolmentId ? 'Continue course' : 'Open course';
      card.append(actionRow(button(label, () => run(async () => {
        const dirty = $('portal-courses-reader').querySelector('form[data-dirty="true"]');
        if (dirty && !window.confirm('Discard your unsaved practical response?')) return;
        drawCourse((await courseApi(courseSlug(item))).course);
      }))));
      return card;
    }, loadCourses, 'Courses will appear here when your training group publishes them.', appendCourseCard);
  }

  function lessonMedia(container, course, lesson, number) {
    if (lesson.screenshot) {
      const figure = node('figure', undefined, 'portal-course-figure');
      const image = node('img');
      const src = `/api/learning/course-media/${lesson.screenshot.id}`;
      image.src = src;
      image.alt = lesson.screenshot.alt;
      image.loading = 'lazy';
      const full = node('a', 'Open full-size screenshot');
      full.href = src;
      full.target = '_blank';
      full.rel = 'noopener';
      const caption = node('figcaption', lesson.screenshot.caption || undefined);
      caption.append(full);
      figure.append(image, caption);
      container.append(figure);
    }
    if (!lesson.video) return;
    const section = node('section', undefined, 'portal-course-video');
    const youtube = lesson.video.url.startsWith('https://www.youtube-nocookie.com/embed/');
    const slot = node('div');
    const play = button(youtube ? 'Load video from YouTube' : 'Load lesson video', () => {
      if (youtube) {
        const player = node('iframe');
        player.src = lesson.video.url;
        player.title = `${lesson.title} lesson video`;
        player.allowFullscreen = true;
        player.referrerPolicy = 'strict-origin-when-cross-origin';
        slot.append(player);
      } else {
        const player = node('video');
        player.controls = true;
        player.preload = 'metadata';
        player.src = lesson.video.url;
        if (lesson.video.captionsUrl || lesson.video.captions) {
          const track = node('track');
          track.kind = 'captions';
          track.srclang = 'en';
          track.label = 'English';
          track.default = true;
          track.src = lesson.video.captionsUrl ?? `/api/learning/courses/${course.id}/${course.revision}/captions/${number}`;
          player.append(track);
        }
        slot.append(player);
      }
      play.remove();
      slot.firstElementChild?.focus();
    });
    const transcript = node('details');
    transcript.append(node('summary', 'Read the video transcript'), node('p', lesson.video.transcript, 'portal-preserve'));
    section.append(actionRow(play), slot, transcript);
    container.append(section);
  }

  function lessonQuestions(container, questions, { done = false, preview = false, submit } = {}) {
    if (!questions?.length) return false;
    container.append(node('h4', 'Practise what you learned'));
    if (done) {
      for (const question of questions) {
        const answer = question.choices.find(choice => choice.id === question.correct_choice_id);
        container.append(node('p', question.prompt), node('p', `${answer?.text ?? ''} ${question.explanation ?? ''}`.trim(), 'portal-hint'));
      }
      return true;
    }
    const form = node('form', undefined, 'portal-form portal-course-questions');
    const status = node('p', undefined, 'portal-hint');
    status.setAttribute('role','status');
    for (const question of questions) {
      const fieldset = node('fieldset', undefined, 'portal-record');
      fieldset.append(node('legend', question.prompt));
      for (const choice of question.choices) {
        const label = node('label', undefined, 'portal-check');
        const input = node('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = choice.id;
        input.required = true;
        label.append(input, node('span', choice.text));
        fieldset.append(label);
      }
      form.append(fieldset);
    }
    form.append(courseSubmit(preview ? 'Check preview answers' : 'Check answers'), status);
    courseForm(form, async current => {
      const answers = Object.fromEntries([...current.querySelectorAll('input[type="radio"]:checked')]
        .map(input => [input.name,input.value]));
      status.replaceChildren();
      if (preview) {
        for (const question of questions) {
          const correct = answers[question.id] === question.correct_choice_id;
          status.append(node('span', correct ? `Correct. ${question.explanation}` : 'Try that question again.'));
        }
        return;
      }
      try { await submit(answers); } catch (error) {
        if (error.code !== 'course_practice_retry') throw error;
        status.textContent = error.message;
      }
    });
    container.append(form);
    return true;
  }

  function drawCourse(course, openLesson = 0) {
    const card = node('article', undefined, 'portal-record portal-course-reader');
    const heading = node('h3', course.title);
    heading.tabIndex = -1;
    const close = button('Close course', () => {
      if (card.querySelector('form[data-dirty="true"]') && !window.confirm('Discard your unsaved practical response?')) return;
      $('portal-courses-reader').replaceChildren();
      $('portal-courses-catalogue').querySelector('button')?.focus();
    });
    card.append(heading, node('p', course.description), actionRow(close));
    const target = courseSlug(course);
    if (!course.enrolmentId) {
      const outline = node('ol');
      for (const item of course.lessons) outline.append(node('li', item.title));
      card.append(outline, actionRow(button('Start course', () => run(async () => {
        const result = await courseApi(target + '/enrol', { method:'POST', data:{} });
        await loadCourses();
        drawCourse(result.course, 1);
      }, 'You’re enrolled. Your progress is saved as you go.'), 'primary')));
    } else {
      card.append(node('p', `${course.progress.length} of ${course.lessons.length} lessons complete`, 'portal-hint'));
      if (course.completedAt && !course.practical) card.append(badge('Guide completed', 'passed'));
      course.lessons.forEach((lesson, index) => {
        const number = index + 1;
        const done = course.progress.includes(number);
        const detail = node('details', undefined, 'portal-record portal-course-lesson');
        detail.open = openLesson === number;
        detail.append(node('summary', `${number}. ${lesson.title}${done ? ' · Complete' : ''}`), lessonInstructions(lesson.body));
        lessonMedia(detail, course, lesson, number);
        const complete = async answers => {
          const result = await courseApi(target + '/progress', { method:'POST', data:{ number, ...(answers ? { answers } : {}) } });
          await loadCourses();
          const finished = result.course.completedAt && !course.completedAt;
          if (finished) await loadLearningCompletions();
          const next = result.course.lessons.findIndex((_, position) => !result.course.progress.includes(position + 1)) + 1;
          drawCourse(result.course, answers ? number : next);
          if (finished) setStatus('Guide completed. Your progress is saved.','success');
          else if (answers) setStatus('Practice complete. Your progress is saved.','success');
          else setStatus('Lesson marked complete.','success');
        };
        const hasQuestions = lessonQuestions(detail, lesson.questions, { done, submit:complete });
        if (!done && !hasQuestions) detail.append(actionRow(button('Mark lesson complete', () => run(() => complete()))));
        card.append(detail);
      });
      if (course.practical) drawPractical(card, course, target);
    }
    $('portal-courses-reader').replaceChildren(card);
    heading.focus();
  }

  function drawPractical(card, course, target) {
    const practical = node('section', undefined, 'portal-record portal-course-lesson');
    practical.append(node('h4', 'Practical activity'), node('p', course.practical, 'portal-preserve'));
    const submitted = course.assessment;
    if (submitted) {
      practical.append(badge(practicalStates[submitted.status], submitted.status));
      if (submitted.feedback) practical.append(node('p', submitted.feedback, 'portal-preserve'));
    }
    if (submitted?.status === 'submitted' || submitted?.status === 'passed') {
      const copy = node('details');
      copy.append(node('summary', 'Your submitted response'), node('p', submitted.response, 'portal-preserve'));
      practical.append(copy);
    } else if (course.progress.length < course.lessons.length) {
      practical.append(node('p', 'Complete the lessons to submit your practical.', 'portal-hint'));
    } else {
      const form = node('form', undefined, 'portal-form');
      form.append(node('p', 'Use fictional names and situations. Your response goes to the group’s course assessors.', 'portal-hint'),
        courseField('response', 'Your practical response', 2700, 6, submitted?.response ?? ''), courseSubmit(submitted ? 'Resubmit practical' : 'Submit practical'));
      form.addEventListener('input', () => { form.dataset.dirty = 'true'; });
      courseForm(form, async current => {
        const result = await courseApi(target + '/practical', { method:'POST', data:{ response:value(current,'response'), previousAttempt:submitted?.attempt ?? 0 } });
        await loadCourses();
        drawCourse(result.course);
      }, 'Your practical was sent to the course assessors.');
      practical.append(form);
    }
    card.append(practical);
  }

  async function loadCourseGroups(page = 1) {
    const result = await courseApi(`course-staff/groups?page=${page}`);
    courses.groups = mergeRows(courses.groups, result.groups, page);
    if (!courses.groups.some(group => group.id === courses.site)) {
      courses.site = courses.groups.find(group => group.id === 'plfc-training')?.id ?? courses.groups[0]?.id ?? '';
    }
    renderCourseGroups();
    const actions = $('portal-courses-group-actions');
    actions.replaceChildren();
    if (result.more) actions.append(button('Load more groups', () => run(() => loadCourseGroups(page + 1))));
    if (page === 1 && courses.site) await loadCourseStaff();
    $('portal-courses-staff').hidden = !courses.site;
  }

  function renderCourseGroups() {
    const holder = $('portal-courses-group');
    holder.replaceChildren();
    if (!courses.groups.length) { empty(holder,'You don’t have any training groups to manage yet.'); return; }
    for (const group of courses.groups) {
      const select = button(group.name, () => {
        if (state.busy || group.id === courses.site) return;
        if (!closeCourseAssessment(true)) return;
        run(async () => {
          courses.site = group.id;
          renderCourseGroups();
          $('portal-courses-versions').replaceChildren();
          $('portal-courses-assessments').replaceChildren();
          courseHomeSection('courses');
          await loadCourseStaff();
          holder.querySelector('[aria-pressed="true"]')?.focus();
        });
      });
      select.setAttribute('aria-pressed',String(group.id === courses.site));
      holder.append(select);
    }
  }

  async function loadCourseStaff(versionsPage = 1, queuePage = 1, part = '') {
    const result = await courseApi(`course-staff/groups/${courses.site}?page=${versionsPage}&queue=${queuePage}`);
    courses.categories = result.categories;
    if (part !== 'queue') renderLearningPage('portal-courses-versions', versionsPage, result.moreVersions, result.versions, item => {
      const card = node('article',undefined,'course-library-card');
      const artwork = courseArtwork(item);
      const art = node('div',undefined,'course-library-art');
      art.dataset.sprite = artwork;
      art.append(courseSprite(artwork));
      const status = node('div');
      status.append(badge(`${item.state === 'draft' ? 'Draft' : 'Published'} · Version ${item.revision}`, item.state));
      card.append(art,status,node('h5',item.title),
        node('p', `${item.lessons.length} ${item.lessons.length === 1 ? 'lesson' : 'lessons'} · ${item.practical ? 'Assessed course' : 'Read-through guide'}`, 'portal-hint'));
      card.append(node('p', item.description));
      const controls = [button(item.state === 'draft' ? 'Edit draft' : 'Preview course', () => openCourseEditor(item), 'primary')];
      if (item.state === 'published') {
        controls.push(button('Draft next version', () => {
          if (!permitEditorClose()) return;
          run(async () => {
            const version = await courseApi(draftSlug(item), { method:'PATCH', data:{ action:'revise' } });
            closeCourseEditor();
            await loadCourseStaff();
            openCourseEditor({ ...item, ...version, state:'draft', editVersion:1 });
          }, 'A new draft version is ready.');
        }));
      }
      card.append(actionRow(...controls));
      return card;
    }, next => loadCourseStaff(next, 1, 'versions'), 'This group has no courses yet.', appendCourseCard);
    if (part !== 'versions') renderLearningPage('portal-courses-assessments', queuePage, result.moreQueue, result.queue,
      courseAssessmentCard, next => loadCourseStaff(1, next, 'queue'), 'There are no practicals awaiting assessment.');
  }

  function closeCourseEditor() {
    courses.editorDirty = false;
    const editor = $('portal-courses-editor');
    editor.replaceChildren();
    editor.hidden = true;
    $('portal-courses-home').hidden = false;
  }

  function permitEditorClose() {
    return !courses.editorDirty || window.confirm('Discard your unsaved course draft edits?');
  }

  function previewCourse(course, initial = 0) {
    const preview = node('div', undefined, 'course-learn-preview');
    const row = node('div',undefined,'course-workspace');
    const outline = node('nav',undefined,'course-outline');
    outline.setAttribute('aria-label','Preview lesson outline');
    const content = node('section',undefined,'course-work-paper');
    const entries = course.lessons.map((lesson,index) => ({
      title:lesson.title || 'Untitled lesson', sprite:'write', number:index+1,
      paint:() => {
        content.append(node('h3',lesson.title || 'Untitled lesson'), lessonInstructions(lesson.body));
        lessonMedia(content,course,lesson,index+1);
        lessonQuestions(content,lesson.questions,{preview:true});
      }
    }));
    if (course.practical) entries.push({title:'Practical task',sprite:'practical',paint:() => {
      content.append(node('h3','Practical task'),node('p',course.practical,'portal-preserve'));
    }});
    const controls = entries.map((entry,index) => {
      const control = courseTool(entry.title,entry.sprite,() => show(index,true));
      if (entry.number) addLessonOrder(control,entry.number,entry.title);
      return control;
    });
    function show(index, focus = false) {
      controls.forEach((control,i) => control.setAttribute('aria-pressed',String(i===index)));
      content.replaceChildren();
      entries[index]?.paint();
      if (focus) focusCourseHeading(content.querySelector('h3'));
    }
    outline.append(node('h3','Course outline'),...controls);
    show(Math.min(initial,entries.length-1));
    row.append(outline,content);
    preview.append(node('p',course.description,'portal-hint'),row);
    return preview;
  }

  const lessonField = (root, name) => root.querySelector(`[name="${name}"]`);
  const lessonText = (root, name) => lessonField(root,name).value.trim();

  function screenshotEditor(lesson) {
    const box = node('fieldset', undefined, 'portal-record');
    box.append(node('legend','Screenshot'));
    const label = node('label','PNG, JPEG or WebP, up to 1 MiB');
    const pick = node('input');
    pick.type = 'file';
    pick.accept = 'image/png,image/jpeg,image/webp';
    label.append(pick);
    const image = node('img');
    image.className = 'portal-course-image';
    const note = node('p', undefined, 'portal-hint');
    const alt = courseField('shotAlt','Describe the screen for someone who cannot see it',280,2,lesson.screenshot?.alt ?? '',false);
    const caption = courseField('shotCaption','Screenshot caption or callouts (optional)',500,2,lesson.screenshot?.caption ?? '',false);
    let screenshotId = lesson.screenshot?.id ?? '';
    const remove = button('Remove screenshot', () => {
      screenshotId = '';
      pick.value = '';
      update();
      courses.editorDirty = true;
    });
    function update() {
      image.hidden = !screenshotId;
      remove.hidden = !screenshotId;
      lessonField(box,'shotAlt').required = !!screenshotId;
      if (screenshotId) {
        image.src = `/api/learning/course-media/${screenshotId}`;
        image.alt = lessonText(box,'shotAlt') || 'Screenshot preview';
      } else image.removeAttribute('src');
      note.textContent = screenshotId ? 'Screenshot attached.' : 'Choose a screenshot cleared for this training group.';
    }
    const attach = button('Attach screenshot', () => run(async () => {
      const file = pick.files[0];
      if (!file || file.size > 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
        throw new Error('Choose a PNG, JPEG or WebP screenshot of 1 MiB or less.');
      }
      const result = await courseApi(`course-staff/media/${courses.site}/${crypto.randomUUID()}`, { method:'PUT',file });
      screenshotId = result.id;
      pick.value = '';
      update();
      courses.editorDirty = true;
      lessonField(box,'shotAlt').focus();
    }, 'Screenshot attached. Save the draft to keep it with the lesson.'));
    box.append(label, actionRow(attach, remove), image, note, alt, caption);
    alt.addEventListener('input', () => { image.alt = lessonText(box,'shotAlt') || 'Screenshot preview'; });
    update();
    return {
      box,
      read() {
        if (pick.files[0]) throw new Error('Attach the selected screenshot before saving, or clear the file.');
        if (!screenshotId) return null;
        return { id:screenshotId, alt:lessonText(box,'shotAlt'), caption:lessonText(box,'shotCaption') };
      }
    };
  }

  function questionEditor(question = {}) {
    const block = node('fieldset', undefined, 'portal-record portal-course-question-edit');
    const id = question.id ?? `q-${crypto.randomUUID()}`;
    const radioName = `answer-${crypto.randomUUID()}`;
    const choices = node('div');
    function addChoice(choice = {}) {
      const row = node('div',undefined,'course-question-choice');
      row.dataset.id = choice.id ?? `c-${crypto.randomUUID()}`;
      const correct = node('label',undefined,'portal-check');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = radioName;
      radio.value = row.dataset.id;
      radio.checked = radio.value === question.correct_choice_id;
      radio.required = true;
      radio.dataset.answerKey = '';
      correct.append(radio,node('span','Correct answer'));
      row.append(courseField('answerText','Choice',240,0,choice.text ?? ''),correct);
      choices.append(row);
    }
    for (const choice of question.choices ?? [{ id:'a' },{ id:'b' }]) addChoice(choice);
    const removeChoice = button('Remove last choice', () => {
      if (choices.childElementCount <= 2) return setStatus('A question needs at least two choices.','error');
      choices.lastElementChild.remove();
      courses.editorDirty = true;
    });
    const moreChoice = button('Add choice', () => {
      if (choices.childElementCount >= 4) return setStatus('A question can have up to four choices.','error');
      addChoice();
      choices.lastElementChild.querySelector('input').focus();
      courses.editorDirty = true;
    });
    block.append(node('legend','Practice question'), courseField('questionPrompt','Question',480,2,question.prompt ?? ''),
      choices, actionRow(moreChoice,removeChoice),
      courseField('answerExplanation','Explain the correct answer',650,3,question.explanation ?? ''),
      actionRow(button('Remove question', () => { block.remove(); courses.editorDirty = true; })));
    block.readQuestion = () => ({
      id, type:'single_choice', mode:'practice', prompt:lessonText(block,'questionPrompt'),
      choices:[...choices.children].map(child => ({ id:child.dataset.id,text:lessonText(child,'answerText') })),
      correct_choice_id:choices.querySelector('input[data-answer-key]:checked')?.value ?? '',
      explanation:lessonText(block,'answerExplanation'), source_refs:question.source_refs ?? []
    });
    return block;
  }

  function readLessonPacket(input) {
    const source = input.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');
    let packet;
    try { packet = JSON.parse(source); } catch { throw new Error('Paste a valid JSON lesson packet.'); }
    if (packet?.format_version !== 1 ||
        !['title','body','capture_notes','questions'].some(key => Object.hasOwn(packet,key))) {
      throw new Error('Use the version 1 lesson format from the exported prompt.');
    }
    for (const [name,max] of [['title',140],['body',2200],['capture_notes',2200]]) {
      if (name in packet && (typeof packet[name] !== 'string' || packet[name].length > max)) {
        throw new Error(`The imported ${name.replace('_',' ')} must be text and fit within ${max} characters.`);
      }
    }
    if ('questions' in packet) {
      if (!Array.isArray(packet.questions) || packet.questions.length > 4) throw new Error('Include up to four practice questions.');
      const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
      const fits = (value,limit) => typeof value === 'string' && !!value.trim() && value.trim().length <= limit;
      const valid = packet.questions.every(q => q && slug(q.id) && q.type === 'single_choice' && q.mode === 'practice' &&
        fits(q.prompt,480) && fits(q.explanation,650) && Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 4 &&
        q.choices.every(choice => choice && slug(choice.id) && fits(choice.text,240)) &&
        new Set(q.choices.map(choice => choice.id)).size === q.choices.length &&
        q.choices.some(choice => choice.id === q.correct_choice_id) &&
        (!('source_refs' in q) || Array.isArray(q.source_refs) && q.source_refs.length <= 8 && q.source_refs.every(ref => fits(ref,200))));
      if (!valid || new Set(packet.questions.map(q => q.id)).size !== packet.questions.length) {
        throw new Error('Check the question IDs, choices, correct answers and explanations against the exported format.');
      }
    }
    return packet;
  }

  function lessonPrompt(item, questionList) {
    const packet = {
      format_version:1, lesson_id:'replace-with-lesson-slug', title:lessonText(item,'lessonTitle'),
      body:lessonText(item,'lessonBody'), capture_notes:lessonText(item,'captureNotes'),
      questions:[...questionList.children].map(question => question.readQuestion())
    };
    const example = { id:'q-01',type:'single_choice',mode:'practice',prompt:'Which detail is needed?',choices:[
      { id:'a',text:'A named owner' },{ id:'b',text:'A decoration' }],correct_choice_id:'a',explanation:'The owner will follow up.',source_refs:['CAPTURE:S01'] };
    return [
      'ReadySETCO lesson prompt, format version 1',
      'Draft or revise one task-based lesson in plain Australian English. Work from approved material and the observed screen capture below.',
      'Use fictional records. Mark any unverified control, action or timing Needs capture. Do not invent observed labels or timecodes.',
      'For the person recording, list shots by ID, action and screen detail to verify. Use draft narration only for spoken instructions.',
      'Return one JSON object using the sample fields. Limit title to 140 characters, lesson body and capture_notes to 2,200 characters each, and questions to four.',
      'Use 2 to 4 choices per question, one correct choice and an explanation. Keep correct answers in the author copy.',
      'For this workflow media is attached by the human reviewer. Put proposed shot IDs and capture gaps in capture_notes.',
      'Current lesson input',JSON.stringify(packet,null,2),
      'Approved source notes or observed capture for this run','[Add your sanitised observations, source notes or transcript here.]',
      'Output format example',JSON.stringify({ ...packet,questions:[example] },null,2)
    ].join('\n\n') + '\n';
  }

  function lessonProductionEditor(item, lesson) {
    const notes = courseField('captureNotes','Recording plan and private capture notes',2200,5,lesson.captureNotes ?? '',false);
    const shot = screenshotEditor(lesson);
    const video = node('fieldset', undefined, 'portal-record');
    video.append(node('legend','Lesson video'),
      courseField('videoUrl','YouTube or direct HTTPS MP4/WebM link',1200,0,lesson.video?.url ?? '',false),
      courseField('transcript','Video transcript',6000,4,lesson.video?.transcript ?? '',false),
      courseField('captions','WebVTT captions for a direct video (optional)',8000,3,lesson.video?.captions ?? '',false),
      node('p','For YouTube, set the captions on the video host. Use a link approved for this training group.','portal-hint'));
    const captionFileLabel = node('label','Load a WebVTT captions file');
    const captionFile = node('input');
    captionFile.type = 'file';
    captionFile.accept = '.vtt,text/vtt';
    captionFileLabel.append(captionFile);
    captionFile.addEventListener('change', () => run(async () => {
      const file = captionFile.files[0];
      if (!file) return;
      if (file.size > 32000) throw new Error('Use a shorter WebVTT file.');
      const content = await file.text();
      if (content.length > 8000 || !content.trimStart().startsWith('WEBVTT')) throw new Error('Choose a WebVTT file with up to 8,000 characters.');
      lessonField(video,'captions').value = content;
      captionFile.value = '';
      courses.editorDirty = true;
    }, 'Captions loaded into the draft.'));
    video.append(captionFileLabel);
    const questions = node('div',undefined,'portal-course-question-list');
    for (const question of lesson.questions ?? []) questions.append(questionEditor(question));
    function addQuestion() {
      if (questions.childElementCount >= 4) return setStatus('A lesson can have up to four practice questions.','error');
      const block = questionEditor();
      questions.append(block);
      block.querySelector('textarea').focus();
      courses.editorDirty = true;
    }
    const exchange = node('div',undefined,'course-draft-exchange');
    const importBox = courseField('lessonPacket','Paste the JSON returned by your model',64000,5,'',false);
    const paste = lessonField(importBox,'lessonPacket');
    exchange.append(node('p','Copy the prompt into a model you choose, then bring its draft back here. Remove private records before sharing.','portal-hint'),
      actionRow(button('Download lesson prompt', () => download(lessonPrompt(item,questions),'readysetco-lesson-prompt.txt','text/plain;charset=utf-8'))),
      importBox, actionRow(button('Import into this lesson', () => {
        try {
          const packet = readLessonPacket(paste.value);
          if ('questions' in packet && questions.childElementCount && !window.confirm('Replace the questions in this lesson?')) return;
          for (const [key,name] of [['title','lessonTitle'],['body','lessonBody'],['capture_notes','captureNotes']]) {
            if (key in packet) lessonField(item,name).value = packet[key];
          }
          if ('questions' in packet) questions.replaceChildren(...packet.questions.map(questionEditor));
          paste.value = '';
          courses.editorDirty = true;
          item.refreshOutline?.();
          item.showMode('write');
          setStatus('AI draft imported. Review the lesson, then save it.','success');
        } catch (error) { setStatus(error.message,'error'); }
      })));
    const questionArea = node('div');
    questionArea.append(questions,actionRow(button('Add practice question',addQuestion,'primary')));
    const aiArea = node('div',undefined,'course-field-stack');
    aiArea.append(exchange,notes);
    item.readLesson = () => {
      const screenshot = shot.read();
      const url = lessonText(video,'videoUrl');
      const transcript = lessonText(video,'transcript');
      const captions = lessonText(video,'captions');
      if (url && !transcript) throw new Error('Add a transcript for the lesson video.');
      if (!url && (transcript || captions)) throw new Error('Add a video link for the transcript or captions.');
      const captureNotes = lessonText(item,'captureNotes');
      return {
        title:lessonText(item,'lessonTitle'), body:lessonText(item,'lessonBody'),
        ...(captureNotes ? { captureNotes } : {}), ...(screenshot ? { screenshot } : {}),
        ...(url ? { video:{ url,transcript,captions } } : {}),
        questions:[...questions.children].map(question => question.readQuestion())
      };
    };
    return { screenshot:shot.box, video, questions:questionArea, ai:aiArea };
  }

  function courseLessonEditor(lesson = { title:'',body:'' }) {
    const item = node('section',undefined,'course-lesson-piece');
    const sections = lessonProductionEditor(item,lesson);
    const write = node('div',undefined,'course-field-stack');
    write.append(courseField('lessonTitle','Lesson title',140,0,lesson.title),courseField('lessonBody','Lesson instructions',2200,8,lesson.body));
    write.append(node('p','Add a link on its own line using a label, a vertical bar and the full HTTPS address.', 'portal-hint'));
    const tools = [
      { id:'write',label:'Write',panel:write },
      { id:'screenshot',label:'Screenshot',panel:sections.screenshot },
      { id:'video',label:'Video',panel:sections.video },
      { id:'questions',label:'Questions',panel:sections.questions },
      { id:'ai',label:'AI draft',panel:sections.ai }
    ];
    const modes = node('nav',undefined,'course-mode-bar');
    modes.setAttribute('aria-label','Lesson tools');
    for (const tool of tools) {
      tool.pane = node('section',undefined,'course-work-paper');
      tool.pane.append(node('h3',tool.id === 'write' ? 'Write the lesson' : tool.label),tool.panel);
      tool.toggle = courseTool(tool.label,tool.id,() => item.showMode(tool.id));
      modes.append(tool.toggle);
    }
    item.showMode = name => {
      for (const tool of tools) {
        const active = tool.id === name;
        tool.pane.hidden = !active;
        tool.toggle.setAttribute('aria-pressed',String(active));
      }
    };
    item.revealField = field => {
      const tool = tools.find(option => option.pane.contains(field));
      if (tool) item.showMode(tool.id);
    };
    item.moveTools = actionRow();
    item.moveTools.classList.add('course-outline-tools');
    item.append(modes,...tools.map(tool => tool.pane),item.moveTools);
    item.showMode('write');
    return item;
  }

  function focusCourseHeading(heading) {
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }

  function courseCategoryPicker(categories) {
    const options = node('fieldset',undefined,'portal-record course-category-options');
    options.append(node('legend','Course category'));
    for (const category of categories) {
      const label = node('label',undefined,'portal-check');
      const input = node('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = category.id;
      input.required = true;
      label.append(input,node('span',category.name));
      options.append(label);
    }
    return options;
  }

  function previewVideo(video, saved) {
    if (!video) return undefined;
    try {
      const url = new URL(video.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
      const parts = url.pathname.split('/').filter(Boolean);
      if (['www.youtube.com','youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com'].includes(url.hostname)) {
        const id = url.hostname === 'youtu.be' ? parts[0] : url.pathname === '/watch' ? url.searchParams.get('v') : parts[1];
        if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? '')) return undefined;
        return { url:`https://www.youtube-nocookie.com/embed/${id}`,transcript:video.transcript };
      }
      if (!/\.(mp4|webm)$/i.test(url.pathname)) return undefined;
      const captions = saved?.url === url.href && saved.captions === video.captions ? saved.captions : '';
      return { url:url.href,transcript:video.transcript,captions };
    } catch { return undefined; }
  }

  function openCourseEditor(item) {
    if (!permitEditorClose()) return;
    closeCourseEditor();
    let saved = item;
    const editor = $('portal-courses-editor');
    const panel = node('section');
    const toolbar = node('div',undefined,'course-toolbar');
    const leave = button('Back to courses', () => {
      if (!permitEditorClose()) return;
      closeCourseEditor();
      $('course-builder-title').focus();
    });
    const studioTitle = node('header',undefined,'course-studio-title course-course-heading');
    const titles = node('div');
    const heading = node('h2',item?.title ?? 'New course draft');
    heading.tabIndex = -1;
    const stateLabel = badge(item ? `${item.state === 'draft' ? 'Draft' : 'Published'} · Version ${item.revision}` : 'New draft',item?.state ?? 'draft');
    titles.append(heading,stateLabel);
    studioTitle.append(courseSprite(item ? courseArtwork(item) : 'library'),titles);
    panel.append(toolbar,studioTitle);
    const mounted = () => {
      editor.replaceChildren(panel);
      editor.hidden = false;
      $('portal-courses-home').hidden = true;
      heading.focus();
    };
    if (item?.state === 'published') {
      toolbar.append(leave,courseSprite('preview'),node('p','Learner preview'));
      panel.append(previewCourse(item));
      mounted();
      return;
    }
    const form = node('form',undefined,'portal-form course-studio-form');
    const workspace = node('div',undefined,'course-workspace');
    const outline = node('nav',undefined,'course-outline');
    outline.setAttribute('aria-label','Course outline');
    const list = node('div',undefined,'course-outline-list');
    const main = node('div',undefined,'course-main-work');
    const settings = node('section',undefined,'course-work-paper course-field-stack');
    const category = item ? null : courseCategoryPicker(courses.categories);
    settings.append(node('h3','Course details'),courseField('title','Course title',140,0,item?.title),
      courseField('description','What will people learn?',360,3,item?.description));
    if (category) settings.append(category);
    const practical = node('section',undefined,'course-work-paper course-field-stack');
    practical.append(node('h3','Practical task'),node('p','Add a task and what the assessor should check for an assessed course. Leave the task blank for a read-through guide.','portal-hint'),
      courseField('practical','What should learners do, and what will you look for?',1200,7,item?.practical,false));
    const lessons = node('div');
    const preview = node('section');
    preview.hidden = true;
    const save = courseSubmit('Save draft');
    save.setAttribute('form','course-studio-draft');
    form.id = 'course-studio-draft';
    const feedback = node('p',undefined,'portal-hint');
    feedback.setAttribute('role','status');
    const change = courseTool('Preview as a learner','preview',togglePreview);
    const actions = actionRow(change,save);
    toolbar.append(leave,feedback,actions);
    let active = settings;
    const settingTab = courseTool('Course details','settings',() => show(settings,true));
    const taskTab = courseTool('Practical task','practical',() => show(practical,true));
    const add = button('Add lesson',() => {
      if (lessons.childElementCount >= 8) { setStatus('A course version can have up to eight lessons.','error'); return; }
      const lesson = installLesson();
      courses.editorDirty = true;
      show(lesson);
      lessonField(lesson,'lessonTitle').focus();
    });
    add.classList.add('course-outline-add');

    function show(section, focus = false) {
      active = section;
      settings.hidden = section !== settings;
      practical.hidden = section !== practical;
      lessons.hidden = !lessons.contains(section);
      for (const lesson of lessons.children) {
        lesson.hidden = lesson !== section;
        lesson.outlineButton?.setAttribute('aria-pressed',String(lesson === section));
      }
      settingTab.setAttribute('aria-pressed',String(section === settings));
      taskTab.setAttribute('aria-pressed',String(section === practical));
      if (focus) focusCourseHeading(section.querySelector('h3:not([hidden] h3)'));
    }
    function renderOutline() {
      list.replaceChildren();
      for (const [index,lesson] of [...lessons.children].entries()) {
        const title = lessonText(lesson,'lessonTitle') || 'Untitled lesson';
        const control = courseTool(title,null,() => show(lesson,true));
        addLessonOrder(control,index + 1,title);
        lesson.outlineButton = control;
        control.setAttribute('aria-pressed',String(lesson === active));
        list.append(control);
      }
    }
    function installLesson(data) {
      const lesson = courseLessonEditor(data);
      lesson.refreshOutline = renderOutline;
      lessons.append(lesson);
      function move(direction) {
        const sibling = direction < 0 ? lesson.previousElementSibling : lesson.nextElementSibling;
        if (!sibling) return;
        sibling.insertAdjacentElement(direction < 0 ? 'beforebegin' : 'afterend',lesson);
        courses.editorDirty = true;
        renderOutline();
      }
      lesson.moveTools.append(button('Move up',() => move(-1)),button('Move down',() => move(1)),button('Remove lesson',() => {
        if (lessons.childElementCount === 1) { setStatus('A course needs at least one lesson.','error'); return; }
        if (!window.confirm('Remove this lesson from the draft?')) return;
        const next = lesson.nextElementSibling ?? lesson.previousElementSibling;
        lesson.remove();
        courses.editorDirty = true;
        renderOutline();
        show(next);
        next.outlineButton.focus();
      }));
      lessonField(lesson,'lessonTitle').addEventListener('input',renderOutline);
      renderOutline();
      return lesson;
    }
    function readDraft() {
      return {title:value(form,'title'),description:value(form,'description'),practical:value(form,'practical'),
        lessons:[...lessons.children].map(lesson => lesson.readLesson())};
    }
    function togglePreview() {
      if (!preview.hidden) {
        preview.hidden = true;
        preview.replaceChildren();
        workspace.hidden = false;
        change.lastChild.textContent = 'Preview as a learner';
        save.hidden = false;
        return;
      }
      let draft;
      try {
        draft = readDraft();
        draft.lessons = draft.lessons.map((lesson,index) => ({
          ...lesson, video:previewVideo(lesson.video,saved?.lessons[index]?.video)
        }));
      } catch (error) { setStatus(error.message,'error'); return; }
      const view = previewCourse({ ...saved,...draft },Math.max(0,[...lessons.children].indexOf(active)));
      const publish = button('Publish to this group',() => {
        if (!saved || courses.editorDirty) return;
        const group = courses.groups.find(item => item.id === courses.site)?.name ?? 'this group';
        if (!window.confirm(`Publish version ${saved.revision} to ${group}?`)) return;
        run(async () => {
          await courseApi(draftSlug(saved),{method:'PATCH',data:{action:'publish',editVersion:saved.editVersion}});
          closeCourseEditor();
          await loadCourseStaff();
          $('course-builder-title').focus();
        },'Course published to the selected group.');
      },'primary');
      publish.disabled = !saved || courses.editorDirty;
      const comment = publish.disabled ? node('p','Save the draft before publishing.','portal-hint') : null;
      preview.replaceChildren(view,actionRow(publish));
      if (comment) preview.append(comment);
      preview.hidden = false;
      workspace.hidden = true;
      save.hidden = true;
      change.lastChild.textContent = 'Back to editing';
    }

    for (const lesson of item?.lessons ?? [undefined]) installLesson(lesson);
    outline.append(node('h3','Course outline'),settingTab,list,add,taskTab);
    main.append(settings,lessons,practical);
    workspace.append(outline,main);
    form.append(workspace);
    panel.append(form,preview);
    show(item ? lessons.firstElementChild : settings);
    form.revealCourseField = field => {
      if (settings.contains(field)) { show(settings); return; }
      if (practical.contains(field)) { show(practical); return; }
      const lesson = [...lessons.children].find(item => item.contains(field));
      if (lesson) {
        show(lesson);
        lesson.revealField(field);
      }
    };
    form.addEventListener('input',() => {
      courses.editorDirty = true;
      if (feedback.textContent) feedback.textContent = '';
    });
    courseForm(form,async () => {
      const values = readDraft();
      if (saved) {
        await courseApi(draftSlug(saved),{method:'PATCH',data:{...values,action:'save',editVersion:saved.editVersion}});
        saved = {...saved,...values,editVersion:saved.editVersion+1};
      } else {
        const data = {...values,siteId:courses.site,category:value(form,'category')};
        const created = await courseApi('course-staff/drafts',{method:'POST',data:stableCreate('course-draft',data)});
        retries.delete('course-draft');
        saved = {...values,...created,state:'draft',editVersion:1};
        category.remove();
      }
      courses.editorDirty = false;
      heading.textContent = saved.title;
      stateLabel.textContent = `Draft · Version ${saved.revision}`;
      feedback.textContent = 'Draft saved.';
      await loadCourseStaff();
    },'Course draft saved.');
    mounted();
  }

  function closeCourseAssessment(confirm = false) {
    const editor = $('portal-courses-assessment-editor');
    if (confirm && editor.querySelector('form[data-dirty="true"]') && !window.confirm('Discard your unsaved assessment?')) return false;
    editor.replaceChildren();
    editor.hidden = true;
    $('portal-courses-assessments').hidden = false;
    return true;
  }

  function courseAssessmentCard(item) {
    const card = node('article', undefined, 'portal-record');
    const summary = node('div',undefined,'course-assessor-summary');
    summary.append(courseSprite('assess'),node('h4',`${item.learner} · ${item.title}`));
    const review = button('Review practical',() => openCourseAssessment(item),'primary');
    card.append(summary,node('p',`Version ${item.revision} · Attempt ${item.attempt} · Submitted ${date(item.submittedAt)}`,'portal-hint'),
      actionRow(review));
    return card;
  }

  function openCourseAssessment(item) {
    const editor = $('portal-courses-assessment-editor');
    const heading = node('h3',`${item.learner} · ${item.title}`);
    const task = node('div',undefined,'course-work-paper');
    const back = button('Back to assessments',() => {
      if (closeCourseAssessment(true)) $('portal-courses-assessments').querySelector('button')?.focus();
    });
    task.append(actionRow(back),heading,
      node('h4','Practical instructions'),node('p',item.practical,'portal-preserve'),
      node('h4','Learner response'),node('p',item.response,'portal-preserve'));
    const form = node('form', undefined, 'portal-form');
    const decisions = node('fieldset',undefined,'portal-record course-category-options');
    decisions.append(node('legend','Assessment decision'));
    for (const [key,title] of [['passed','Pass and record completion'],['revise','Request changes']]) {
      const label = node('label',undefined,'portal-check');
      const input = node('input');
      input.type = 'radio';
      input.name = 'decision';
      input.value = key;
      input.required = true;
      label.append(input,node('span',title));
      decisions.append(label);
    }
    form.append(decisions, courseField('feedback','Feedback for the learner',1400,4,'',false), courseSubmit('Save assessment'));
    form.addEventListener('input', () => {
      form.dataset.dirty = 'true';
      field(form,'feedback').required = value(form,'decision') === 'revise';
    });
    courseForm(form, async current => {
      await courseApi(`course-staff/practical/${item.enrolmentId}/${item.attempt}`, { method:'PATCH',
        data:{ decision:value(current,'decision'), feedback:value(current,'feedback') } });
      closeCourseAssessment();
      await loadCourseStaff(1, 1, 'queue');
    }, 'Practical assessment saved.');
    task.append(form);
    editor.replaceChildren(task);
    editor.hidden = false;
    $('portal-courses-assessments').hidden = true;
    focusCourseHeading(heading);
  }

  function profileData() {
    const form = $('portal-profile');
    return { displayName: value(form, 'displayName'), email: value(form, 'email'), phone: value(form, 'phone'), organisation: value(form, 'organisation'), locality: value(form, 'locality'), interests: [...form.querySelectorAll('input[name="interests"]:checked')].map(input => input.value), about: value(form, 'about'), consentContact: checked(form, 'consentContact'), consentFutureHandover: checked(form, 'consentFutureHandover'), expectedVersion: state.profile?.version ?? 0 };
  }
  function renderProfile() {
    const form = $('portal-profile'), profile = state.profile || {};
    for (const name of ['displayName', 'email', 'phone', 'organisation', 'locality', 'about']) field(form, name).value = profile[name] || (['displayName', 'email'].includes(name) ? state.identity[name] : '') || '';
    for (const name of ['consentContact', 'consentFutureHandover']) field(form, name).checked = profile[name] === true;
    for (const input of form.querySelectorAll('[name="interests"]')) input.checked = (profile.interests || []).includes(input.value);
    $('portal-profile-meta').textContent = profile.version ? `Saved ${date(profile.updatedAt)} · Version ${profile.version}` : 'Review and save your contact choices before applying to a group.';
    state.profileDirty = false;
  }
  async function loadParticipantData() {
    const revision = authRevision;
    const [profile, sites, applications, groups] = await Promise.all([api('/api/member/profile'), api('/api/member/sites'), api('/api/member/applications'), api('/api/member/groups')]);
    checkAuthRevision(revision);
    state.profile = profile.profile; renderProfile();
    receiveSites(sites); receiveApplications(applications); receiveGroups(groups); state.participantLoaded = true;
  }
  async function loadPortalData() {
    const revision = authRevision;
    if (state.identity.webmaster) {
      const [sites, committee] = await Promise.all([api('/api/webmaster/sites'), api('/api/committee/sites')]);
      checkAuthRevision(revision); receiveAllSites(sites); receiveCommitteeSites(committee); await loadWebmasterLists();
    } else {
      const [, committee] = await Promise.all([loadParticipantData(), api('/api/committee/sites')]);
      checkAuthRevision(revision); receiveCommitteeSites(committee);
    }
  }
  function receiveSites(result, page = 1) {
    state.sites = mergeRows(state.sites, result.sites || [], page);
    const available = state.sites.filter(site => site.applicationsOpen), select = $('portal-application-workspace'), selected = select.value;
    fillOptions(select, available, 'Choose a group', selected);
    $('portal-no-open-groups').hidden = available.length > 0; $('portal-application').hidden = !available.length;
    showMore($('portal-application-details'), result, async next => receiveSites(await api(`/api/member/sites?page=${next}`), next));
  }
  function receiveApplications(result, page = 1) {
    state.applications = mergeRows(state.applications, result.applications || [], page); renderApplications();
    showMore($('portal-application-list'), result, async next => receiveApplications(await api(`/api/member/applications?page=${next}`), next));
  }
  function receiveGroups(result, page = 1) {
    state.groups = mergeRows(state.groups, result.groups || [], page); renderGroups();
    showMore($('portal-groups-list'), result, async next => receiveGroups(await api(`/api/member/groups?page=${next}`), next));
  }
  function receiveCommitteeSites(result, page = 1) {
    state.committeeSites = mergeRows(state.committeeSites, result.sites || [], page);
    updatePortalView();
    fillOptions($('portal-committee-workspace'), state.committeeSites, 'Choose a group', state.selectedCommittee);
    showMore($('portal-committee-workspace'), result, async next => receiveCommitteeSites(await api(`/api/committee/sites?page=${next}`), next));
  }
  function receiveAllSites(result, page = 1) {
    state.allSites = mergeRows(state.allSites, result.sites || [], page); renderSiteOptions();
    for (const id of ['portal-site-select', 'portal-role-workspace', 'portal-invitation-workspace']) showMore($(id), result, async next => { const revision = authRevision; const sites = await api(`/api/webmaster/sites?page=${next}`); checkAuthRevision(revision); receiveAllSites(sites, next); });
  }
  function applicationDetails(application, card) {
    if (application.motivation) card.append(node('p', application.motivation, 'portal-preserve'));
    if (application.reviewNote) { card.append(node('h4', 'Response from the group'), node('p', application.reviewNote, 'portal-preserve')); }
    if (application.admissionDate) card.append(node('p', `Admission date: ${application.admissionDate}`, 'portal-hint'));
    card.append(node('p', `Updated ${date(application.updatedAt)} · Reference ${application.id}`, 'portal-hint'));
  }
  function renderApplications() {
    const list = $('portal-application-list'); list.replaceChildren();
    if (!state.applications.length) { empty(list, 'You have not submitted any group applications yet.'); return; }
    for (const application of state.applications) {
      const card = record(application.siteName || application.siteId, application.status); applicationDetails(application, card);
      const actions = actionRow(button('View saved history', () => run(() => loadApplicationHistory(application, card))));
      if (['submitted', 'in_review', 'more_info', 'accepted_participant'].includes(application.status)) actions.append(button('Withdraw application', () => run(async () => {
        await api(`/api/member/applications/${application.id}`, { method: 'PATCH', data: { expectedVersion: application.version, action: 'withdraw' } }); await reloadApplications(); receiveGroups(await api('/api/member/groups')); $('portal-group-content').hidden = true; $('portal-post-list').replaceChildren();
      }, 'Your application has been withdrawn.')));
      if (application.status === 'more_info') actions.append(button('Add requested information', () => editApplication(application)));
      card.append(actions); list.append(card);
    }
  }
  async function loadApplicationHistory(application, card, page = 1) {
    const result = await api(`/api/member/applications/${application.id}/history?page=${page}`);
    let history = card.querySelector('.portal-history');
    if (!history) { history = node('div', undefined, 'portal-history'); history.id = `portal-history-${application.id}`; card.append(history); }
    history.savedRows = mergeRows(history.savedRows || [], result.revisions || [], page);
    history.replaceChildren(node('h4', 'Application history'));
    for (const revision of history.savedRows) {
      const snapshot = revision.snapshot || {};
      history.append(node('p', `${date(revision.createdAt)} · Version ${revision.version || '?'} · ${STATUS[snapshot.status] || String(revision.event || 'Saved change').replaceAll('_', ' ')}`, 'portal-hint'));
      if (snapshot.reviewNote) history.append(node('p', snapshot.reviewNote, 'portal-preserve'));
    }
    if (!history.savedRows.length) history.append(node('p', 'No revisions returned.'));
    showMore(history, result, next => loadApplicationHistory(application, card, next));
  }
  async function reloadApplications() { receiveApplications(await api('/api/member/applications')); }
  function editApplication(application) {
    const form = $('portal-application'); state.resubmission = application;
    fillOptions($('portal-application-workspace'), state.sites, 'Choose a group', application.siteId);
    for (const name of ['motivation', 'skills', 'availability']) field(form, name).value = application[name] || '';
    field(form, 'siteId').disabled = true; $('portal-application-details').open = true; form.hidden = false;
    form.querySelector('[type="submit"]').textContent = 'Send updated information'; field(form, 'motivation').focus();
    setStatus('Add the information requested. Your previous submission remains in the saved history.');
  }
  function renderGroups() {
    const list = $('portal-groups-list'); list.replaceChildren();
    if (!state.groups.length) { empty(list, 'Your accepted groups will appear here. You can apply through My applications.'); return; }
    for (const group of state.groups) {
      const card = record(group.name, group.role);
      card.append(node('p', group.locality || '', 'portal-hint'), button('Open group', () => run(() => loadGroup(group.id)))); list.append(card);
    }
  }
  async function loadGroup(siteId, page = 1) {
    const result = await api(`/api/member/groups/${encodeURIComponent(siteId)}/bulletins?page=${page}`);
    const group = state.groups.find(item => item.id === siteId); if (!group) throw new Error('This group is not in your current access list.');
    state.selectedGroup = siteId; $('portal-group-content').hidden = false; $('portal-group-name').textContent = group.name;
    $('portal-group-role').textContent = STATUS[group.role] || group.role;
    $('portal-group-membership').textContent = group.legalMembershipStatus === 'admitted' ? 'Cooperative admission has been recorded. See your application record for its evidence.' : 'Group participation access is recorded. Cooperative admission has not been recorded for this account.';
    state.groupPosts = mergeRows(state.groupPosts || [], result.bulletins || [], page); renderBulletins($('portal-post-list'), state.groupPosts, false);
    showMore($('portal-post-list'), result, next => loadGroup(siteId, next));
  }
  function renderBulletins(list, rows, manage) {
    list.replaceChildren();
    if (!rows.length) { empty(list, 'No information has been published to this group yet.'); return; }
    for (const post of rows) {
      const card = record(post.title); card.append(badge(post.label || 'Notice'), node('p', post.body, 'portal-preserve'));
      const link = safeLink(post.link, 'Open linked document'); if (link) card.append(actionRow(link));
      card.append(node('p', `Published ${date(post.publishedAt || post.createdAt)}${post.archived ? ' · Archived' : ''}`, 'portal-hint'));
      if (manage) card.append(actionRow(button('Edit', () => editPost(post)), button('Archive', () => run(async () => {
        await api(`/api/member/groups/${encodeURIComponent(state.selectedCommittee)}/bulletins/${post.id}`, { method: 'PATCH', data: { expectedVersion: post.version, title: post.title, body: post.body, link: post.link || '', label: post.label || 'Notice', archived: true } }); await loadCommitteePosts();
      }, 'The group information has been archived.'))));
      list.append(card);
    }
  }
  function editPost(post) {
    state.selectedPost = post; const form = $('portal-post');
    for (const name of ['title', 'body', 'link', 'label']) field(form, name).value = post[name] || (name === 'label' ? 'Notice' : '');
    form.closest('details').open = true; form.querySelector('[type="submit"]').textContent = 'Save changes'; field(form, 'title').focus();
  }
  async function loadCommittee(page = 1) {
    if (!state.selectedCommittee) { $('portal-committee-content').hidden = true; return; }
    const result = await api(`/api/committee/sites/${encodeURIComponent(state.selectedCommittee)}/applications?page=${page}`);
    $('portal-committee-content').hidden = false; state.reviewApplications = mergeRows(state.reviewApplications || [], result.applications || [], page); if (page === 1) { state.selectedApplication = null; $('portal-review-editor').hidden = true; }
    const list = $('portal-review-list'); list.replaceChildren();
    if (!state.reviewApplications.length) empty(list, 'There are no applications for this group.');
    for (const application of state.reviewApplications) {
      const card = record(application.displayName || 'Participant', application.status);
      card.append(node('p', application.organisation || '', 'portal-hint'), node('p', application.motivation, 'portal-preserve'), button('Review application', () => openReview(application))); list.append(card);
    }
    showMore($('portal-review-list'), result, loadCommittee);
    if (page === 1) await loadCommitteePosts();
  }
  async function loadCommitteePosts(page = 1) { const result = await api(`/api/member/groups/${encodeURIComponent(state.selectedCommittee)}/bulletins?page=${page}`); state.committeePosts = mergeRows(state.committeePosts || [], result.bulletins || [], page); renderBulletins($('portal-committee-posts'), state.committeePosts, true); showMore($('portal-committee-posts'), result, loadCommitteePosts); }
  function openReview(application) {
    state.selectedApplication = application; const form = $('portal-review');
    $('portal-review-editor').hidden = false; $('portal-review-applicant').textContent = `${application.displayName || 'Participant'}${application.organisation ? ` · ${application.organisation}` : ''}`;
    $('portal-review-statement').textContent = [application.motivation, application.skills && `Skills: ${application.skills}`, application.availability && `Availability: ${application.availability}`].filter(Boolean).join('\n\n');
    field(form, 'status').value = ['submitted', 'withdrawn'].includes(application.status) ? 'in_review' : application.status;
    for (const name of ['reviewNote', 'admissionDate', 'decisionRef', 'evidenceRef']) field(form, name).value = application[name] || '';
    updateAdmission(); field(form, 'status').focus();
  }
  function updateAdmission() {
    const form = $('portal-review'), admission = value(form, 'status') === 'admitted'; $('portal-admission-fields').hidden = !admission;
    for (const name of ['admissionDate', 'decisionRef', 'evidenceRef']) field(form, name).required = admission;
  }
  function updatePagination() {
    $('portal-accounts-prev').disabled = state.busy || state.accountPage <= 1;
    $('portal-accounts-next').disabled = state.busy || state.accountPage * 25 >= state.accountTotal;
    $('portal-accounts-page').textContent = `Page ${state.accountPage} · ${state.accountTotal} accounts`;
    $('portal-invitations-prev').disabled = state.busy || state.invitationPage <= 1;
    $('portal-invitations-next').disabled = state.busy || state.invitationPage * 25 >= state.invitationTotal;
    $('portal-invitations-page').textContent = `Page ${state.invitationPage} · ${state.invitationTotal} invitations`;
  }
  async function loadWebmasterLists() { await Promise.all([loadAccounts(), loadInvitations()]); }
  async function loadInvitations() {
    const revision = authRevision;
    const result = await api(`/api/webmaster/committee-invitations?page=${state.invitationPage}&pageSize=25&search=${encodeURIComponent(state.invitationSearch)}`);
    checkAuthRevision(revision);
    state.invitations = result.invitations || []; state.invitationTotal = result.total || 0;
    const list = $('portal-invitation-list'); list.replaceChildren();
    if (!state.invitations.length) empty(list, state.invitationSearch ? 'No committee invitations match this search.' : 'No committee invitations yet. Create an invitation when someone is ready to join the committee.');
    for (const invitation of state.invitations) {
      const card = node('article', undefined, 'portal-record'); card.dataset.invitationId = invitation.id;
      card.append(node('h4', invitation.displayName), badge(STATUS[invitation.status] || invitation.status, invitation.status), node('p', `Committee · ${invitation.siteName}`), node('p', `@${invitation.username} · ${invitation.email}`, 'portal-hint'));
      const timing = invitation.status === 'accepted' ? `Accepted ${date(invitation.acceptedAt)}` : invitation.status === 'cancelled' ? `Cancelled ${date(invitation.cancelledAt)}` : `${invitation.status === 'expired' ? 'Expired' : 'Expires'} ${date(invitation.expiresAt)}`;
      card.append(node('p', timing, 'portal-hint'));
      if (['pending', 'expired'].includes(invitation.status)) card.append(actionRow(button('Renew private link', () => run(() => invitationAction(invitation, 'renew'))), button('Cancel invitation', () => run(() => invitationAction(invitation, 'cancel')))));
      if (invitation.status === 'cancelled') card.append(actionRow(button('Reopen invitation', () => run(() => invitationAction(invitation, 'reopen')))));
      if (invitation.status === 'accepted') {
        card.append(node('p', 'Use account management to review or change this person’s current group access.', 'portal-hint'));
        card.append(actionRow(button('Manage account', () => run(() => manageInvitationAccount(invitation)))));
      }
      list.append(card);
    }
    updatePagination();
  }
  async function invitationAction(invitation, action) {
    const revision = authRevision;
    clearPrivateLink();
    const result = await api(`/api/webmaster/committee-invitations/${invitation.id}/${action}`, { method: 'POST', data: { expectedVersion: invitation.version } });
    checkAuthRevision(revision);
    if (state.selectedAccount?.accountId === result.account?.accountId) updateSelectedAccount(result.account);
    if (result.token) showPrivateLink(result);
    await loadWebmasterLists();
    setStatus(action === 'cancel' ? 'The invitation has been cancelled. Its unused link no longer works.' : action === 'reopen' ? 'The invitation is open again. Share the new private link with the intended person.' : 'A new private link is ready. The previous link no longer works. No message has been sent.', 'success');
  }
  async function manageInvitationAccount(invitation) {
    const revision = authRevision;
    const result = await api(`/api/webmaster/committee-invitations/${invitation.id}`);
    checkAuthRevision(revision); openAccount(result.account);
    const current = result.invitation || invitation, select = $('portal-role-workspace');
    if (![...select.options].some(item => item.value === current.siteId)) option(select, current.siteName, current.siteId);
    $('portal-account-role-details').open = true; select.value = current.siteId;
    await loadRole();
  }
  async function loadAccounts() {
    const revision = authRevision;
    const result = await api(`/api/webmaster/accounts?page=${state.accountPage}&pageSize=25&search=${encodeURIComponent(state.accountSearch)}`);
    checkAuthRevision(revision);
    state.accounts = result.accounts || []; state.accountTotal = result.total || 0;
    const list = $('portal-account-list'); list.replaceChildren();
    if (!state.accounts.length) empty(list, 'No accounts match this search.');
    for (const account of state.accounts) {
      const card = record(account.displayName, account.status);
      card.append(node('p', `@${account.username}${account.webmaster ? ' · Webmaster' : ''}`, 'portal-hint'), node('p', account.email), button('Manage account', () => openAccount(account))); list.append(card);
    }
    updatePagination();
  }
  function openAccount(account) {
    clearPrivateLink();
    state.selectedAccount = account; $('portal-account-editor').hidden = false; $('account-editor-title').textContent = account.displayName;
    $('portal-account-info').textContent = `@${account.username} · ${account.email} · Version ${account.version}`;
    const form = $('portal-account-state'); field(form, 'status').value = account.status === 'disabled' ? 'disabled' : 'active'; field(form, 'webmaster').checked = account.webmaster === true; form.hidden = account.status === 'invited';
    $('portal-account-reset').hidden = account.status !== 'active'; $('portal-account-invitation').hidden = account.status !== 'invited';
    $('portal-account-roles').replaceChildren(); $('portal-audit-list').replaceChildren(); $('portal-audit-list-more')?.remove(); $('portal-account-history').open = false; state.accountEvents = [];
    fillOptions($('portal-role-workspace'), state.allSites); state.roleAssignment = null;
    $('portal-account-editor').scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }
  function updateSelectedAccount(account) {
    if (!account) return;
    state.selectedAccount = account; const index = state.accounts.findIndex(item => item.accountId === account.accountId); if (index >= 0) state.accounts[index] = account;
    $('portal-account-info').textContent = `@${account.username} · ${account.email} · Version ${account.version}`;
    field($('portal-account-state'), 'webmaster').checked = account.webmaster === true;
    $('portal-account-reset').hidden = account.status !== 'active'; $('portal-account-invitation').hidden = account.status !== 'invited';
  }
  function clearPrivateLink() { $('portal-private-link').hidden = true; $('portal-private-link-value').value = ''; $('portal-private-link-help').textContent = ''; }
  function showPrivateLink(result) {
    const recipient = result.account || state.selectedAccount;
    if (!recipient || !result.token) throw new Error('The private link was not returned. Refresh the invitation list before preparing a new link.');
    if (state.selectedAccount?.accountId === recipient.accountId) updateSelectedAccount(recipient);
    const target = new URL('portal.html', location.href); target.search = ''; target.hash = `${result.purpose === 'recovery' ? 'recover' : 'invite'}=${encodeURIComponent(result.token)}`;
    $('portal-private-link-value').value = target.href; $('portal-private-link').hidden = false;
    $('portal-private-link-help').textContent = `For ${recipient.displayName} (@${recipient.username}). ${result.invitation ? `Committee access for ${result.invitation.siteName}. ` : ''}This ${result.purpose === 'recovery' ? 'recovery' : 'activation'} link expires ${date(result.expiresAt)}. Share it only with this verified recipient. No message has been sent.`;
    $('portal-private-link').scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }
  async function accountAction(action) {
    if (!state.selectedAccount) throw new Error('Choose an account first.');
    const revision = authRevision;
    const result = await api(`/api/webmaster/accounts/${state.selectedAccount.accountId}/${action}`, { method: 'POST', data: { expectedVersion: state.selectedAccount.version } });
    checkAuthRevision(revision);
    updateSelectedAccount(result.account); if (result.token) showPrivateLink(result); return result;
  }
  function renderSiteOptions() {
    fillOptions($('portal-role-workspace'), state.allSites, 'Choose a group', $('portal-role-workspace').value);
    fillOptions($('portal-invitation-workspace'), state.allSites, 'Choose a group', $('portal-invitation-workspace').value);
    fillOptions($('portal-site-select'), state.allSites, 'Create a local group', state.selectedSite?.id || '');
  }
  function editSite(id) {
    state.selectedSite = state.allSites.find(site => site.id === id) || null; const form = $('portal-site'); form.reset();
    for (const name of ['id', 'name', 'locality', 'summary', 'governanceWorkspaceId']) field(form, name).value = state.selectedSite?.[name] || '';
    for (const name of ['published', 'applicationsOpen']) field(form, name).checked = state.selectedSite?.[name] === true;
    field(form, 'id').disabled = !!state.selectedSite;
  }
  async function loadRole() {
    const siteId = value($('portal-role'), 'siteId'), accountId = state.selectedAccount?.accountId, revision = authRevision; state.roleAssignment = null; $('portal-account-roles').replaceChildren();
    if (!siteId || !state.selectedAccount) return;
    const result = await api(`/api/webmaster/sites/${encodeURIComponent(siteId)}/roles/${accountId}`);
    checkAuthRevision(revision);
    if (state.selectedAccount?.accountId !== accountId || value($('portal-role'), 'siteId') !== siteId) return;
    state.roleAssignment = result.assignment || null;
    const current = state.roleAssignment?.role || 'none'; field($('portal-role'), 'role').value = current;
    $('portal-account-roles').append(node('p', `Current access: ${STATUS[current] || current}`, 'portal-hint'));
  }
  async function loadPasskeys() {
    const result = await api('/api/auth/passkeys'); const list = $('portal-passkey-list'); list.replaceChildren();
    if (state.identity && typeof result.hasPassword === 'boolean') state.identity.hasPassword = result.hasPassword;
    updateSecurityAuth();
    const passkeys = result.passkeys || [];
    if (!passkeys.length) { empty(list, 'You have not added any optional passkeys.'); return; }
    for (const key of passkeys) {
      const card = record(key.name || 'Passkey'); card.append(node('p', `Added ${date(key.createdAt)}${key.lastUsedAt ? ` · Last used ${date(key.lastUsedAt)}` : ''}`, 'portal-hint'));
      if (passkeys.length > 1 || state.identity?.hasPassword) card.append(button('Remove this passkey', () => run(async () => { await api(`/api/auth/passkeys/${encodeURIComponent(key.id)}`, { method: 'DELETE', data: {} }); clearPrivate(); clearRecovery(); }, 'The passkey has been removed and your sessions have been signed out. Sign in with your password or a remaining passkey.')));
      list.append(card);
    }
  }

  for (const control of document.querySelectorAll('[data-password-toggle]')) control.addEventListener('click', () => {
    if (state.busy) return;
    const input = $(control.getAttribute('aria-controls'));
    if (input?.matches('[data-account-password]')) revealPassword(input, input.type === 'password');
  });
  for (const form of document.querySelectorAll('form')) if (form.querySelector('[data-account-password]')) form.addEventListener('reset', () => hidePasswords(form));
  for (const details of document.querySelectorAll('details')) if (details.querySelector('[data-account-password]')) details.addEventListener('toggle', () => { if (!details.open) hidePasswords(details); });
  for (const [interest, label] of Object.entries(INTERESTS)) {
    const container = node('label', undefined, 'portal-check'), input = node('input'); input.type = 'checkbox'; input.name = 'interests'; input.value = interest;
    container.append(input, node('span', label)); $('portal-interest-options').append(container);
  }
  $('portal-reading').hidden = false;
  $('portal-reading').addEventListener('click', () => { const easy = document.body.dataset.portalReading !== 'easy'; document.body.dataset.portalReading = easy ? 'easy' : 'normal'; $('portal-reading').setAttribute('aria-pressed', String(easy)); });
  $('portal-participant-view').addEventListener('click', () => {
    if (state.busy || !state.identity?.webmaster) return;
    const participant = !state.participantView;
    run(async () => {
      if (participant && !state.participantLoaded) await loadParticipantData();
      state.participantView = participant; updatePortalView(); selectPanel(participant ? 'profile' : 'webmaster');
    }, participant ? 'Your optional participant view is open.' : 'Your webmaster administration is ready.');
  });
  for (const tab of document.querySelectorAll('[data-panel]')) tab.addEventListener('click', () => {
    if (state.busy || tab.hidden) return; const panel = tab.dataset.panel; selectPanel(panel);
    if (panel === 'webmaster') run(loadWebmasterLists); if (panel === 'security') run(loadPasskeys);
    if (panel === 'learning') run(loadLearning);
    if (panel === 'course-staff' && !courses.site) run(loadCourseGroups);
  });

  listenForm('portal-learning-profile', form => run(async () => {
    if (!learning.profile) return;
    const fields = Object.fromEntries(['availableFrom', 'availableUntil', 'english', 'skills', 'licences'].map(name => [name, value(form, name)]));
    const pathways = [...form.querySelectorAll('[name="pathways"]:checked')].map(control => control.value);
    const result = await api('/api/learning/profile', { method: 'PATCH', data: { ...fields, pathways, expectedVersion: learning.profile.version } });
    renderLearningProfile(result.profile);
  }, 'Your work and learning profile is saved.'));
  $('portal-learning-profile').addEventListener('input', () => { learning.profileDirty = true; });
  $('portal-learning-reload').addEventListener('click', () => {
    if (learning.profileDirty && !window.confirm('Replace your unsaved edits with the saved profile?')) return;
    run(reloadLearningProfile, 'Saved profile reloaded.');
  });
  $('portal-learning-refresh').addEventListener('click', () => run(loadLearningEvidence, 'Evidence status refreshed.'));
  listenForm('portal-learning-evidence-form', form => run(async () => {
    const data = { category: value(form, 'category'), label: value(form, 'label'), issuer: value(form, 'issuer'), consent: checked(form, 'consent') };
    await api('/api/learning/evidence', { method: 'POST', data: stableCreate('learning-evidence', data) });
    retries.delete('learning-evidence');
    form.reset();
    $('portal-learning-request-panel').open = false;
    await loadLearningEvidence();
  }, 'Your private evidence request is recorded.'));
  $('portal-learning-review-load').addEventListener('click', () => run(loadLearningReviews));
  $('portal-learning-drafts-load').addEventListener('click', () => {
    $('tab-course-staff').focus();
    $('tab-course-staff').click();
  });
  $('portal-course-home-courses').addEventListener('click', () => courseHomeSection('courses'));
  $('portal-course-home-assessments').addEventListener('click', () => courseHomeSection('assessments'));
  $('portal-courses-new').addEventListener('click', () => openCourseEditor());
  $('portal-courses-refresh').addEventListener('click', () => {
    if (closeCourseAssessment(true)) run(() => loadCourseStaff(1, 1, 'queue'));
  });
  field($('portal-learning-review-form'), 'status').addEventListener('change', updateLearningReviewFields);
  $('portal-learning-review-cancel').addEventListener('click', () => {
    learning.review = null;
    $('portal-learning-review-form').reset();
    $('portal-learning-review-form').hidden = true;
    $('portal-learning-review-load').focus();
  });
  listenForm('portal-learning-review-form', form => run(async () => {
    if (!learning.review) return;
    const fields = Object.fromEntries(['status', 'method', 'expiresOn', 'note'].map(name => [name, value(form, name)]));
    await api(`/api/learning/reviews/${learning.review.id}`, { method: 'PATCH', data: { ...fields, expectedVersion: learning.review.version } });
    learning.review = null;
    form.reset();
    form.hidden = true;
    await loadLearningReviews();
    $('portal-learning-review-load').focus();
  }, 'The evidence decision is recorded.'));
  document.querySelector('.portal-tabs').addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-panel]')].filter(tab => !tab.hidden);
    const index = tabs.indexOf(event.target); if (index < 0) return;
    let next;
    if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (index + 1) % tabs.length;
    if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
  });
  for (const control of document.querySelectorAll('[data-auth-cancel]')) control.addEventListener('click', () => { state.authMode = ''; state.token = ''; authRevision++; stopPasswordWorker(); clearInvitationContext(); for (const id of ['portal-bootstrap', 'portal-activate']) $(id).reset(); updateAuthMethods(); history.replaceState(null, '', location.pathname + location.search); showAuth(); });
  for (const id of ['portal-register', 'portal-recover', 'portal-activate']) field($(id), 'usePasskey').addEventListener('change', updateAuthMethods);
  listenForm('portal-login', form => { const data = { username: value(form, 'username') }; run(() => withPassword(form, async password => signedIn(await passwordExchange('login', data, password))), 'Signed in. Your private portal is ready.'); });
  listenForm('portal-passkey-login', form => { const data = { username: value(form, 'username') }; run(async () => { await signedIn(await ceremony('login', data)); }, 'Signed in. Your private portal is ready.'); });
  for (const [id, purpose] of [['portal-register', 'register'], ['portal-bootstrap', 'bootstrap']]) listenForm(id, form => {
    const data = { username: value(form, 'username'), displayName: value(form, 'displayName'), email: value(form, 'email'), consentAccount: checked(form, 'consent'), consentVersion: CONSENT_VERSION };
    if (purpose === 'bootstrap') data.bootstrapKey = field(form, 'bootstrapKey').value;
    run(async () => {
      if (purpose === 'register' && checked(form, 'usePasskey')) return signedIn(await ceremony(purpose, data));
      await withPassword(form, async password => {
        if (purpose === 'bootstrap' && password === data.bootstrapKey.normalize('NFC')) throw new Error('Choose your own password, separate from the one-time setup authorisation key.');
        await signedIn(await passwordExchange(purpose, data, password, true));
      }, { confirm: true });
    }, 'Your account is ready. Optional recovery codes are available.');
  });
  listenForm('portal-recover', form => {
    const data = { username: value(form, 'username'), recoveryCode: value(form, 'recoveryCode') }, passkey = checked(form, 'usePasskey');
    run(() => passkey ? ceremony('recover', data).then(signedIn) : withPassword(form, async password => signedIn(await passwordExchange('recover', data, password, true)), { confirm: true }), passkey ? 'Your account has been recovered with a new passkey. Optional recovery codes are available.' : 'Your account has been recovered with your new password. Optional recovery codes are available.');
  });
  listenForm('portal-activate', form => run(async () => {
    if (!state.token) throw new Error('Open the complete private account link supplied by your organiser.');
    if (state.authMode === 'invite' && !state.invitationContext) throw new Error('This invitation could not be confirmed. Ask the webmaster for a new link.');
    if (checked(form, 'usePasskey')) return signedIn(await ceremony(state.authMode === 'recover' ? 'recover' : 'activate', { token: state.token, ...(state.authMode === 'recover' ? {} : { consentAccount: checked(form, 'consent'), consentVersion: CONSENT_VERSION }) }));
    await withPassword(form, async password => {
      const result = await passwordExchange(state.authMode === 'recover' ? 'recover' : 'activate', { token: state.token, ...(state.authMode === 'recover' ? {} : { consentAccount: checked(form, 'consent'), consentVersion: CONSENT_VERSION }) }, password, true); await signedIn(result);
    }, { confirm: true });
  }, checked(form, 'usePasskey') ? 'Your passkey is ready. Optional recovery codes are available.' : 'Your password is ready. Optional recovery codes are available.'));
  listenForm('portal-reauth-form', form => run(() => withPassword(form, async password => confirmAuthIdentity(await passwordExchange('reauth', {}, password)))));
  $('portal-reauth-button').addEventListener('click', () => run(async () => confirmAuthIdentity(await ceremony('login', { username: state.identity.username }))));
  listenForm('portal-recovery-password', form => run(() => withPassword(form, async password => { const result = await passwordExchange('recovery-codes', {}, password); await refreshAuthIdentity(result); showRecovery(result.recoveryCodes, state.identity.username); }), 'Your old recovery codes have been replaced. Optional recovery codes are available.'));
  $('portal-renew-codes-passkey').addEventListener('click', () => run(async () => { const result = await ceremony('recovery-codes', {}); await refreshAuthIdentity(result); showRecovery(result.recoveryCodes, state.identity.username); }, 'Your old recovery codes have been replaced. Optional recovery codes are available.'));
  listenForm('portal-password', form => run(() => withPassword(form, async password => {
    if (state.identity.hasPassword && await refreshAuthIdentity(await passwordExchange('reauth', {}, readPassword(form, 'currentPassword')))) throw new Error('Account access changed. Review the current account before changing its password.');
    const result = await passwordExchange('change', {}, password, true); await refreshAuthIdentity(result); $('portal-reauth').hidden = true; showRecovery(result.recoveryCodes, state.identity.username);
  }, { confirm: true }), 'Your password has been saved. Optional recovery codes are available.'));
  $('portal-generate-key').addEventListener('click', () => {
    if (state.busy || state.authMode !== 'setup') return;
    const key = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    field($('portal-bootstrap'), 'bootstrapKey').value = key; $('portal-generate-key').disabled = true;
    setStatus('Setup key generated in this browser. Copy it into the Cloudflare Secret setting shown below.');
  });
  $('portal-copy-setup-key').addEventListener('click', () => run(async () => {
    const input = field($('portal-bootstrap'), 'bootstrapKey');
    if (!input.value) throw new Error('Generate a setup key first.');
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(input.value); setStatus('Setup key copied. Paste it as the READY_AUTH_SECRET value in Cloudflare.', 'success'); }
    else { input.focus(); input.select(); setStatus('Copy the selected setup key, then paste it into Cloudflare.'); }
  }));
  $('portal-check-setup').addEventListener('click', () => run(loadSession));
  $('portal-retry').addEventListener('click', () => run(loadSession));
  $('portal-logout').addEventListener('click', () => run(async () => { await api('/api/auth/logout', { method: 'POST', data: {} }); clearPrivate(); clearRecovery(); }, 'You have signed out.'));
  $('portal-download-codes').addEventListener('click', () => download(`ready SET Co-op recovery codes\nUsername: ${state.recoveryUsername}\nSite: ${location.origin}\nKeep these privately. Each code works once.\n\n${state.recoveryCodes.join('\n')}\n`, 'ready-setco-recovery-codes.txt', 'text/plain'));
  $('portal-codes-saved').addEventListener('click', clearRecovery);
  $('portal-profile').addEventListener('input', () => { state.profileDirty = true; });
  listenForm('portal-profile', () => { const data = profileData(); run(async () => { const result = await api('/api/member/profile', { method: 'PATCH', data }); state.profile = result.profile; renderProfile(); }, 'Your details have been saved on the server.'); });
  $('portal-profile-reload').addEventListener('click', () => run(async () => { if (state.profileDirty && !window.confirm('Replace your unsaved edits with the saved profile?')) return; state.profile = (await api('/api/member/profile')).profile; renderProfile(); }, 'The saved profile has been loaded.'));
  $('portal-export').addEventListener('click', () => run(async () => { download(await api('/api/member/export'), 'ready-setco-my-records.json'); }, 'Your saved records are ready to download.'));
  listenForm('portal-application', form => {
    const data = { siteId: value(form, 'siteId'), motivation: value(form, 'motivation'), skills: value(form, 'skills'), availability: value(form, 'availability'), consentParticipation: checked(form, 'consentParticipation'), consentFutureHandover: checked(form, 'consentFutureHandover'), consentVersion: CONSENT_VERSION };
    const resubmission = state.resubmission;
    run(async () => {
      if (resubmission) await api(`/api/member/applications/${resubmission.id}`, { method: 'PATCH', data: { expectedVersion: resubmission.version, action: 'resubmit', motivation: data.motivation, skills: data.skills, availability: data.availability } });
      else await api('/api/member/applications', { method: 'POST', data: stableCreate('application', data) });
      retries.delete('application'); state.resubmission = null; form.reset(); field(form, 'siteId').disabled = false; form.querySelector('[type="submit"]').textContent = 'Send application'; $('portal-application-details').open = false; await reloadApplications();
    }, 'Your application has been saved. You can follow the response here.');
  });
  $('portal-committee-workspace').addEventListener('change', () => { state.selectedCommittee = $('portal-committee-workspace').value; state.selectedPost = null; $('portal-post').reset(); run(loadCommittee); });
  $('portal-refresh-queue').addEventListener('click', () => run(loadCommittee));
  field($('portal-review'), 'status').addEventListener('change', updateAdmission);
  listenForm('portal-review', form => {
    const application = state.selectedApplication; if (!application) return;
    const data = { expectedVersion: application.version, status: value(form, 'status'), reviewNote: value(form, 'reviewNote'), decisionRef: value(form, 'decisionRef'), evidenceRef: value(form, 'evidenceRef'), admissionDate: value(form, 'admissionDate') };
    run(async () => { await api(`/api/committee/sites/${encodeURIComponent(state.selectedCommittee)}/applications/${application.id}`, { method: 'PATCH', data }); await loadCommittee(); }, 'The application response has been saved.');
  });
  listenForm('portal-post', form => {
    const data = { title: value(form, 'title'), body: value(form, 'body'), link: value(form, 'link'), label: value(form, 'label') }, post = state.selectedPost;
    run(async () => {
      const path = `/api/member/groups/${encodeURIComponent(state.selectedCommittee)}/bulletins`;
      await api(post ? `${path}/${post.id}` : path, { method: post ? 'PATCH' : 'POST', data: post ? { ...data, expectedVersion: post.version, archived: false } : stableCreate(`bulletin:${state.selectedCommittee}`, data) });
      retries.delete(`bulletin:${state.selectedCommittee}`); state.selectedPost = null; form.reset(); form.querySelector('[type="submit"]').textContent = 'Publish to this group'; await loadCommitteePosts();
    }, 'The information is saved and available to this group.');
  });
  $('portal-refresh-accounts').addEventListener('click', () => run(loadAccounts));
  $('portal-refresh-invitations').addEventListener('click', () => run(loadInvitations));
  listenForm('portal-invitation-search', form => { state.invitationSearch = value(form, 'search'); state.invitationPage = 1; run(loadInvitations); });
  $('portal-invitations-prev').addEventListener('click', () => { state.invitationPage = Math.max(1, state.invitationPage - 1); run(loadInvitations); });
  $('portal-invitations-next').addEventListener('click', () => { state.invitationPage++; run(loadInvitations); });
  $('portal-find-existing-account').addEventListener('click', () => { $('portal-existing-accounts').scrollIntoView?.({ block: 'nearest', behavior: 'auto' }); field($('portal-account-search'), 'search').focus(); });
  listenForm('portal-committee-invite', form => {
    const data = stableCreate('committee-invite', { username: value(form, 'username'), displayName: value(form, 'displayName'), email: value(form, 'email'), siteId: value(form, 'siteId') });
    run(async () => {
      const revision = authRevision;
      const result = await api('/api/webmaster/committee-invitations', { method: 'POST', data });
      checkAuthRevision(revision); clearPrivateLink();
      if (result.token) showPrivateLink(result);
      retries.delete('committee-invite'); form.reset(); $('portal-committee-invite-details').open = false;
      state.invitationPage = 1; state.invitationSearch = ''; $('portal-invitation-search').reset();
      await loadWebmasterLists();
      setStatus(result.token ? 'The committee invitation is ready to share privately. No message has been sent.' : 'This committee invitation is already saved. Use its invitation controls to prepare a new private link if needed.', 'success');
    });
  });
  listenForm('portal-account-search', form => { state.accountSearch = value(form, 'search'); state.accountPage = 1; run(loadAccounts); });
  $('portal-accounts-prev').addEventListener('click', () => { state.accountPage = Math.max(1, state.accountPage - 1); run(loadAccounts); });
  $('portal-accounts-next').addEventListener('click', () => { state.accountPage++; run(loadAccounts); });
  listenForm('portal-account-state', form => { const data = { expectedVersion: state.selectedAccount.version, status: value(form, 'status'), webmaster: checked(form, 'webmaster') }; run(async () => { updateSelectedAccount((await api(`/api/webmaster/accounts/${state.selectedAccount.accountId}`, { method: 'PATCH', data })).account); await loadAccounts(); }, 'Account access has been updated.'); });
  $('portal-account-reset').addEventListener('click', () => run(() => accountAction('recovery-link'), 'A private recovery link is ready. No message has been sent.'));
  $('portal-account-invitation').addEventListener('click', () => run(async () => { await accountAction('invite'); await loadInvitations(); }, 'A private activation link is ready. No message has been sent.'));
  $('portal-account-revoke').addEventListener('click', () => run(() => accountAction('revoke-sessions'), 'The account sessions have been signed out.'));
  $('portal-account-revoke-links').addEventListener('click', () => run(async () => { await accountAction('revoke-links'); clearPrivateLink(); await loadInvitations(); }, 'Unused account links have been revoked.'));
  $('portal-role-workspace').addEventListener('change', () => run(loadRole));
  listenForm('portal-role', form => {
    const siteId = value(form, 'siteId'), data = { accountId: state.selectedAccount.accountId, role: value(form, 'role'), expectedVersion: state.roleAssignment?.version || 0 };
    run(async () => { await api(`/api/webmaster/sites/${encodeURIComponent(siteId)}/roles`, { method: 'PUT', data }); await loadRole(); }, 'Group access has been saved.');
  });
  listenForm('portal-invite', form => {
    const data = stableCreate('invite', { username: value(form, 'username'), displayName: value(form, 'displayName'), email: value(form, 'email') });
    run(async () => { const result = await api('/api/webmaster/accounts', { method: 'POST', data }); openAccount(result.account); await accountAction('invite'); retries.delete('invite'); form.reset(); await loadAccounts(); }, 'The invitation link is ready to share privately. No message has been sent.');
  });
  async function loadAccountHistory(page = 1) {
    const result = await api(`/api/webmaster/accounts/${state.selectedAccount.accountId}/history?page=${page}&pageSize=25`), list = $('portal-audit-list'); list.replaceChildren();
    state.accountEvents = mergeRows(state.accountEvents || [], result.events || [], page);
    for (const event of state.accountEvents) { const card = record(String(event.action || 'Account change').replaceAll('_', ' ')); card.append(node('p', `${date(event.createdAt)} · ${event.actor}`, 'portal-hint')); list.append(card); }
    if (!state.accountEvents.length) empty(list, 'No account activity was returned.');
    showMore(list, result, loadAccountHistory);
  }
  $('portal-account-history').addEventListener('toggle', () => { if ($('portal-account-history').open && state.selectedAccount) run(loadAccountHistory); });
  $('portal-copy-link').addEventListener('click', () => run(async () => { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText($('portal-private-link-value').value); setStatus('Link copied. Share it only with the verified recipient.', 'success'); } else { $('portal-private-link-value').focus(); $('portal-private-link-value').select(); setStatus('Select and copy the link from the field.'); } }));
  $('portal-clear-link').addEventListener('click', clearPrivateLink);
  $('portal-site-select').addEventListener('change', () => editSite($('portal-site-select').value));
  listenForm('portal-site', form => {
    const site = state.selectedSite, data = { id: value(form, 'id'), name: value(form, 'name'), locality: value(form, 'locality'), summary: value(form, 'summary'), governanceWorkspaceId: value(form, 'governanceWorkspaceId'), published: checked(form, 'published'), applicationsOpen: checked(form, 'applicationsOpen'), ...(site ? { expectedVersion: site.version } : {}) };
    run(async () => { if (site) delete data.id; const saved = await api(site ? `/api/webmaster/sites/${encodeURIComponent(site.id)}` : '/api/webmaster/sites', { method: site ? 'PATCH' : 'POST', data }); const index = state.allSites.findIndex(item => item.id === saved.site.id); if (index >= 0) state.allSites[index] = saved.site; else state.allSites.push(saved.site); state.selectedSite = saved.site; renderSiteOptions(); editSite(saved.site.id); }, 'The local group settings have been saved.');
  });
  listenForm('portal-add-passkey', form => run(async () => {
    const issued = await api('/api/auth/passkeys/options', { method: 'POST', data: { name: value(form, 'name') } });
    const response = await window.SimpleWebAuthnBrowser.startRegistration({ optionsJSON: issued.options });
    await api('/api/auth/passkeys/verify', { method: 'POST', data: { ceremonyId: issued.ceremonyId, response } }); form.reset(); await loadPasskeys();
  }, 'The new passkey has been added.'));
  $('portal-revoke-sessions').addEventListener('click', () => run(async () => { await api('/api/auth/sessions/revoke', { method: 'POST', data: {} }); clearPrivate(); clearRecovery(); }, 'All your sessions have been signed out.'));
  window.addEventListener('pagehide', () => { state.token = ''; state.authMode = ''; clearPrivate(); for (const id of ['portal-login', 'portal-passkey-login', 'portal-register', 'portal-bootstrap', 'portal-recover', 'portal-activate']) $(id).reset(); updateAuthMethods(); });
  window.addEventListener('pageshow', event => { if (event.persisted) run(loadSession); });
  readFragment();
  if (location.hostname === 'auraofintelligence.github.io') {
    $('portal-status').replaceChildren(node('span', 'Account access is on the existing Cloudflare service. '));
    const link = node('a', 'Open the member portal'); const target = new URL('https://ready-setco.auraofintelligence.workers.dev/portal.html');
    if (state.token) target.hash = `${state.authMode}=${encodeURIComponent(state.token)}`;
    else if (state.authMode === 'setup') target.hash = 'setup';
    link.href = target.href; $('portal-status').append(link);
  } else run(loadSession);
})();
