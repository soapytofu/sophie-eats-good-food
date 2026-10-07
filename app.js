const grid = document.querySelector('#post-grid');
const search = document.querySelector('#search');
const noResults = document.querySelector('#no-results');
const journalPosts = [...window.POSTS].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function journalEntry(post) {
  const link = `/posts/${encodeURIComponent(post.id)}`;
  const story = String(post.body || post.caption || post.excerpt || '');
  const paragraphs = story.split(/\n\s*\n/).filter(Boolean).slice(0, 2);
  const minutes = Math.max(1, Math.ceil(story.split(/\s+/).length / 220));
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
    const inSearch = `${post.title} ${post.body || ''} ${post.caption || ''} ${post.location || ''}`.toLowerCase().includes(query);
    return inSearch;
  });
  grid.innerHTML = posts.map(journalEntry).join('');
  noResults.hidden = posts.length > 0;
}

search.addEventListener('input', render);
document.querySelector('.menu-button').addEventListener('click', event => {
  const nav = document.querySelector('nav');
  const isOpen = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', isOpen);
});
document.querySelectorAll('.site-header nav a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('.site-header nav').classList.remove('open');
  document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
}));
render();
document.querySelector('#recent-posts').innerHTML = journalPosts.slice(0, 3).map(post => `<li><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a><span>${escapeHtml(post.date)}</span></li>`).join('');

function openLinkedPost() {
  if (location.hash === '#about') { location.replace('/about'); return; }
  if (!location.hash.startsWith('#post=')) return;
  // Keep links from earlier emails/bookmarks working with the new article pages.
  try { location.replace(`/posts/${encodeURIComponent(decodeURIComponent(location.hash.slice(6)))}`); } catch { /* Ignore malformed article links. */ }
}
window.addEventListener('hashchange', openLinkedPost);
openLinkedPost();
