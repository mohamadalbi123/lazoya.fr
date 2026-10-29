(() => {
  const hero = document.querySelector('.hero');
  const photos = document.querySelector('.hero-photos');
  const slides = [...document.querySelectorAll('.hero-photo')];
  const control = document.querySelector('.hero-motion-control');
  if (!hero || !photos || slides.length < 2 || !control) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let current = 0;
  let timer;
  function update() {
    clearInterval(timer);
    control.hidden = reduced.matches;
    photos.classList.toggle('is-paused', paused || reduced.matches);
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', paused ? 'Reprendre le diaporama' : 'Mettre le diaporama en pause');
    control.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
    if (paused || reduced.matches || document.hidden) return;
    timer = setInterval(() => {
      if (!hero.getClientRects().length) return;
      const next = (current + 1) % slides.length;
      if (!slides[next].complete || !slides[next].naturalWidth) return;
      slides[current].classList.remove('is-active');
      slides[next].classList.add('is-active');
      current = next;
    }, 12000);
  }
  control.addEventListener('click', () => { paused = !paused; update(); });
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  update();
})();
