const test = require('node:test');
const assert = require('node:assert/strict');
const { tags, options, filterPosts, dateParts, dateOrder, volume, volumes } = require('../journal-filters.js');
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

const dated = [
  { id: 'jan', date: 'January 01, 2026', foods: ['Pasta'], topics: ['Travel'] },
  { id: 'mar', date: 'March 31, 2026', foods: ['Pasta'] },
  { id: 'apr', date: '2026-04-01', foods: ['Cake'] },
  { id: 'jul', date: 'July 01, 2026', foods: ['Pasta'] },
  { id: 'oct', date: 'October 01, 2026' },
  { id: 'dec', date: 'December 31, 2025', foods: ['Pasta'] },
  { id: 'undated', date: 'From Instagram', foods: ['Pasta'] },
];
test('years and months are derived from calendar dates and sorted newest first', () => {
  assert.deepEqual(volumes(dated, 'year'), [
    { value: '2026', label: '2026', count: 5 }, { value: '2025', label: '2025', count: 1 },
  ]);
  assert.deepEqual(volumes(dated, 'month').map(choice => choice.value), ['2026-10', '2026-07', '2026-04', '2026-03', '2026-01', '2025-12']);
  assert.equal(volumes(dated, 'month')[0].label, 'October 2026');
});
test('quarters change exactly at calendar boundaries', () => {
  assert.deepEqual(dated.slice(0, 6).map(post => volume(post, 'quarter').value), ['2026-Q1', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2025-Q4']);
  assert.equal(volumes(dated, 'quarter').find(choice => choice.value === '2026-Q1').count, 2);
});
test('a volume combines with food, topic, and search filters', () => {
  assert.deepEqual(filterPosts(dated, { mode: 'food', value: 'Pasta', volumeMode: 'quarter', volumeValue: '2026-Q1' }).map(post => post.id), ['jan', 'mar']);
  assert.deepEqual(filterPosts(dated, { mode: 'topic', value: 'Travel', volumeMode: 'year', volumeValue: '2026' }).map(post => post.id), ['jan']);
  assert.deepEqual(filterPosts(dated, { query: 'Cake', volumeMode: 'month', volumeValue: '2026-04' }).map(post => post.id), ['apr']);
  assert.equal(filterPosts(dated, { mode: 'food', value: 'Cake', volumeMode: 'year', volumeValue: '2025' }).length, 0);
});
test('undated posts remain in all volumes, but not a specific period', () => {
  assert.equal(filterPosts(dated, { volumeMode: 'year' }).length, 7);
  assert.equal(filterPosts(dated, { volumeMode: 'all', volumeValue: '2026' }).length, 7);
  assert.equal(filterPosts(dated, { volumeMode: 'year', volumeValue: '2026' }).length, 5);
  assert.equal(volume(dated[6], 'year'), null);
});
test('invalid dates and ambiguous date formats cannot invent volumes', () => {
  for (const date of ['February 29, 2026', 'April 31, 2026', '2026-13-01', '2026-01-00', '2026-02-30', '02/03/2026', 'Unknown 1, 2026', '', null, 2026]) {
    assert.equal(dateParts(date), null, String(date));
  }
  assert.deepEqual(dateParts('February 29, 2024'), { year: 2024, month: 2, day: 29 });
  assert.equal(dateParts('February 29, 1900'), null);
  assert.deepEqual(dateParts('2000-02-29'), { year: 2000, month: 2, day: 29 });
});
test('date ordering is consistent across date formats, with unknown dates last', () => {
  assert.equal(dateOrder({ date: '2026-01-01' }), dateOrder({ date: 'January 01, 2026' }));
  assert.deepEqual([...dated].sort((a, b) => dateOrder(b) - dateOrder(a)).map(post => post.id), ['oct', 'jul', 'apr', 'mar', 'jan', 'dec', 'undated']);
});
test('empty or undated archives have no fabricated volume choices', () => {
  assert.deepEqual(volumes([], 'month'), []);
  assert.deepEqual(volumes([{ date: 'From Instagram' }], 'quarter'), []);
  assert.deepEqual(volumes(dated, 'all'), []);
});
