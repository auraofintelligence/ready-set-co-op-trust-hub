(() => {
  document.documentElement.classList.add('js');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('#nav-links');
  if (toggle && links) {
    const header = toggle.closest('.site-header');
    const groups = [...links.querySelectorAll('.nav-group')];
    let pointerNavigation = false;
    document.addEventListener('pointerdown', () => { pointerNavigation = true; }, { capture: true });
    function closeGroups(except = null) {
      for (const group of groups) if (group !== except) group.open = false;
    }
    function setMenu(open, restoreFocus = false) {
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
      if (!open) closeGroups();
      else {
        const currentGroup = links.querySelector('.nav-group-current');
        if (currentGroup) currentGroup.open = true;
      }
      if (restoreFocus) toggle.focus();
    }
    for (const group of groups) {
      group.addEventListener('toggle', () => { if (group.open) closeGroups(group); });
    }
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    links.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', event => {
      pointerNavigation = false;
      if (event.key !== 'Escape') return;
      const openGroup = groups.find(group => group.open);
      if (openGroup) {
        openGroup.open = false;
        openGroup.querySelector('summary').focus();
        event.preventDefault();
      } else if (toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false, true);
        event.preventDefault();
      }
    });
    document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setMenu(false); });
    header?.addEventListener('focusout', event => {
      if (!pointerNavigation && event.relatedTarget && !header.contains(event.relatedTarget)) setMenu(false);
    });
    window.matchMedia('(min-width: 76rem)').addEventListener('change', () => setMenu(false));
  }
  const top = document.querySelector('[data-to-top]');
  if (top) {
    window.addEventListener('scroll', () => top.classList.toggle('is-visible', window.scrollY > 600), { passive: true });
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  }
})();

