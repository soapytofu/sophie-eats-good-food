const grid = document.querySelector('#post-grid');
const search = document.querySelector('#search');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const modal = document.querySelector('#post-modal');
const modalContent = document.querySelector('#modal-content');
const noResults = document.querySelector('#no-results');
let activeFilter = 'all';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function card(post, index) {
  return `<article class="post-card" tabindex="0" role="button" data-id="${escapeHtml(post.id)}" aria-label="Read ${escapeHtml(post.title)}">
    <div class="card-image"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.alt)}" loading="lazy"><span class="post-number">${String(index + 1).padStart(2, '0')}</span></div>
    <div class="card-meta"><span>${escapeHtml(post.categoryLabel)}</span><span>${escapeHtml(post.date)}</span></div>
    <h3 class="card-title">${escapeHtml(post.title)}</h3>
    <p class="card-excerpt">${escapeHtml(post.excerpt)}</p>
    <span class="read-more">Read the story ↗</span>
  </article>`;
}

function render() {
  const query = search.value.trim().toLowerCase();
  const posts = window.POSTS.filter(post => {
    const inFilter = activeFilter === 'all' || post.category === activeFilter;
    const inSearch = `${post.title} ${post.caption} ${post.location}`.toLowerCase().includes(query);
    return inFilter && inSearch;
  });
  grid.innerHTML = posts.map(card).join('');
  noResults.hidden = posts.length > 0;
}

function openPost(id) {
  const post = window.POSTS.find(item => item.id === id);
  if (!post) return;
  modalContent.innerHTML = `<img class="modal-hero" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.alt)}">
    <div class="modal-body"><p class="eyebrow">${escapeHtml(post.categoryLabel)}</p><h1>${escapeHtml(post.title)}</h1>
    <p class="modal-meta">${escapeHtml(post.date)} &nbsp;✦&nbsp; ${escapeHtml(post.location)}</p>
    <div class="caption">${escapeHtml(post.caption)}</div>
    <a class="modal-source" href="${escapeHtml(post.instagramUrl)}" target="_blank" rel="noreferrer">See the original on Instagram ↗</a></div>`;
  if (!modal.open) modal.showModal();
  history.replaceState(null, '', `#post=${encodeURIComponent(post.id)}`);
  document.body.classList.add('modal-open');
}

grid.addEventListener('click', event => {
  const article = event.target.closest('.post-card');
  if (article) openPost(article.dataset.id);
});
grid.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.post-card')) { event.preventDefault(); openPost(event.target.dataset.id); }
});
search.addEventListener('input', render);
filterButtons.forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach(item => item.classList.toggle('active', item === button));
  render();
}));
document.querySelector('.modal-close').addEventListener('click', () => modal.close());
modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
modal.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  if (location.hash.startsWith('#post=')) history.replaceState(null, '', '#journal');
});
document.querySelector('.menu-button').addEventListener('click', event => {
  const nav = document.querySelector('nav');
  const isOpen = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', isOpen);
});
document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => document.querySelector('nav').classList.remove('open')));
document.querySelector('#year').textContent = new Date().getFullYear();
render();

function openLinkedPost() {
  if (!location.hash.startsWith('#post=')) return;
  try { openPost(decodeURIComponent(location.hash.slice(6))); } catch { /* Ignore malformed article links. */ }
}
window.addEventListener('hashchange', openLinkedPost);
openLinkedPost();
