(() => {
  const header = document.querySelector('.topbar');
  const button = header?.querySelector('.menu-button');
  if (!button) return;
  function close() {
    button.setAttribute('aria-expanded', 'false');
    header.classList.remove('menu-active');
    document.body.classList.remove('menu-open');
  }
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    header.classList.toggle('menu-active', open);
    document.body.classList.toggle('menu-open', open);
  });
  header.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) close(); });
  header.querySelectorAll('.nav-links a').forEach(link => {
    if (new URL(link.href).pathname === location.pathname) link.setAttribute('aria-current', 'page');
  });
})();
