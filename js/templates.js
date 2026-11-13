// templates.js — holding statements and the crisis checklist, shared by the app and the Guide.
(function (global) {
  'use strict';

  const TEMPLATES = [
    {
      id: 'pause',
      name: 'Pausing our posts',
      when: 'A major tragedy where you have no direct role. Often the best move is to post nothing at all; use this if your audience expects to hear from you.',
      text: 'We’re pausing our regular posts today out of respect for everyone affected by [event]. We’ll be back soon.',
    },
    {
      id: 'condolence',
      name: 'Short condolence',
      when: 'Something has hit your community or your audience directly.',
      text: 'Our hearts are with [community] today.',
    },
    {
      id: 'service',
      name: 'Service update',
      when: 'The event changes your hours, services or events.',
      text: 'Because of [event], [location/service] is [closed / changed] today. Your safety comes first. We’ll share updates here.',
    },
    {
      id: 'weather',
      name: 'Weather closure',
      when: 'Severe weather in your area.',
      text: 'Due to [weather], we’re closed [today / until date]. Please stay safe. We’ll see you when it passes.',
    },
    {
      id: 'apology',
      name: 'We posted something we shouldn’t have',
      when: 'A post already went out and it landed badly. Post this where the original went out.',
      text: 'Earlier today we posted [what]. It was insensitive given [what happened], and we’ve taken it down. We’re sorry.',
    },
  ];

  const DONTS = [
    'No sale, link, product shot, logo or mascot next to a sympathy message (SpaghettiOs, AT&T, Cinnabon).',
    'Don’t use the event’s hashtag unless you’re directly involved (DiGiorno, Gap).',
    'Don’t follow condolences with regular content the same day (Epicurious).',
    'Apologize once, in plain words, where the original post went out. Don’t paste the same apology over and over.',
    'Say what you got wrong. “If anyone was offended” isn’t an apology.',
  ];

  const CHECKLIST = [
    'Pause everything scheduled for the next 24–48 hours (Go dark).',
    'Check every channel, including ones scheduled outside Buffer: ads, email, newsletters, automations.',
    'Tell your team and clients: what’s paused, who decides when to resume.',
    'Decide: say nothing, post a holding statement, or a service update.',
    'If you post, get one person to read it out loud before it goes out.',
    'Watch replies and messages; answer questions about your services.',
    'Set a time to review: is it still too soon?',
    'Resume slowly. Bring back the safest posts first.',
  ];

  const api = { TEMPLATES, DONTS, CHECKLIST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TooSoonTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
