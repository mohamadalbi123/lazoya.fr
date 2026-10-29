// The full-size image links remain usable when JavaScript is unavailable.
(() => {
  if (!window.HTMLDialogElement) return;
  const links = document.querySelectorAll('[data-gallery-image]');
  if (!links.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'realisation-dialog';
  dialog.setAttribute('aria-label', 'Photo de réalisation Lazoya');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fermer ✕';
  const image = document.createElement('img');
  const caption = document.createElement('p');
  dialog.append(close, image, caption);
  document.body.append(dialog);
  let opener;
  links.forEach(link => link.addEventListener('click', event => {
    // Preserve the browser’s normal new-tab and download gestures.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const thumbnail = link.querySelector('img');
    opener = link;
    image.src = link.href;
    image.alt = thumbnail.alt;
    image.width = Number(thumbnail.getAttribute('width'));
    image.height = Number(thumbnail.getAttribute('height'));
    caption.textContent = link.closest('figure').querySelector('figcaption').textContent;
    dialog.showModal();
  }));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (opener) opener.focus(); });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
})();
