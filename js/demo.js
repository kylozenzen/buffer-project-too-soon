// demo.js — a fictional queue and news day so anyone can see Too Soon? catch things.
// All names, brands and stories here are made up.

(function (global) {
  'use strict';

  function at(daysFromNow, hour, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  function shortDate(daysFromNow) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function build() {
    const channels = [
      { id: 'demo-ig', service: 'instagram', name: 'lumacoffee' },
      { id: 'demo-li', service: 'linkedin', name: 'Luma Coffee Co.' },
      { id: 'demo-th', service: 'threads', name: 'lumacoffee' },
    ];

    const posts = [
      { id: 'd1', channelId: 'demo-ig', dueAt: at(0, 16, 30), text: 'Our new cold brew is on fire 🔥 Grab one before they\'re gone this weekend!' },
      { id: 'd2', channelId: 'demo-th', dueAt: at(1, 9), text: 'Who else is counting down to Jordan Vale\'s new album Friday?? We\'re naming a latte after it ☕🎶' },
      { id: 'd3', channelId: 'demo-li', dueAt: at(1, 12), text: 'Tickets for our Latte Art Throwdown are live! Spots are limited: https://demo.toosoon.app/sold-out-event' },
      { id: 'd4', channelId: 'demo-ig', dueAt: at(2, 8), text: `Last chance! Our fall punch card deal ends ${shortDate(-1)}. Don't miss it.` },
      { id: 'd5', channelId: 'demo-li', dueAt: at(2, 14), text: 'We\'re hiring two baristas for our Riverside location. Great team, flexible hours, free coffee (obviously).' },
      { id: 'd6', channelId: 'demo-th', dueAt: at(3, 7, 30), text: 'Rainy morning? Perfect excuse for a second cup. What\'s your go-to order?' },
      { id: 'd7', channelId: 'demo-ig', dueAt: at(3, 18), text: 'Throwback to the Harbor County block party last summer. Can\'t wait to do it again!' },
    ];

    const headlines = [
      { id: 'h1', kind: 'news', title: 'Singer Jordan Vale dies at 34, label confirms', source: 'Demo Wire' },
      { id: 'h2', kind: 'news', title: 'Warehouse fire downtown forces nearby families to evacuate', source: 'Demo Daily' },
      { id: 'h3', kind: 'alert', title: 'Flash Flood Warning: Harbor County', area: 'Harbor County', source: 'Demo Weather Service', url: 'https://www.weather.gov/alerts' },
      { id: 'h4', kind: 'news', title: 'Stocks edge higher as tech earnings beat expectations', source: 'Demo Markets' },
      { id: 'h5', kind: 'news', title: 'City council approves new bike lanes on Main Street', source: 'Demo Local' },
      { id: 'h6', kind: 'news', title: 'Pumpkin spice sales hit record high for third straight year', source: 'Demo Food' },
      { id: 'h7', kind: 'people', weight: 'tragedy', title: 'Jordan Vale (American singer) has died', source: 'Wikipedia + Wikidata (demo)' },
      { id: 'h8', kind: 'trend', title: '“jordan vale” is trending: Fans gather for candlelight vigil', source: 'Google Trends (demo)' },
      { id: 'h9', kind: 'recall', weight: 'controversy', title: 'Recall: Northfield Dairy recalls oat milk cartons (Class II)', source: 'FDA (demo)' },
    ];

    const pageResults = {
      'https://demo.toosoon.app/sold-out-event': { ok: true, status: 200, flags: ['sold_out'] },
    };

    return { channels, posts, headlines, pageResults };
  }

  const api = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TooSoonDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
