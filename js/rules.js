// rules.js — the free, instant layer of Too Soon?
// Compares each scheduled post against today's headlines/alerts and link checks.
// Works in the browser (window.TooSoonRules) and in Node (module.exports) for tests.

(function (global) {
  'use strict';

  const LEVEL = { good: 0, look: 1, too_soon: 2 };

  // Headline words that make a story "heavy".
  const TRAGEDY = /\b(dies|died|dead|death|deaths|killed|killing|kills|shooting|shooter|gunman|shot|stabbing|stabbed|murder(ed)?|crash(es|ed)?|attack(s|ed)?|bomb(ing|ed)?|explosion|blast|hurricane|tornado|earthquake|wildfire|fire kills|flood(s|ing)?|tsunami|massacre|hostage|terror(ist|ism)?|overdose|missing|victims?|tragedy|mourn(s|ing)?|funeral|war|airstrike|evacuat(e|ed|ion)|collapse[sd]?|domestic violence|abuse|abused|assault(ed)?|survivors?)\b/i;
  const CONTROVERSY = /\b(arrest(ed)?|charged|indicted|scandal|lawsuit|sued|sues|recall(s|ed)?|layoffs?|bankrupt(cy)?|boycott|backlash|accused|allegations?|fired|resigns?|outage|breach|leak(ed)?|fined|investigation)\b/i;

  // Post wording that reads badly next to heavy news. Each maps to related headline words.
  const TONE = [
    { re: /\b(killer|killing it|kill(s)? it|murder(ed)?|slay(ing)?)\b/i, near: /\b(killed|killing|kills|murder(ed)?|shooting|stabbing|massacre|victims?)\b/i },
    { re: /\b(to die for|dead(ly)?|dying|rip|rest in peace)\b/i, near: /\b(dies|died|dead|death|mourn(s|ing)?|funeral)\b/i },
    { re: /\b(shoot(ing|ers?)?|shot|bullet|trigger|bang)\b/i, near: /\b(shooting|shooter|gunman|shot)\b/i },
    { re: /\b(bomb|blast|explosive|explode|blow(ing)? up|boom|nuke)\b/i, near: /\b(bomb(ing)?|explosion|blast|attack)\b/i },
    { re: /\b(on fire|fire|lit|heat wave|burn(ing)?)\b|🔥/i, near: /\b(wildfire|fire|burn(ed|ing)?|blaze|heat)\b/i },
    { re: /\b(flood(ing)?|drown(ing)?|wave|making waves|storm(ing)?|hurricane|tornado|whirlwind)\b|🌊|🌪/i, near: /\b(flood(s|ing)?|hurricane|tornado|storm|tsunami)\b/i },
    { re: /\b(crash(ing)?|wreck(ed)?|collision)\b/i, near: /\b(crash(es|ed)?|collision|derail)\b/i },
    { re: /\b(attack|war|battle|invasion|hostage|disaster|epic fail|apocalypse)\b/i, near: /\b(attack|war|airstrike|invasion|hostage|terror)\b/i },
  ];

  const PROMO = /(\b(sale|discount|deal|deals|promo|coupon|bogo|shop now|buy now|limited time|free shipping|doorbuster|may we suggest|try (our|these|this)|recipe|order now|shopping)\b|\d+\s*%\s*off|\bcode:?\s+[A-Z0-9]{3,})/i;
  const PARTY = /(\b(party|lol|lmao|happy hour|celebrate|let'?s go|turn up|yay|woo+)\b|🎉|🥳|🍻|🍾)/iu;

  const STOP = new Set(('i a an the we our us you your my me this that these those it its new today tonight tomorrow yesterday ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
    'join get shop buy save don\'t can\'t won\'t happy thanks thank big free just now here there what when where why how who come check see ' +
    'hey hi hello and or but so if for with from on in at to of by our weekend week day night am pm us usa rip').split(' '));

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").trim(); }

  // Names, places, handles, hashtags a post mentions.
  function extractEntities(text, withPartial) {
    const out = new Set();
    const partial = new Set();
    const tags = new Set();
    const display = {};
    const t = String(text || '');
    (t.match(/[@#][A-Za-z0-9_]{3,}/g) || []).forEach(tag => {
      const word = norm(tag.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2'));
      const raw = norm(tag.slice(1));
      out.add(word); tags.add(word);
      out.add(raw); tags.add(raw);
      display[raw] = display[word] = tag;
    });
    // Capitalized runs: "Jordan Vale", "San Antonio", "Taylor"
    const runs = t.match(/\b[A-Z][a-zA-Z'’.-]+(?:\s+(?:of|de|la|the)?\s*[A-Z][a-zA-Z'’.-]+)*/g) || [];
    runs.forEach(run => {
      const words = run.split(/\s+/).filter(w => !STOP.has(norm(w).replace(/[.']+$/, '')));
      if (!words.length) return;
      const phrase = norm(words.join(' ')).replace(/['’]s$/, '').replace(/[.]+$/, '');
      if (phrase.length >= 4) out.add(phrase);
      // Two-word stretches of a longer run count as full names ("RIP Carrie Fisher" → "carrie fisher").
      if (words.length > 2) for (let i = 0; i < words.length - 1; i++) {
        const pair = norm(`${words[i]} ${words[i + 1]}`).replace(/['’]s$/, '');
        if (pair.length >= 5) out.add(pair);
      }
      // Single words inside a longer name ("Apple" in "Apple Crumble") count as partial matches.
      if (words.length > 1) words.forEach(w => {
        const one = norm(w).replace(/['’]s$/, '').replace(/[.]+$/, '');
        if (one.length >= 4 && !STOP.has(one)) partial.add(one);
      });
    });
    if (withPartial) return { full: [...out], partial: [...partial].filter(w => !out.has(w)), tags: [...tags], display };
    return [...out];
  }

  function headlineWeight(title) {
    if (TRAGEDY.test(title)) return 'tragedy';
    if (CONTROVERSY.test(title)) return 'controversy';
    return 'neutral';
  }

  function containsPhrase(haystack, phrase) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${esc}\\b`, 'i').test(haystack);
  }

  function extractDates(text, dueAt) {
    const due = dueAt ? new Date(dueAt) : null;
    const year = due ? due.getFullYear() : new Date().getFullYear();
    const dates = [];
    let m;
    MONTH_RE.lastIndex = 0;
    while ((m = MONTH_RE.exec(String(text || '')))) {
      const mi = MONTHS.findIndex(name => name.startsWith(m[1].toLowerCase().slice(0, 3)));
      const day = Number(m[2]);
      if (mi < 0 || day < 1 || day > 31) continue;
      dates.push({ label: m[0], date: new Date(year, mi, day, 23, 59) });
    }
    return dates;
  }

  function extractUrls(text) {
    return [...new Set((String(text || '').match(/https?:\/\/[^\s)"'<>]+/g) || []).map(u => u.replace(/[.,!?]+$/, '')))];
  }

  // soft = a judgment call that "relaxed" sensitivity drops; hard = always shown.
  function bump(result, level, reason, headline, soft) {
    if (LEVEL[level] > LEVEL[result.verdict]) result.verdict = level;
    result.reasons.push({ level, text: reason, headlineId: headline ? headline.id : null, soft: !!soft, heavy: !!(headline && (headline.weight === 'tragedy' || headlineWeight(headline.title || '') === 'tragedy')) });
  }

  // Sensitivity dial: strict promotes judgment calls tied to tragic news; relaxed drops soft "look" notes.
  function applySensitivity(result, level) {
    if (level === 'relaxed') result.reasons = result.reasons.filter(r => !(r.soft && r.level === 'look'));
    if (level === 'strict') result.reasons.forEach(r => { if (r.level === 'look' && r.heavy) r.level = 'too_soon'; });
    result.verdict = result.reasons.reduce((v, r) => (LEVEL[r.level] > LEVEL[v] ? r.level : v), 'good');
    return result;
  }

  // post: { id, text, dueAt }
  // headlines: [{ id, title, kind, area? }]
  // ctx: { pageResults: { [url]: { ok, status, flags } }, ignore: [entity], watch: [word] }
  function checkPost(post, headlines, ctx = {}) {
    const text = String(post.text || '');
    const result = { id: post.id, verdict: 'good', reasons: [] };
    const ignore = new Set((ctx.ignore || []).map(norm));
    const ents = extractEntities(text, true);
    const entities = ents.full.filter(e => !ignore.has(e));
    const partials = ents.partial.filter(e => !ignore.has(e));
    const tagged = new Set(ents.tags);
    const weigh = h => h.weight || headlineWeight(h.title);
    const heavy = headlines.filter(h => h.kind !== 'alert' && weigh(h) === 'tragedy');

    // 1. Post names someone/something that's in heavy news today.
    for (const h of headlines) {
      const weight = h.kind === 'alert' ? 'alert' : weigh(h);
      if (weight === 'neutral') continue;
      const hay = `${h.title} ${h.area || ''}`;
      let hit = entities.find(e => containsPhrase(hay, e));
      if (!hit) {
        // Hashtags are written without spaces (#WhyIStayed), so compare them against the headline with spaces stripped too.
        const squashed = hay.toLowerCase().replace(/[^a-z0-9#]/g, '');
        const raw = (text.match(/#[A-Za-z0-9_]{4,}/g) || []).map(t => t.slice(1).toLowerCase()).find(t => !ignore.has(t) && squashed.includes(t));
        if (raw) { hit = raw; tagged.add(raw); }
      }
      let isPartial = false;
      if (!hit) { hit = partials.find(e => containsPhrase(hay, e)); isPartial = !!hit; }
      if (!hit) continue;
      const label = (ents.display && ents.display[hit]) || hit.replace(/\b\w/g, c => c.toUpperCase());
      if (isPartial) { bump(result, 'look', `Shares a name with a story in the news: "${h.title}"`, h, true); continue; }
      // Multi-word names ("Jordan Vale") and hashtags (#Aurora) are deliberate references, not coincidences.
      const strong = hit.includes(' ') || tagged.has(hit);
      if (weight === 'tragedy') {
        const promo = PROMO.test(text);
        bump(result, strong || promo ? 'too_soon' : 'look', promo ? `Ties a promotion to ${label}, which is in today's news: "${h.title}"` : `Mentions ${label}, and today's news has: "${h.title}"`, h);
      }
      else if (weight === 'alert') bump(result, 'look', `${label} is under an active alert: ${h.title}`, h);
      else bump(result, 'look', `Mentions ${label}, which is in a developing story: "${h.title}"`, h, true);
    }

    // 2. Wording that echoes heavy news.
    for (const tone of TONE) {
      const word = (text.match(tone.re) || [])[0];
      if (!word) continue;
      const echo = heavy.find(h => tone.near.test(h.title));
      if (echo) bump(result, 'too_soon', `"${word}" echoes today's news: "${echo.title}"`, echo);
      else if (ctx.sensitivity === 'strict' && heavy.length) bump(result, 'look', `"${word}" may read badly on a heavy news day`, null);
      break;
    }

    // 2b. Your area is under a serious alert and this posts within a day.
    if (post.dueAt) {
      const hrs = (new Date(post.dueAt).getTime() - (ctx.now || Date.now())) / 3600000;
      const local = headlines.find(h => h.kind === 'alert' && h.local && /extreme|severe/i.test(h.severity || ''));
      if (local && hrs >= -1 && hrs <= 24) bump(result, 'look', `Your area is under an active alert: ${local.title}`, local);
    }

    // 2c. Sensitive days (9/11, Memorial Day, Holocaust Remembrance Day…).
    if (ctx.calendar && post.dueAt) {
      const day = ctx.calendar.dayFor(post.dueAt);
      if (day) {
        if (PROMO.test(text)) bump(result, day.tone === 'solemn' ? 'too_soon' : 'look', day.tone === 'solemn' ? `A sale or promo going out on ${day.name}` : `Promo on ${day.name}: common, but it gets called out when it reads like a cash grab`, null, day.tone !== 'solemn');
        else if (PARTY.test(text)) bump(result, 'look', `Upbeat post going out on ${day.name}`, null, true);
        else if (day.tone === 'solemn' && (day.keywords || []).some(k => new RegExp(k, 'i').test(text))) bump(result, 'look', `A brand tribute on ${day.name}: keep it plain, with no product, logo or mascot in the image`, null, true);
      }
    }

    // 3. Brand watchlist.
    for (const w of (ctx.watch || [])) {
      if (w && containsPhrase(text, w)) {
        const inNews = headlines.find(h => containsPhrase(h.title, w));
        if (inNews) bump(result, 'look', `Watchlist word "${w}" is in the news: "${inNews.title}"`, inNews);
      }
    }

    // 4. Dates that will already have passed when this posts.
    if (post.dueAt) {
      const due = new Date(post.dueAt);
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      for (const d of extractDates(text, post.dueAt)) {
        if (d.date < dueDay) bump(result, 'too_soon', `Says "${d.label}", but it posts ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, null);
      }
    }

    // 5. Links.
    const pages = ctx.pageResults || {};
    for (const url of extractUrls(text)) {
      const r = pages[url];
      if (!r) continue;
      const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
      if (r.flags.includes('dead') || r.flags.includes('invalid')) bump(result, 'too_soon', `Link is broken (${r.status || 'unreachable'}): ${host}`, null);
      if (r.flags.includes('sold_out')) bump(result, 'too_soon', `Linked page says sold out: ${host}`, null);
      if (r.flags.includes('cancelled')) bump(result, 'too_soon', `Linked page says cancelled: ${host}`, null);
      if (r.flags.includes('ended')) bump(result, 'too_soon', `Linked offer or event has ended: ${host}`, null);
      if (r.flags.includes('postponed')) bump(result, 'look', `Linked page mentions postponed: ${host}`, null);
    }

    if (ctx.sensitivity && ctx.sensitivity !== 'normal') applySensitivity(result, ctx.sensitivity);
    return result;
  }

  // Pre-publish tidy-ups: practical notes that don't change the verdict.
  const LIMITS = { twitter: 280, x: 280, threads: 500, bluesky: 300, mastodon: 500, linkedin: 3000, instagram: 2200, tiktok: 2200, pinterest: 500, facebook: 63206, googlebusiness: 1500, youtube: 5000 };
  function tidy(post, ctx = {}) {
    const notes = [];
    const text = String(post.text || '');
    const service = String(post.service || '').toLowerCase();
    const limit = LIMITS[service];
    if (limit && text.length > limit) notes.push(`${text.length} characters: over ${service}'s ${limit} limit`);
    const placeholder = text.match(/\[[^\]]{2,30}\]|\b(TBD|TODO|XXX|lorem ipsum)\b/i);
    if (placeholder) notes.push(`Looks like a placeholder was left in: ${placeholder[0]}`);
    if (/(^|\s)@(\s|$)/.test(text) || /@[A-Za-z0-9_]*[^\sA-Za-z0-9_.,!?:;)'’"-]/.test(text.replace(/https?:\/\/\S+/g, ''))) notes.push('One of the @handles looks broken');
    if ((text.match(/#[A-Za-z0-9_]+/g) || []).length > 5 && ['linkedin', 'threads', 'facebook'].includes(service)) notes.push('More than 5 hashtags reads as spammy here');
    if (ctx.utm) extractUrls(text).filter(u => !/utm_/i.test(u)).forEach(u => notes.push(`No UTM tracking on ${u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}`));
    (post.assets || []).forEach(a => { if (a && a.type === 'image' && !String(a.altText || '').trim()) notes.push('An image has no alt text'); });
    if (ctx.duplicates && ctx.duplicates.has(post.id)) notes.push('The same text is scheduled on another channel within the hour');
    return [...new Set(notes)];
  }

  function findDuplicates(posts) {
    const dup = new Set();
    const key = p => String(p.text || '').trim().toLowerCase();
    posts.forEach((a, i) => posts.slice(i + 1).forEach(b => {
      if (key(a) && key(a) === key(b) && a.channelId !== b.channelId && a.dueAt && b.dueAt && Math.abs(new Date(a.dueAt) - new Date(b.dueAt)) < 3600e3) { dup.add(a.id); dup.add(b.id); }
    }));
    return dup;
  }

  function checkQueue(posts, headlines, ctx) {
    return posts.map(p => checkPost(p, headlines, ctx));
  }

  const api = { checkPost, checkQueue, extractEntities, extractDates, extractUrls, headlineWeight, applySensitivity, tidy, findDuplicates, LEVEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TooSoonRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
