const grid = document.querySelector('#post-grid');
const search = document.querySelector('#search');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const modal = document.querySelector('#post-modal');
const modalContent = document.querySelector('#modal-content');
const noResults = document.querySelector('#no-results');
let activeFilter = 'all';
const journalPosts = [...window.POSTS].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function journalEntry(post) {
  const link = `#post=${encodeURIComponent(post.id)}`;
  const paragraphs = String(post.caption || post.excerpt || '').split(/\n\s*\n/).filter(Boolean).slice(0, 2);
  const minutes = Math.max(1, Math.ceil(String(post.caption || '').split(/\s+/).length / 220));
  return `<article class="journal-entry">
    <p class="entry-date">${escapeHtml(post.date)} <span aria-hidden="true">·</span> ${escapeHtml(post.categoryLabel)}</p>
    <h3 class="entry-title"><a href="${link}">${escapeHtml(post.title)}</a></h3>
    <p class="entry-meta">By Sophie <span aria-hidden="true">·</span> ${minutes} min read${post.location ? ` <span aria-hidden="true">·</span> ${escapeHtml(post.location)}` : ''}</p>
    <a class="entry-image" href="${link}" aria-label="Read ${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.alt)}" loading="lazy"></a>
    <div class="entry-body">${paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div>
    <a class="read-more" href="${link}">Continue reading <span aria-hidden="true">→</span></a>
  </article>`;
}

function render() {
  const query = search.value.trim().toLowerCase();
  const posts = journalPosts.filter(post => {
    const inFilter = activeFilter === 'all' || post.category === activeFilter;
    const inSearch = `${post.title} ${post.caption} ${post.location}`.toLowerCase().includes(query);
    return inFilter && inSearch;
  });
  grid.innerHTML = posts.map(journalEntry).join('');
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

search.addEventListener('input', render);
filterButtons.forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', item === button);
  });
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
document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('nav').classList.remove('open');
  document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
}));
document.querySelector('#year').textContent = new Date().getFullYear();
render();
document.querySelector('#recent-posts').innerHTML = journalPosts.slice(0, 3).map(post => `<li><a href="#post=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a><span>${escapeHtml(post.date)}</span></li>`).join('');

function openLinkedPost() {
  if (!location.hash.startsWith('#post=')) return;
  try { openPost(decodeURIComponent(location.hash.slice(6))); } catch { /* Ignore malformed article links. */ }
}
window.addEventListener('hashchange', openLinkedPost);
openLinkedPost();
