(() => {
  document.documentElement.classList.add('js');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('#nav-links');
  if (toggle && links) {
    function setMenu(open, restoreFocus = false) {
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
      if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    links.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true); });
    document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setMenu(false); });
    window.matchMedia('(min-width: 76rem)').addEventListener('change', () => setMenu(false));
  }
  const top = document.querySelector('[data-to-top]');
  if (top) {
    window.addEventListener('scroll', () => top.classList.toggle('is-visible', window.scrollY > 600), { passive: true });
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  }
})();
