'use strict';
// Runs the headlines function against mocked versions of every source.
const assert = require('assert');

const now = new Date();
const rss = items => `<rss><channel>${items}</channel></rss>`;
global.fetch = async (url) => {
  const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  if (url.includes('news.google.com')) return ok(rss(`<item><title>City opens new park - Local Wire</title><source>Local Wire</source><link>https://n.ex</link><pubDate>${now.toUTCString()}</pubDate></item>`));
  if (url.includes('weather.gov')) return ok({ features: [
    { properties: { id: 'm1', event: 'Heavy Freezing Spray Warning', areaDesc: 'Cape Halkett out to 15 NM', severity: 'Severe', geocode: { UGC: ['PKZ811'] } } },
    { properties: { id: 'l1', event: 'Flash Flood Warning', areaDesc: 'Mercer, NJ', severity: 'Severe', geocode: { UGC: ['NJC021'] } } },
  ] });
  if (url.includes('featured')) return ok({ mostread: { articles: [
    { title: 'Jordan_Vale', titles: { normalized: 'Jordan Vale' }, description: 'American singer', views: 812345, wikibase_item: 'Q1', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Jordan_Vale' } } },
    { title: 'Main_Page', views: 9e6 },
    { title: 'Some_Movie', titles: { normalized: 'Some Movie' }, description: '2026 film', views: 200000, wikibase_item: 'Q2' },
  ] } });
  if (url.includes('wikidata')) return ok({ entities: {
    Q1: { claims: { P570: [{ mainsnak: { datavalue: { value: { time: `+${now.toISOString().slice(0, 10)}T00:00:00Z` } } } }] } },
    Q2: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q11424' } } } }] } },
  } });
  if (url.includes('trends.google.com')) return ok(rss(`<item><title>jordan vale</title><ht:approx_traffic>2M+</ht:approx_traffic><ht:news_item><ht:news_item_title>Singer Jordan Vale dies at 34</ht:news_item_title><ht:news_item_url>https://t.ex</ht:news_item_url></ht:news_item><pubDate>${now.toUTCString()}</pubDate></item>`));
  if (url.includes('earthquake.usgs.gov')) return ok({ features: [{ properties: { mag: 6.4, place: '20 km S of Somewhere, Chile', time: Date.now(), url: 'https://usgs.ex', code: 'abc' } }] });
  if (url.includes('gdacs')) return ok(rss(`<item><title>Red flood alert in Country X</title><link>https://g.ex</link><gdacs:alertlevel>Red</gdacs:alertlevel><gdacs:country>Country X</gdacs:country></item><item><title>Green alert</title><gdacs:alertlevel>Green</gdacs:alertlevel></item><item><title>Drought is on going in Mexico, United States</title><link>http://www.gdacs.org/report.aspx?eventtype=DR&amp;eventid=1</link><gdacs:alertlevel>Orange</gdacs:alertlevel><gdacs:country>Mexico, United States</gdacs:country></item>`));
  if (url.includes('api.fda.gov')) return ok({ results: [{ recalling_firm: 'Acme Foods', product_description: 'Peanut butter crackers, 12 oz', classification: 'Class I', report_date: '20261110', recall_number: 'F-1' }] });
  if (url.includes('saferproducts.gov')) return ok([{ RecallID: 1, Title: 'Kids Scooters Recalled Due to Fall Hazard', URL: 'https://c.ex', RecallDate: '2026-11-09' }]);
  return { ok: false, status: 404 };
};

(async () => {
  const R = require('../js/rules.js');
  const res = await require('../netlify/functions/headlines.js').handler({ httpMethod: 'GET', queryStringParameters: {} });
  const body = JSON.parse(res.body);
  console.log(body.sources);
  body.items.forEach(i => console.log(`  [${i.kind}${i.weight ? '/' + i.weight : ''}] ${i.title} — ${i.source}`));

  assert.ok(body.items.some(i => i.kind === 'people' && i.weight === 'tragedy' && /Jordan Vale/.test(i.title)), 'wikipedia death');
  assert.ok(!body.items.some(i => /Main Page|Main_Page/.test(i.title)), 'skips Main Page');
  assert.ok(body.items.some(i => i.kind === 'trend' && /dies at 34/.test(i.title)), 'trend with news');
  assert.ok(body.items.some(i => i.source === 'USGS'), 'quake');
  assert.strictEqual(body.items.filter(i => i.source.startsWith('GDACS')).length, 1, 'only red/orange gdacs, no droughts');
  assert.ok(!body.items.some(i => /Some Movie/.test(i.title)), 'films are not people');
  assert.ok(body.items.some(i => /Flash Flood Warning/.test(i.title)) && !body.items.some(i => /Freezing Spray/.test(i.title)), 'marine alerts dropped');
  assert.strictEqual(body.items.filter(i => i.kind === 'recall').length, 2, 'fda + cpsc');

  // A post about the singer is caught by the Wikipedia/Wikidata source alone.
  const verdict = R.checkPost({ id: 'p', text: "Who's ready for Jordan Vale's new album?" }, body.items.filter(i => i.kind === 'people')).verdict;
  assert.strictEqual(verdict, 'too_soon');

  // Turning sources off works.
  const off = JSON.parse((await require('../netlify/functions/headlines.js').handler({ httpMethod: 'GET', queryStringParameters: { sources: '' } })).body);
  assert.ok(!off.items.some(i => ['people', 'trend', 'recall'].includes(i.kind)), 'sources off');
  // Auto-watch terms and brand mentions come back tagged with their term.
  const kw = JSON.parse((await require('../netlify/functions/headlines.js').handler({ httpMethod: 'GET', queryStringParameters: { sources: '', keywords: '#WhyIStayed,Jordan Vale', brands: 'Luma Coffee Co.' } })).body);
  assert.ok(kw.items.some(i => i.kind === 'watch' && i.term === '#WhyIStayed'), 'hashtag watch item');
  assert.ok(kw.items.some(i => i.kind === 'mention' && i.term === 'Luma Coffee Co.'), 'brand mention item');
  console.log('\nall source tests passed');
})().catch(e => { console.error(e); process.exit(1); });
