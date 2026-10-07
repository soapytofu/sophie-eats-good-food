const grid = document.querySelector('#post-grid');
const search = document.querySelector('#search');
const noResults = document.querySelector('#no-results');
const browseBy = document.querySelector('#browse-by');
const browseValue = document.querySelector('#browse-value');
const browseValueLabel = document.querySelector('#browse-value-label');
const browseValueField = document.querySelector('#browse-value-field');
const resultCount = document.querySelector('#result-count');
const resetBrowse = document.querySelector('#reset-browse');
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
  const posts = window.JournalFilters.filterPosts(journalPosts, {
    query: search.value, mode: browseBy.value, value: browseValue.value,
  });
  grid.innerHTML = posts.map(journalEntry).join('');
  noResults.hidden = posts.length > 0;
  resultCount.textContent = `${posts.length} of ${journalPosts.length} ${journalPosts.length === 1 ? 'entry' : 'entries'}`;
  resetBrowse.hidden = !search.value && browseBy.value === 'all';
}

function updateBrowse() {
  const mode = browseBy.value;
  browseValueField.hidden = mode === 'all';
  browseValueLabel.textContent = mode === 'food' ? 'Food featured' : 'Topic';
  const choices = window.JournalFilters.options(journalPosts, mode);
  const allLabel = mode === 'food' ? 'All foods' : 'All topics';
  browseValue.innerHTML = `<option value="">${allLabel}</option>` + choices.map(option =>
    `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)} (${option.count})</option>`).join('');
  document.querySelector('#browse-note').textContent = mode !== 'all' && !choices.length
    ? `No ${mode === 'food' ? 'food' : 'topic'} tags yet. All entries are shown.` : '';
  render();
}

search.addEventListener('input', render);
browseBy.addEventListener('change', updateBrowse);
browseValue.addEventListener('change', render);
resetBrowse.addEventListener('click', () => {
  search.value = ''; browseBy.value = 'all'; updateBrowse();
  search.focus({ preventScroll: true });
});
document.querySelector('.menu-button').addEventListener('click', event => {
  const nav = document.querySelector('nav');
  const isOpen = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', isOpen);
});
document.querySelectorAll('.site-header nav a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('.site-header nav').classList.remove('open');
  document.querySelector('.menu-button').setAttribute('aria-expanded', 'false');
}));
updateBrowse();
document.querySelector('#recent-posts').innerHTML = journalPosts.slice(0, 3).map(post => `<li><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a><span>${escapeHtml(post.date)}</span></li>`).join('');

function openLinkedPost() {
  if (location.hash === '#about') { location.replace('/about'); return; }
  if (!location.hash.startsWith('#post=')) return;
  // Keep links from earlier emails/bookmarks working with the new article pages.
  try { location.replace(`/posts/${encodeURIComponent(decodeURIComponent(location.hash.slice(6)))}`); } catch { /* Ignore malformed article links. */ }
}
window.addEventListener('hashchange', openLinkedPost);
openLinkedPost();
