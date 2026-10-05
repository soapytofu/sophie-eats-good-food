const newsletterForm = document.querySelector('#newsletter-form');
const newsletterStatus = document.querySelector('#newsletter-status');
const newsletterSubmit = newsletterForm.querySelector('button');

newsletterForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!newsletterForm.reportValidity()) return;
  newsletterSubmit.disabled = true;
  newsletterSubmit.textContent = 'Joining…';
  newsletterForm.setAttribute('aria-busy', 'true');
  newsletterStatus.textContent = '';
  newsletterStatus.dataset.state = '';
  try {
    const fields = new FormData(newsletterForm);
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fields.get('email'), consent: fields.has('consent'), website: fields.get('website') }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Signups are temporarily unavailable. Please try again later.');
    newsletterStatus.textContent = data.message;
    newsletterStatus.dataset.state = 'success';
    newsletterForm.reset();
  } catch (error) {
    newsletterStatus.textContent = error.name === 'TimeoutError' || error instanceof TypeError
      ? 'We couldn’t reach the mailing list. Please try again in a moment.'
      : error.message;
    newsletterStatus.dataset.state = 'error';
  } finally {
    newsletterSubmit.disabled = false;
    newsletterSubmit.innerHTML = 'Count me in <span aria-hidden="true">↗</span>';
    newsletterForm.removeAttribute('aria-busy');
  }
});
