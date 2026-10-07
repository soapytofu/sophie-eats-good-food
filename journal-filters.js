/* Tags describe the photos/story; no guessing from captions or automatic image recognition. */
(() => {
  const key = value => value.trim().toLocaleLowerCase();
  function tags(post, mode) {
    const values = mode === 'food' ? post.foods : mode === 'topic' ? post.topics : [];
    if (!Array.isArray(values)) return [];
    const unique = new Map();
    values.forEach(value => {
      if (typeof value === 'string' && value.trim()) unique.set(key(value), value.trim());
    });
    return [...unique.values()];
  }
  function options(posts, mode) {
    const values = new Map();
    posts.forEach(post => tags(post, mode).forEach(label => {
      const value = key(label);
      const option = values.get(value) || { value, label, count: 0 };
      option.count += 1;
      values.set(value, option);
    }));
    return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  function filterPosts(posts, { query = '', mode = 'all', value = '' } = {}) {
    const search = query.trim().toLocaleLowerCase();
    return posts.filter(post => {
      const text = [post.title, post.body, post.caption, post.excerpt, post.location,
        ...tags(post, 'food'), ...tags(post, 'topic')].filter(Boolean).join(' ').toLocaleLowerCase();
      return text.includes(search) && (!value || mode === 'all' || tags(post, mode).some(tag => key(tag) === key(value)));
    });
  }
  const api = { tags, options, filterPosts };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.JournalFilters = api;
})();
