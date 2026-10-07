/* Native dialog keeps the photo viewer keyboard-accessible without dependencies. */
(() => {
  function wrapIndex(index, total) { return total ? ((index % total) + total) % total : 0; }
  if (typeof module !== 'undefined') module.exports = { wrapIndex };
  if (typeof document === 'undefined') return;
  const dialog = document.querySelector('#life-lightbox');
  const photos = [...document.querySelectorAll('.life-photo')];
  if (!dialog || !photos.length) return;
  const image = dialog.querySelector('.life-lightbox-image');
  const caption = dialog.querySelector('.life-lightbox-caption');
  const counter = dialog.querySelector('.life-lightbox-counter');
  const close = dialog.querySelector('.life-lightbox-close');
  const previous = dialog.querySelector('[data-gallery-prev]');
  const next = dialog.querySelector('[data-gallery-next]');
  let current = 0;
  let lastTrigger;

  function show(index) {
    current = wrapIndex(index, photos.length);
    const source = photos[current].querySelector('img');
    image.src = source.src;
    image.alt = source.alt;
    caption.textContent = [...photos[current].querySelectorAll('figcaption span')].map(note => note.textContent).join(' · ');
    caption.hidden = !caption.textContent;
    counter.textContent = `${current + 1} / ${photos.length}`;
  }
  previous.hidden = next.hidden = photos.length < 2;
  photos.forEach((photo, index) => {
    const trigger = photo.querySelector('[data-gallery-photo]');
    trigger.addEventListener('click', () => {
      lastTrigger = trigger;
      show(index);
      dialog.showModal();
      close.focus({ preventScroll: true });
    });
  });
  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowLeft' ? -1 : 1));
    }
    // Escape and the focus trap are handled by the native modal dialog.
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    lastTrigger?.focus({ preventScroll: true });
  });
})();
