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
  // Bluesky searchPosts (documented shape: { posts: [{ uri, author: { handle }, record: { text, createdAt }, indexedAt }] })
  if (url.includes('bsky.app/xrpc/app.bsky.feed.searchPosts')) {
    const q = decodeURIComponent(url.match(/q=([^&]+)/)[1]);
    const iso = new Date(Date.now() - 3600e3).toISOString();
    const post = (t, i) => ({ uri: `at://did:plc:x/app.bsky.feed.post/${i}`, author: { handle: `user${i}.bsky.social` }, record: { text: t, createdAt: iso }, indexedAt: iso });
    if (q.includes('Luma Coffee')) return ok({ posts: [
      post('Luma Coffee charged me twice and won\'t refund. Worst.', 1), post('never going back to Luma Coffee, rude and awful', 2),
      post('Luma Coffee is a scam honestly', 3), post('anyone tried the new Luma Coffee cold brew?', 4),
      post('a totally unrelated post about lumber', 5) ] });
    if (q.includes('pumpkin')) return ok({ posts: [post('pumpkin latte season at last', 6)] });
    return ok({ posts: [] });
  }
  // Reddit refuses cloud servers (403) for JSON and RSS here, so chatter must still work on Bluesky alone.
  if (url.includes('reddit.com')) return { ok: false, status: 403 };
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
  // Bluesky + Reddit chatter: criticism of the brand becomes one 'controversy' summary; Reddit blocked is fine.
  const ch = JSON.parse((await require('../netlify/functions/headlines.js').handler({ httpMethod: 'GET', queryStringParameters: { sources: 'chatter', keywords: 'pumpkin latte', brands: 'Luma Coffee' } })).body);
  const hot = ch.items.find(i => i.kind === 'chatter' && i.term === 'Luma Coffee');
  assert.ok(hot && hot.weight === 'controversy' && hot.brand === true, 'brand chatter summarized as controversy');
  assert.strictEqual(hot.counts.total, 4, 'posts that do not contain the term are ignored');
  assert.strictEqual(hot.counts.critical, 3, 'critical posts counted');
  const calm = ch.items.find(i => i.kind === 'chatter' && i.term === 'pumpkin latte');
  assert.ok(calm && calm.weight === 'neutral', 'calm chatter stays neutral');
  assert.strictEqual(ch.sources.chatterStatus.reddit, 'unavailable', 'reddit blocked reported, not thrown');
  assert.strictEqual(ch.sources.chatterStatus.bluesky, 'ok', 'bluesky ok');
  assert.strictEqual(ch.items.filter(i => i.kind === 'chatter').length, 2, 'one summary per term, never a flood');
  assert.strictEqual(R.checkPost({ id: 'x', text: 'Weekend sale: 20% off all beans!' }, ch.items).verdict, 'look', 'brand chatter flags promos end to end');
  console.log('  chatter:', hot.title);
  console.log('\nall source tests passed');
})().catch(e => { console.error(e); process.exit(1); });
