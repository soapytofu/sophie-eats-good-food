/* Tags describe the photos/story; no guessing from captions or automatic image recognition. */
(() => {
  const key = value => value.trim().toLocaleLowerCase();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateParts(value) {
    // Read calendar dates directly, so a visitor's time zone cannot move a volume boundary.
    if (typeof value !== 'string') return null;
    const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const named = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!iso && !named) return null;
    const year = Number(iso ? iso[1] : named[3]);
    const month = iso ? Number(iso[2]) : months.findIndex(name => key(name) === key(named[1])) + 1;
    const day = Number(iso ? iso[3] : named[2]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? { year, month, day } : null;
  }
  function dateOrder(post) {
    const date = dateParts(post.date);
    return date ? date.year * 10000 + date.month * 100 + date.day : 0;
  }
  function volume(post, mode) {
    const date = dateParts(post.date);
    if (!date) return null;
    const year = String(date.year).padStart(4, '0');
    if (mode === 'year') return { value: year, label: String(date.year) };
    if (mode === 'quarter') {
      const quarter = Math.ceil(date.month / 3);
      return { value: `${year}-Q${quarter}`, label: `Q${quarter} · ${date.year}` };
    }
    if (mode === 'month') return { value: `${year}-${String(date.month).padStart(2, '0')}`, label: `${months[date.month - 1]} ${date.year}` };
    return null;
  }
  function volumes(posts, mode) {
    const choices = new Map();
    posts.forEach(post => {
      const period = volume(post, mode);
      if (!period) return;
      const choice = choices.get(period.value) || { ...period, count: 0 };
      choice.count += 1;
      choices.set(period.value, choice);
    });
    return [...choices.values()].sort((a, b) => b.value.localeCompare(a.value));
  }
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
  function filterPosts(posts, { query = '', mode = 'all', value = '', volumeMode = 'all', volumeValue = '' } = {}) {
    const search = query.trim().toLocaleLowerCase();
    return posts.filter(post => {
      const text = [post.title, post.body, post.caption, post.excerpt, post.location,
        ...tags(post, 'food'), ...tags(post, 'topic')].filter(Boolean).join(' ').toLocaleLowerCase();
      const inVolume = !volumeValue || volumeMode === 'all' || volume(post, volumeMode)?.value === volumeValue;
      return text.includes(search) && inVolume && (!value || mode === 'all' || tags(post, mode).some(tag => key(tag) === key(value)));
    });
  }
  const api = { tags, options, filterPosts, dateParts, dateOrder, volume, volumes };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.JournalFilters = api;
})();
