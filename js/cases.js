// cases.js — famous social media blunders, each replayed through Too Soon?'s rules.
// Posts are quoted from contemporary reporting (sources linked); American Apparel's is a paraphrase of an email.
(function (global) {
  'use strict';

  const CASES = [
    {
      id: 'spaghettios',
      brand: 'SpaghettiOs',
      date: 'December 7, 2013',
      channel: 'Tweet',
      post: 'Take a moment to remember #PearlHarbor with us.',
      context: 'Posted on the 72nd anniversary of the Pearl Harbor attack, with an image of the smiling SpaghettiO mascot holding an American flag.',
      outcome: 'The mascot became a meme within hours. The brand deleted it and apologized: it "meant to pay respect, not to offend."',
      lesson: 'On days of remembrance, a brand mascot or product in the image turns a tribute into an ad. Keep it plain, or stay quiet.',
      feature: 'Sensitive days',
      replay: { dueAt: '2013-12-07T20:00:00', headlines: [] },
      sources: [{ label: 'The Drum', url: 'https://www.thedrum.com/news/2013/12/09/spaghettios-apologises-pearlharbor-tweet' }, { label: 'Daily Dot', url: 'https://dailydot.com/?p=113115' }],
    },
    {
      id: 'gap-sandy',
      brand: 'Gap',
      date: 'October 29, 2012',
      channel: 'Tweet',
      post: 'All impacted by #Sandy, stay safe! We’ll be doing lots of Gap.com shopping today. How about you?',
      context: 'Sent as Hurricane Sandy hit New York and New Jersey.',
      outcome: 'Deleted after the backlash. Gap followed up saying the post was only meant to remind everyone to stay safe and indoors.',
      lesson: '“Stay safe” followed by “go shopping” cancels out the first half. During a disaster, the only call to action is safety.',
      feature: 'Weather alerts',
      replay: { headlines: [{ id: 'h', kind: 'news', title: 'Hurricane Sandy slams the East Coast; millions without power' }] },
      sources: [{ label: 'PR News', url: 'https://www.prnewsonline.com/during-sandy-retailers-forget-audience-first-pr-rule' }],
    },
    {
      id: 'aa-sandy',
      brand: 'American Apparel',
      date: 'October 29, 2012',
      channel: 'Email blast (paraphrased)',
      post: 'In case you’re bored during the storm: 20% off everything for the next 36 hours. Code: SANDYSALE',
      context: 'A “Hurricane Sandy Sale” sent to subscribers in the states the storm was hitting.',
      outcome: 'People on Twitter promised to boycott. The company’s CEO defended it rather than apologizing.',
      lesson: 'Naming a sale after a disaster is never clever. Pause the promo until the storm passes.',
      feature: 'Weather alerts',
      replay: { headlines: [{ id: 'h', kind: 'news', title: 'Hurricane Sandy slams the East Coast; millions without power' }] },
      sources: [{ label: 'IBTimes', url: 'https://www.ibtimes.com/american-apparel-retailers-attempt-cash-sandy-customers-offended-856802' }, { label: 'Marketing Dive', url: 'https://marketingdive.com/news/american-apparel-gap-get-bad-public-feedback-after-hurricane-sandy-marketi/68982' }],
    },
    {
      id: 'digiorno',
      brand: 'DiGiorno',
      date: 'September 8, 2014',
      channel: 'Tweet',
      post: '#WhyIStayed You had pizza.',
      context: 'The hashtag was trending because survivors of domestic violence were sharing why they stayed in abusive relationships.',
      outcome: 'Deleted quickly. DiGiorno apologized publicly and to people one by one: it “did not read what the hashtag was about before posting.”',
      lesson: 'Never join a trending hashtag until you know why it’s trending. It takes ten seconds to check.',
      feature: 'Hashtag check',
      replay: { headlines: [{ id: 'h', kind: 'trend', title: '“#WhyIStayed” is trending: survivors share stories of domestic violence' }] },
      sources: [{ label: 'Salon', url: 'https://www.salon.com/2014/09/09/digiorno_tweet_turns_domestic_violence_solidarity_into_a_promotional_opportunity' }, { label: 'Mental Floss', url: 'https://www.mentalfloss.com/article/75968/8-oven-ready-facts-about-digiorno' }],
    },
    {
      id: 'cinnabon',
      brand: 'Cinnabon',
      date: 'December 27, 2016',
      channel: 'Tweet',
      post: 'RIP Carrie Fisher, you’ll always have the best buns in the galaxy.',
      context: 'Posted the day the actress died, with a Princess Leia drawing whose hair buns were cinnamon rolls.',
      outcome: 'Some fans thought she would have laughed. Most called it a promo on someone’s death. Cinnabon deleted it: “genuinely meant as a tribute, but we shouldn’t have posted it.”',
      lesson: 'A death is never a product moment, even when the pun is right there. If you post at all, leave the product out.',
      feature: 'People in the news',
      replay: { headlines: [{ id: 'h', kind: 'people', weight: 'tragedy', title: 'Carrie Fisher (American actress) has died' }] },
      sources: [{ label: 'CBS News', url: 'https://www.cbsnews.com/amp/news/cinnabon-carrie-fisher-tweet-backlash' }, { label: 'CNBC', url: 'https://www.cnbc.com/2016/12/28/cinnabon-deletes-and-apologizes-for-its-carrie-fisher-tribute-after-twitter-backlash.html' }],
    },
    {
      id: 'att',
      brand: 'AT&T',
      date: 'September 11, 2013',
      channel: 'Tweet + Facebook',
      post: 'Never forget.',
      context: 'The image showed a hand holding a smartphone, photographing the Tribute in Light memorial.',
      outcome: 'Deleted after about an hour. The next day the CEO apologized, saying 9/11 should “never, ever” be commercialized.',
      lesson: 'Two words of tribute plus one product shot equals an ad. On 9/11, the product stays out of frame.',
      feature: 'Sensitive days',
      replay: { dueAt: '2013-09-11T14:00:00', headlines: [] },
      sources: [{ label: 'CNN Money', url: 'https://money.cnn.com/2013/09/11/technology/social/att-9-11-tweet/index.html' }, { label: 'The Next Web', url: 'https://thenextweb.com/news/att-ceo-apologizes-for-911-photo-on-twitter-it-is-a-day-that-should-never-be-commercialized' }],
    },
    {
      id: 'epicurious',
      brand: 'Epicurious',
      date: 'April 16, 2013',
      channel: 'Tweet',
      post: 'In honor of Boston and New England, may we suggest: whole-grain cranberry scones!',
      context: 'The morning after the Boston Marathon bombing, about 30 minutes after the account had posted condolences.',
      outcome: 'Deleted. The first apology was pasted to person after person and said the tweets “seemed” insensitive, which made it worse. A second one finally owned it.',
      lesson: 'Condolences and content don’t mix in the same day. And an apology you paste over and over isn’t an apology.',
      feature: 'Breaking news',
      replay: { headlines: [{ id: 'h', kind: 'news', title: 'Two bombs explode at Boston Marathon finish line, killing 3' }] },
      sources: [{ label: 'CBS News', url: 'https://www.cbsnews.com/news/epicurious-apologizes-for-insensitive-boston-tweet' }, { label: 'Throughline', url: 'https://www.throughlinegroup.com/2013/04/22/can-ignoring-a-social-media-disaster-make-it-go-away/' }],
    },
  ];

  // Run a case through the real rules engine.
  function replay(c, R, Cal) {
    const r = R.checkPost({ id: c.id, text: c.post, dueAt: c.replay.dueAt }, c.replay.headlines || [], { calendar: Cal });
    return r;
  }

  const api = { CASES, replay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TooSoonCases = api;
})(typeof window !== 'undefined' ? window : globalThis);
