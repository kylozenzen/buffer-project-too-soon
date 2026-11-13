// calendar.js — sensitive days: dates where promos and jokes tend to get called out.
// No API needed. US-focused for now; edit the list to fit your audience.
(function (global) {
  'use strict';

  // tone: 'solemn' = a day of remembrance or mourning; 'observance' = a commemorative day where sales/jokes often read as tone-deaf
  const FIXED = [
    { md: '01-27', name: 'International Holocaust Remembrance Day', tone: 'solemn', keywords: ['holocaust', 'never again', 'remember'] },
    { md: '06-19', name: 'Juneteenth', tone: 'observance' },
    { md: '09-11', name: 'the 9/11 anniversary', tone: 'solemn', keywords: ['9/11', 'never forget', 'september 11', 'remember'] },
    { md: '11-11', name: 'Veterans Day', tone: 'observance' },
    { md: '11-20', name: 'Transgender Day of Remembrance', tone: 'solemn', keywords: ['tdor', 'remembrance', 'remember'] },
    { md: '12-07', name: 'Pearl Harbor Remembrance Day', tone: 'solemn', keywords: ['pearl ?harbor', 'remember', 'never forget'] },
  ];

  function nthWeekday(year, month, weekday, n) { // n: 1-based; -1 = last
    if (n > 0) {
      const d = new Date(year, month, 1);
      const shift = (weekday - d.getDay() + 7) % 7;
      return new Date(year, month, 1 + shift + (n - 1) * 7);
    }
    const d = new Date(year, month + 1, 0);
    const shift = (d.getDay() - weekday + 7) % 7;
    return new Date(year, month, d.getDate() - shift);
  }

  function daysForYear(year) {
    const out = FIXED.map(f => ({ ...f, date: new Date(year, Number(f.md.slice(0, 2)) - 1, Number(f.md.slice(3))) }));
    out.push({ name: 'Martin Luther King Jr. Day', tone: 'observance', date: nthWeekday(year, 0, 1, 3) });
    out.push({ name: 'Memorial Day', tone: 'observance', date: nthWeekday(year, 4, 1, -1) });
    return out;
  }

  const key = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  function dayFor(date) {
    const d = new Date(date);
    return daysForYear(d.getFullYear()).find(x => key(x.date) === key(d)) || null;
  }

  // Sensitive days from today through the next `n` days, as "What's happening" items.
  function upcoming(n = 7, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + n * 86400000);
    const all = [...daysForYear(start.getFullYear()), ...daysForYear(start.getFullYear() + 1)];
    return all.filter(x => x.date >= start && x.date <= end).sort((a, b) => a.date - b.date).map((x, i) => {
      const diff = Math.round((x.date - start) / 86400000);
      const when = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : x.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      return { id: `day-${i}`, kind: 'day', weight: 'neutral', title: `${when}: ${x.name.replace(/^the /, '')}`, source: x.tone === 'solemn' ? 'Day of remembrance' : 'Observance', tone: x.tone };
    });
  }

  const api = { dayFor, upcoming, daysForYear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TooSoonCalendar = api;
})(typeof window !== 'undefined' ? window : globalThis);
