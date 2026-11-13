# Too Soon?

> 📖 **The full story, with animations:** [`/story.html`](https://project-too-soon.netlify.app/story.html) covers why it exists, how Sign in with Buffer was reused from PostIQ, the Buffer GraphQL calls, the free news sources, the rules engine, the AI second opinion and the taste pass.


Checks your Buffer queue against today's news, before your post becomes the news.
A Nobody Creative app, built for Buffer Commit 2026.

## What it does
- **Left column, "What's happening":** top US headlines (Google News RSS), active Severe/Extreme alerts (National Weather Service), plus searches for your watchlist words.
- **Right column, "Your queue":** every scheduled post gets a verdict stamp (Too soon / Give it a look / You're good) with a plain-English reason that links to the headline that triggered it.
- **Rules (free, instant, in the browser):** names in heavy news, wording that echoes a tragedy ("on fire" next to a fire downtown), places under active alerts, watchlist words, dates that will already have passed, and dead, sold-out, cancelled or ended links.
- **Second opinion (optional):** sends only flagged posts to Claude or Gemini for a verdict plus a suggested fix.
- **Demo mode:** `/app.html?demo`. A made-up coffee brand on a made-up news day, so judges always see catches.
- **Pull to drafts:** one tap (or "pull all") moves a flagged post out of the queue into Buffer drafts via `editPost` + `saveToDraft`, the same pattern PostIQ uses. It re-reads the post first and refuses if it's no longer scheduled. Never publishes or deletes.

## v0.3 additions
- **Onboarding "case file":** two real posts from July 20, 2012 (sources linked), replayed live through the rules engine. Shows on first visit; `?` reopens it; `?tour` forces it.
- **Push back a day:** reschedules a flagged post +24h (editPost `customScheduled`).
- **Copy for client:** a plain-English heads-up ready to paste.
- **Next 24h filter**, loading quips, "Checked Xm ago", auto re-check every 15 min (live), tab title + favicon show the verdict.
- **Location:** pick a state (NWS alerts incl. Moderate for that state) and a city (local Google News search). A severe local alert flags posts going out within 24h.

## v0.4 additions
- **Onboarding** now uses Hurricane Sandy (Oct 29, 2012): Gap's #Sandy shopping tweet and American Apparel's "SANDYSALE" email. Sources linked.
- **Rewrite in place:** edit a flagged post's text with a live re-check as you type; save to Buffer (`editPost` text) or save + pull to drafts.
- **New free sources** (`netlify/functions/_sources.js`, toggles in Settings): Wikipedia most-read + Wikidata death check (celebrity news), Google Trends daily RSS, USGS significant quakes, GDACS orange/red alerts, FDA food + CPSC product recalls.
- **Sensitive days** (`js/calendar.js`, no API): promos on solemn days (9/11, Pearl Harbor, Holocaust Remembrance, TDoR) are "Too soon"; promos on observances (MLK Day, Juneteenth, Memorial Day, Veterans Day) get a look; upbeat/party posts on solemn days get a look.
- `npm test` now also runs `tests/sources.test.js` (every source mocked).

## v0.5 additions
- **The Guide** (`guide.html`): 7 famous blunders (SpaghettiOs, Gap, American Apparel, DiGiorno, Cinnabon, AT&T, Epicurious), each replayed live through the rules, plus the crisis checklist, holding statements and a 30-day sensitive-days table. SpaghettiOs is featured on the landing page.
- **Auto-watchlist:** learns hashtags, handles and names from the queue and checks why each is in the news; tap a chip in Settings to mute it. Hashtags match headlines even without spaces (#WhyIStayed).
- **Brand mentions:** your org and channel names are searched; hits show as "Mentions you".
- **Go dark:** pull everything in the next 24h–7d to drafts, with a restore list and a banner. Opens holding statements right after.
- **Holding statements:** 5 templates with a live check (no promo, no leftover [brackets]); add to Buffer drafts on text-friendly channels via `createPost` + `saveToDraft`.
- **Slack/Discord alerts** (`netlify/functions/notify.js`, only Slack/Discord webhook hosts accepted): new "too soon" posts, optional daily summary on first check, Go dark notice, "Send summary".
- **Sensitivity dial** per organization: strict / normal / relaxed.
- **Tidy-ups:** character limits per network, leftover placeholders, broken @handles, too many hashtags, missing image alt text, same text on two channels within an hour, optional UTM check.
- **All clients:** every Buffer organization checked at once, sorted by risk.
- **Saves report:** every pull, push, rewrite and statement logged (in this browser) with a CSV export.

## v0.6
- **Landing hero is now the 23s reel** (`media/too-soon-reel.mp4`, poster `media/reel-poster.jpg`): muted autoplay loop that skips the tweet cold open and starts at the product; "Sound on" plays it from the top. Respects reduced motion.
- The animated cartoon moved to a "Two endings. You pick." section, with the other-ending toggle.
- Reel source lives in `too-soon-reel-source.zip` (canvas page + numpy score + render script).

## v0.7
- **Landing rebuilt:** 1080px max width, hero = text left + autoplaying muted reel right (no reduced-motion pause; plays when in view), four CSS-animated product mockups (reads the room, fix in one tap, AI second opinion, go dark), a "Where AI comes in" section, tighter case file / agency / FAQ. "Two endings" removed. `/app.html?connect` opens the connect dialog.
- **Demo walkthrough** (`js/tour.js`): 7-step spotlight tour after the onboarding, ending on "Connect Buffer"; "Take the tour" in More; a one-time "Nice save" nudge after the first fix in demo mode. Demo banner now has a Connect Buffer button.

## v0.8
- **AI is visible where you work:** every flagged post has **✨ Ask AI** (one-line reason, a fix, and a drafted rewrite with "Use this rewrite"); the rewrite editor has **✨ Suggest a rewrite**; "✨ Second opinion on all flagged" sits above the queue.
- **Bring your own key:** Settings → AI second opinion (Gemini or Claude). The key stays in the browser and is passed through `second-opinion` per request. A site-wide `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` in Netlify still takes priority.
- **One walkthrough:** the case-file onboarding is gone (the cases live in the Guide); the 7-step tour runs on the first demo visit, ends on Connect Buffer, and the **?** button replays it (works in live mode too).

## v0.9
- **All-clear screen.** When nothing is flagged: a "days without a possible incident" safety board with flip numbers and a record, proof of what was checked, the closest call, a calm mug, and a shareable PNG badge. A too-soon post resets the counter to 0. A sad trombone plays only when the cause is light (a dead link, a passed date); never when the news is tragic. The all-clear card never quotes tragic headlines or emergency alerts. The streak is kept per organization in this browser (`toosoon_streak`).
- **Shorter connect screen.** One button, three promises, API key tucked away. Demo posts clear the moment you connect, and a loading state shows until your real queue arrives.
- **Show demo posts** while connected (More menu), with a "Back to my queue" button. **Preview the all-clear screen** in demo, or open `/app.html?allclear`.
- **Share Too Soon?** in the More menu and on the all-clear screen (native share sheet, or copies the link).

- **Landing page product shots.** The flat mockups are replaced with real screenshots of the demo (in `images/product/`, WebP at 2x) on tinted, dotted stages with animated callouts that pop in on scroll, plus a new "Days without a possible incident" section with the share badge. To refresh them after UI changes, re-shoot the demo at 2x and keep the same file names.

## Files
| Path | What |
| --- | --- |
| `index.html` | Landing page |
| `app.html`, `js/app.js`, `css/app.css` | The two-column checker |
| `js/rules.js` | Rules engine (works in browser + Node) |
| `js/demo.js` | Demo queue and news day |
| `js/shared/` | Shared Buffer layer copied from PostIQ (connection + OAuth/PKCE) |
| `netlify/functions/buffer-proxy.js`, `buffer-token.js`, `_shared.js` | Shared Buffer layer functions (unchanged from PostIQ) |
| `netlify/functions/headlines.js` | News + alerts feed (calls `_sources.js`) |
| `netlify/functions/_sources.js` | Wikipedia/Wikidata, Google Trends, USGS, GDACS, FDA, CPSC |
| `js/calendar.js` | Sensitive-days calendar |
| `netlify/functions/check-page.js` | Link checker (blocks private IPs) |
| `netlify/functions/second-opinion.js` | Optional AI verdicts |

## Netlify environment variables
| Variable | Needed? | What it does |
| --- | --- | --- |
| `BUFFER_CLIENT_ID` | Yes, for Sign in with Buffer | The app client id from Buffer (Settings → API → App Clients). Served to the browser by `app-config` |
| `BUFFER_CLIENT_SECRET` | Only if Buffer gave the client a secret | Added server-side in `buffer-token`; never sent to the browser |
| `BUFFER_ALLOWED_ORIGINS` | Recommended | your site's own URL (e.g. `https://your-site.netlify.app`) so the Buffer proxy only answers your site |
| `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` | Optional | Turns on the AI second opinion |
Redeploy after changing environment variables.

## Buffer Commit checklist: turning on "Sign in with Buffer"
The OAuth + PKCE flow is already built (shared layer from PostIQ). It only needs a client id.
1. Deploy to Netlify first so you know the final URL (e.g. `https://toosoon.netlify.app`).
2. Register a new OAuth app in Buffer's developer settings, the same way you did for PostIQ:
   - Name: **Too Soon?** (this is what people see on Buffer's consent screen)
   - Type: public client with PKCE (no client secret)
   - Redirect URI: `https://<your-site>/auth/callback.html` (add `http://localhost:8888/auth/callback.html` too if you test with `netlify dev`)
   - Scopes: `posts:read posts:write account:read offline_access`
3. Add it in Netlify as the `BUFFER_CLIENT_ID` environment variable (or hard-code it in `js/config.js`), then redeploy.
4. Optional: set `BUFFER_ALLOWED_ORIGINS=https://<your-site>` in Netlify so the proxy only answers your site.
5. Test: Connect Buffer → Sign in with Buffer → approve → you land back on the app, live.

Once the client id is set, "Sign in with Buffer" becomes the main button and the API key moves under "Use a Buffer API key instead".

## Setup
1. Deploy to Netlify (no build step).
2. **Buffer sign-in:** register a Buffer OAuth app with redirect URI `https://<site>/auth/callback.html`, then put its public client id in `js/config.js` (`BUFFER_CLIENT_ID`). Scope includes `posts:write`, used only for pull-to-drafts. Until then, "paste an API key" works.
3. **Second opinion (optional):** set `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-haiku-5-5`) or `GEMINI_API_KEY` (optional `GEMINI_MODEL`). With neither set, the button only appears in demo mode.
4. Optional: `BUFFER_ALLOWED_ORIGINS` to lock the proxy to your domain.

## Test
`npm test` runs the rules engine against the demo queue.
