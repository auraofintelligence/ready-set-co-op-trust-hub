(() => {
  const form = document.querySelector('#interest-form');
  if (!form) return;
  if (/(^|\.)translate\.goog$/i.test(location.hostname)) {
    form.hidden = true;
    for (const control of form.elements) control.disabled = true;
    form.addEventListener('submit', event => event.preventDefault());
    const notice = document.createElement('section'); notice.className = 'note translated-form-notice';
    const heading = document.createElement('h2'); heading.textContent = 'Use the original website for this form';
    const explanation = document.createElement('p'); explanation.textContent = 'Open the original Ready SETCO page to make your enquiry. You can use your browser’s Translate option there to read the form.';
    const link = document.createElement('a'); link.className = 'button primary'; link.textContent = 'Open the original enquiry form';
    link.href = 'https://ready-setco.auraofintelligence.workers.dev/join.html'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
    notice.append(heading, explanation, link); form.before(notice);
    return;
  }
  const status = document.querySelector('#intake-status');
  const send = document.querySelector('#send-interest');
  const receiptButton = document.querySelector('#download-receipt');
  const organisation = document.querySelector('#organisation-fields');
  let submissionId = crypto.randomUUID();
  let receipt = null;
  let submitted = false;
  const field = name => form.elements.namedItem(name);
  const suggestedInterest = new URLSearchParams(location.search).get('interest');
  for (const option of form.querySelectorAll('[name=interests]')) {
    if (option.value === suggestedInterest) option.checked = true;
  }
  if (suggestedInterest === 'working_holiday') {
    document.querySelector('#backpacker-enquiry').hidden = false;
    field('participantType').value = 'worker';
  }
  const endpoint = `${(window.READY_SETCO?.apiBase || '').replace(/\/$/, '')}/api/intake`;
  function show(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
    status.focus();
  }
  field('participantType').addEventListener('change', () => {
    const representing = ['business', 'community'].includes(field('participantType').value);
    organisation.hidden = !representing;
    field('organisation').required = field('participantType').value === 'business';
    field('authorityConfirmed').required = representing;
    if (!representing) { field('organisation').value = ''; field('authorityConfirmed').checked = false; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitted || !form.reportValidity()) return;
    const interests = [...form.querySelectorAll('[name=interests]:checked')].map(input => input.value);
    if (!interests.length) { show('Choose at least one interest so Luke knows where to start.', 'error'); return; }
    const payload = { submissionId, name: field('name').value.trim(), email: field('email').value.trim(), phone: field('phone').value.trim(), organisation: field('organisation').value.trim(), participantType: field('participantType').value, authorityConfirmed: field('authorityConfirmed').checked, interests, offer: field('offer').value.trim(), consentContact: field('consentContact').checked, consentVersion: '2026-11-19', consentFutureHandover: field('consentFutureHandover').checked };
    send.disabled = true;
    send.textContent = 'Sending…';
    show('Sending your expression of interest…', 'pending');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit' });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== 'received' || !result.reference) throw new Error(result?.error || 'Your enquiry could not be confirmed. Please try again or contact Luke.');
      receipt = { reference: result.reference, status: 'received', submittedAt: new Date().toISOString(), operator: 'Strange But True · ABN 81 913 657 174', enquiry: payload };
      submitted = true;
      show(`Thanks, ${payload.name}. Your interest has been received. Luke will follow up with the next step. Your reference is ${result.reference}.`, 'success');
      receiptButton.hidden = false;
      send.textContent = 'Interest received';
      for (const element of form.elements) if (element !== receiptButton) element.disabled = true;
    } catch (error) {
      show(error.message || 'We could not confirm delivery. Please try again or email sbt4183@gmail.com.', 'error');
      send.disabled = false;
      send.textContent = 'Try sending again';
    }
  });
  receiptButton.addEventListener('click', () => {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `ready-setco-receipt-${receipt.reference}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
