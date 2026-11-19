(() => {
  const host = document.querySelector('#translation-controls');
  if (!host) return;

  // Translate public information only. Never derive an outbound URL from a
  // query string, a fragment, a form field, or the private organiser route.
  const publicPages = new Set([
    'index.html', 'events.html', 'jobs.html', 'media-assets.html',
    'grant-roadmap.html', 'boundaries.html', 'map.html', 'members.html',
    'join.html', 'about.html', 'ecosystem-links.html', 'site-map.html',
    'trust-ladder.html', 'ballow-road.html', 'horizon.html'
  ]);
  if (/(?:^|\/)(?:manage(?:\.html)?|api)(?:\/|$)/.test(location.pathname)) return;
  const filename = location.pathname.split('/').filter(Boolean).at(-1) || 'index.html';
  const file = filename.endsWith('.html') ? filename
    : (location.pathname.endsWith('/') || filename === 'ready-set-co-op-trust-hub' ? 'index.html' : '');
  if (!publicPages.has(file)) return;
  const originalUrl = `https://ready-setco.auraofintelligence.workers.dev/${file === 'index.html' ? '' : file}`;
  const formPage = file === 'join.html' || file === 'map.html';

  const languages = [
    { code: 'fr', name: 'Français', help: 'Pour traduire ce formulaire, utilisez l’option Traduire de votre navigateur. Saisissez vos informations uniquement sur le site original.' },
    { code: 'de', name: 'Deutsch', help: 'Nutzen Sie die Übersetzungsfunktion Ihres Browsers, um dieses Formular zu lesen. Geben Sie Ihre Angaben nur auf der Originalwebsite ein.' },
    { code: 'es', name: 'Español', help: 'Para traducir este formulario, utilice la opción Traducir de su navegador. Introduzca sus datos solo en el sitio original.' },
    { code: 'pt', name: 'Português', help: 'Para traduzir este formulário, use a opção Traduzir do seu navegador. Introduza os seus dados apenas no site original.' },
    { code: 'it', name: 'Italiano', help: 'Per tradurre questo modulo, usa la funzione Traduci del browser. Inserisci i tuoi dati solo sul sito originale.' },
    { code: 'zh-CN', name: '简体中文', help: '请使用浏览器的“翻译”功能阅读此表单。请只在原始网站上填写个人信息。' },
    { code: 'ja', name: '日本語', help: 'このフォームを読むには、ブラウザの翻訳機能をご利用ください。個人情報は元のサイトでのみ入力してください。' },
    { code: 'ko', name: '한국어', help: '이 양식을 읽으려면 브라우저의 번역 기능을 사용하세요. 개인 정보는 원본 사이트에서만 입력하세요.' }
  ];
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }
  function outsideLink(label, href, className) {
    const link = element('a', className, label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    return link;
  }

  const introduction = element('p', 'translation-copy', formPage
    ? 'Your browser can translate this form. Use its Translate option, for example in Chrome, Edge or Safari, then fill it in on the original Ready SETCO website.'
    : 'Choose a language, then open a translated copy with Google Translate. You can also use your browser’s Translate option and keep the larger-text view.');
  const label = element('label', 'translation-field', 'Language / Langue / Sprache / Idioma');
  label.htmlFor = 'translation-language';
  const select = element('select', 'translation-choice');
  select.id = 'translation-language';
  select.append(new Option('Choose a language…', ''));
  for (const language of languages) {
    const option = new Option(language.name, language.code);
    option.lang = language.code;
    select.append(option);
  }
  select.append(new Option('More languages…', 'other'));
  label.append(select);

  const help = element('p', 'translation-browser-help');
  help.hidden = true;
  help.setAttribute('aria-live', 'polite');
  const actions = element('div', 'translation-actions');
  const translate = outsideLink('', 'https://translate.google.com/?op=websites', 'button primary');
  translate.hidden = true;
  const original = outsideLink('Original English page', originalUrl, 'translation-original');
  const note = element('p', 'translation-copy', formPage
    ? 'This website does not send your form entries to Google Translate. Your browser provides its own translation tools.'
    : 'Google Translate is a separate service and opens only when you follow the link. Machine translations can miss meaning; check important details in the original. For forms, return to the original site and use your browser’s translation option.');
  actions.append(translate, original);
  host.replaceChildren(introduction, label, help, actions, note);

  select.addEventListener('change', () => {
    const language = languages.find(item => item.code === select.value);
    translate.hidden = !select.value;
    help.hidden = !select.value;
    help.removeAttribute('lang');
    if (!select.value) return;

    if (formPage) {
      help.textContent = language?.help || 'Open your browser menu and choose Translate. The link below explains the steps in Chrome; other browsers may also offer page translation.';
      if (language) help.lang = language.code;
      const url = new URL('https://support.google.com/chrome/answer/173424');
      url.searchParams.set('hl', language?.code || 'en');
      translate.href = url.href;
      translate.textContent = language ? `Browser translation help — ${language.name}` : 'Browser translation help';
      return;
    }

    if (!language) {
      help.textContent = 'In Google Translate, choose Websites and paste this page address. You can then choose from more languages.';
      const address = element('span', 'translation-page-address', ` ${originalUrl}`);
      help.append(address);
      translate.href = 'https://translate.google.com/?op=websites';
      translate.textContent = 'Open Google Translate';
      return;
    }
    help.hidden = true;
    // Google's user-initiated website translation feature is documented at
    // https://support.google.com/translate/answer/2534559 . No widget, remote
    // script or automatic request is loaded into Ready SETCO.
    const url = new URL('https://translate.google.com/translate');
    url.searchParams.set('sl', 'en');
    url.searchParams.set('tl', language.code);
    url.searchParams.set('u', originalUrl);
    translate.href = url.href;
    translate.textContent = `Google Translate: ${language.name}`;
  });
})();
