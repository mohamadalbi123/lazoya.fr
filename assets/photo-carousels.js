(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-photo-carousel]').forEach(carousel => {
    const track = carousel.querySelector('.photo-carousel-track');
    const button = carousel.querySelector('[data-carousel-pause]');
    const originals = [...track.children];
    if (!originals.length) return;
    originals.forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      track.append(clone);
    });
    let paused = false;
    let hovering = false;
    let focused = false;
    let visible = false;
    let frame;
    let last = 0;
    let position = track.scrollLeft;
    function tick(time) {
      if (last) {
        const firstClone = track.children[originals.length];
        const distance = firstClone.offsetLeft - originals[0].offsetLeft;
        position += Math.min(time - last, 50) * .024;
        if (distance > 0 && position >= distance) position -= distance;
        track.scrollLeft = position;
      }
      last = time;
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      last = 0;
      position = track.scrollLeft;
      button.hidden = reduced.matches;
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = paused ? '▶' : 'Ⅱ';
      button.setAttribute('aria-label', (paused ? 'Reprendre' : 'Mettre en pause') + ' le carrousel ' + (carousel.dataset.carouselTitle || carousel.querySelector('h3')?.textContent || ''));
      if (!paused && !hovering && !focused && visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    }
    button.addEventListener('click', () => { paused = !paused; sync(); });
    carousel.addEventListener('mouseenter', () => { hovering = true; sync(); });
    carousel.addEventListener('mouseleave', () => { hovering = false; sync(); });
    carousel.addEventListener('focusin', () => { focused = true; sync(); });
    carousel.addEventListener('focusout', event => { if (!carousel.contains(event.relatedTarget)) { focused = false; sync(); } });
    track.addEventListener('touchstart', () => { paused = true; sync(); }, {passive:true});
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(carousel);
    sync();
  });
})();
