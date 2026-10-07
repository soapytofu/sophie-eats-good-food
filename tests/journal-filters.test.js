const test = require('node:test');
const assert = require('node:assert/strict');
const { tags, options, filterPosts } = require('../journal-filters.js');
const posts = [
  { id: 'first', title: 'Lunch in town', caption: 'A lovely afternoon.', foods: ['Pasta', 'Eggs'], topics: ['Restaurant discoveries'] },
  { id: 'second', title: 'A quiet morning', body: 'Coffee in New York.', foods: ['Toast', 'Eggs'], topics: ['Kitchen notes', 'Simple pleasures'] },
  { id: 'untagged', title: 'An older memory', caption: 'Pasta is mentioned, but not necessarily pictured.' },
];

test('food and topic filters use different metadata and keep archive order', () => {
  assert.deepEqual(filterPosts(posts, { mode: 'food', value: 'Eggs' }).map(p => p.id), ['first', 'second']);
  assert.deepEqual(filterPosts(posts, { mode: 'topic', value: 'Kitchen notes' }).map(p => p.id), ['second']);
  assert.deepEqual(filterPosts(posts, { mode: 'food', value: 'Pasta' }).map(p => p.id), ['first']);
  assert.equal(filterPosts(posts, { mode: 'topic', value: 'Pasta' }).length, 0);
});
test('search combines with the selected filter and includes tags', () => {
  assert.deepEqual(filterPosts(posts, { mode: 'food', value: 'Eggs', query: ' NEW YORK ' }).map(p => p.id), ['second']);
  assert.deepEqual(filterPosts(posts, { query: 'simple pleasures' }).map(p => p.id), ['second']);
  assert.equal(filterPosts(posts, { mode: 'topic', value: 'Kitchen notes', query: 'afternoon' }).length, 0);
});
test('all entries includes untagged posts and clearing value removes the filter', () => {
  assert.equal(filterPosts(posts).length, 3);
  assert.equal(filterPosts(posts, { mode: 'food', value: '' }).length, 3);
  assert.equal(filterPosts(posts, { mode: 'all', value: 'Pasta' }).length, 3);
});
test('choices come from actual tags, with each entry counted once per choice', () => {
  const choices = options([...posts, { foods: ['Eggs', ' eggs ', 'EGGS', ''] }], 'food');
  assert.deepEqual(choices.map(o => o.value), ['eggs', 'pasta', 'toast']);
  assert.equal(choices[0].count, 3);
  assert.equal(options(posts, 'topic').length, 3);
});
test('missing and malformed tags never invent photo classifications', () => {
  assert.deepEqual(tags({ foods: 'Pasta' }, 'food'), []);
  assert.deepEqual(tags({ foods: [null, 3, {}, '  Cake  '] }, 'food'), ['Cake']);
  assert.deepEqual(options([{ caption: 'Cake and toast' }], 'food'), []);
  assert.deepEqual(tags(posts[0], 'all'), []);
});
test('empty archives and case-insensitive tag matching work', () => {
  assert.deepEqual(options([], 'food'), []);
  assert.deepEqual(filterPosts([]), []);
  assert.equal(filterPosts(posts, { mode: 'food', value: ' pasta ' }).length, 1);
});
