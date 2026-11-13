'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const Demo = require('../js/demo.js');

const { posts, headlines, pageResults } = Demo.build();
const results = Object.fromEntries(R.checkQueue(posts, headlines, { pageResults }).map(r => [r.id, r]));
for (const p of posts) console.log(p.id, results[p.id].verdict.padEnd(9), results[p.id].reasons.map(r => r.text).join(' | '));

assert.strictEqual(results.d1.verdict, 'too_soon', '"on fire" next to a downtown fire');
assert.strictEqual(results.d2.verdict, 'too_soon', 'celebrity death');
assert.strictEqual(results.d3.verdict, 'too_soon', 'sold out link');
assert.strictEqual(results.d4.verdict, 'too_soon', 'date passed');
assert.strictEqual(results.d5.verdict, 'good', 'hiring post is fine');
assert.strictEqual(results.d6.verdict, 'good', 'rainy morning is fine');
assert.strictEqual(results.d7.verdict, 'look', 'county under flood alert');

// Calm news day: same tone word, no heavy headline → good.
const calm = R.checkPost({ id: 'x', text: 'This deal is a killer 🔥' }, [{ id: 'n', kind: 'news', title: 'Stocks edge higher' }]);
assert.strictEqual(calm.verdict, 'good');

// Ignore list suppresses a false match.
const apple = R.checkPost({ id: 'y', text: 'Fresh Apple Crumble is back!' }, [{ id: 'n', kind: 'news', title: 'Apple faces lawsuit over batteries' }]);
assert.strictEqual(apple.verdict, 'look');
const appleIgnored = R.checkPost({ id: 'y', text: 'Fresh Apple Crumble is back!' }, [{ id: 'n', kind: 'news', title: 'Apple faces lawsuit over batteries' }], { ignore: ['apple crumble', 'apple'] });
assert.strictEqual(appleIgnored.verdict, 'good');

// The real Oct 29, 2012 (Hurricane Sandy) cases used in onboarding.
const sandy = [{ id: 's1', kind: 'news', title: 'Hurricane Sandy slams the East Coast; millions without power, flooding in New York and New Jersey' }];
const gap = R.checkPost({ id: 'g', text: 'All impacted by #Sandy, stay safe! We’ll be doing lots of Gap.com shopping today. How about you?' }, sandy);
assert.strictEqual(gap.verdict, 'too_soon', 'hashtag matches disaster');
const aa = R.checkPost({ id: 'a', text: 'In case you’re bored during the storm: 20% off everything for the next 36 hours. Code: SANDYSALE' }, sandy);
assert.strictEqual(aa.verdict, 'too_soon', 'storm wording during hurricane');
console.log(gap.reasons[0].text, '|', aa.reasons[0].text);

// Location setting: a severe local alert flags posts going out within 24h, not next week.
const localAlert = [{ id: 'la', kind: 'alert', local: true, severity: 'Severe', title: 'Tornado Warning: Bexar' }];
const soonPost = R.checkPost({ id: 's', text: 'Happy hour starts at 4!', dueAt: new Date(Date.now() + 3 * 3600e3).toISOString() }, localAlert);
const laterPost = R.checkPost({ id: 'l', text: 'Happy hour starts at 4!', dueAt: new Date(Date.now() + 72 * 3600e3).toISOString() }, localAlert);
assert.strictEqual(soonPost.verdict, 'look');
assert.strictEqual(laterPost.verdict, 'good');

// Sensitive days
const Cal = require('../js/calendar.js');
const nineEleven = new Date(2027, 8, 11, 10).toISOString();
assert.strictEqual(R.checkPost({ id: 'x', text: '20% off everything today only!', dueAt: nineEleven }, [], { calendar: Cal }).verdict, 'too_soon');
assert.strictEqual(R.checkPost({ id: 'x', text: 'Happy hour starts at 4 🍻', dueAt: nineEleven }, [], { calendar: Cal }).verdict, 'look');
assert.strictEqual(R.checkPost({ id: 'x', text: 'We remember.', dueAt: nineEleven }, [], { calendar: Cal }).verdict, 'look'); // tribute: a reminder to keep it plain
assert.strictEqual(R.checkPost({ id: 'x', text: 'Open 7 to 3 today.', dueAt: nineEleven }, [], { calendar: Cal }).verdict, 'good');
const memorial = Cal.daysForYear(2027).find(d => d.name === 'Memorial Day').date;
assert.strictEqual(memorial.getDate(), 31, 'Memorial Day 2027 is May 31');
assert.strictEqual(R.checkPost({ id: 'x', text: 'Memorial Day Sale! Shop now', dueAt: new Date(2027, 4, 31, 9).toISOString() }, [], { calendar: Cal }).verdict, 'look');
// Source weight override: a Wikipedia death item counts as heavy news
const wikiDeath = [{ id: 'w', kind: 'people', weight: 'tragedy', title: 'Jordan Vale (American singer) has died' }];
assert.strictEqual(R.checkPost({ id: 'x', text: "Can't wait for Jordan Vale's tour!" }, wikiDeath).verdict, 'too_soon');

// Sensitivity dial
const partialNews = [{ id: 'n', kind: 'news', title: 'Apple faces lawsuit over batteries' }];
assert.strictEqual(R.checkPost({ id: 'y', text: 'Fresh Apple Crumble is back!' }, partialNews, { sensitivity: 'relaxed' }).verdict, 'good');
const heavyDay = [{ id: 'n', kind: 'news', title: 'Five killed in highway crash' }];
assert.strictEqual(R.checkPost({ id: 'y', text: 'This deal is a killer' }, [{ id: 'n', kind: 'news', title: 'Wildfire forces evacuations' }]).verdict, 'good');
assert.strictEqual(R.checkPost({ id: 'y', text: 'This deal is a killer' }, [{ id: 'n', kind: 'news', title: 'Wildfire forces evacuations' }], { sensitivity: 'strict' }).verdict, 'look');
assert.strictEqual(R.checkPost({ id: 'y', text: 'Throwback to the Harbor County fair!' }, [{ id: 'a', kind: 'alert', title: 'Tornado kills two in Harbor County', area: 'Harbor County' }], { sensitivity: 'strict' }).verdict, 'too_soon');

// Tidy-ups
const tidyNotes = R.tidy({ id: 't', service: 'twitter', text: 'Join us for [event] this Friday! ' + 'x'.repeat(260) }, {});
assert.ok(tidyNotes.some(n => /placeholder/.test(n)) && tidyNotes.some(n => /280/.test(n)), 'tidy notes');
const dups = R.findDuplicates([{ id: 'a', channelId: 1, text: 'Hi', dueAt: '2026-01-01T10:00:00Z' }, { id: 'b', channelId: 2, text: 'hi', dueAt: '2026-01-01T10:20:00Z' }]);
assert.ok(dups.has('a') && dups.has('b'), 'duplicates');

// Every case in the Guide must be caught by the real rules.
const Cases = require('../js/cases.js');
for (const c of Cases.CASES) {
  const r = Cases.replay(c, R, Cal);
  console.log(`  ${c.brand.padEnd(16)} ${r.verdict.padEnd(8)} ${r.reasons[0] ? r.reasons[0].text : ''}`);
  assert.notStrictEqual(r.verdict, 'good', `${c.brand} should be flagged`);
}

console.log('\nall rules tests passed');
