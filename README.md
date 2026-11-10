# Loupe — beta waitlist

The one-page teaser for the Loupe closed beta ([LOU-80](https://linear.app/arya-tech/issue/LOU-80/beta-waitlist-landing-page)). People leave an email, and optionally what they collect. Nothing else.

**Live:** https://loupeweb.com (custom domain on GitHub Pages; DNS at Squarespace). After the beta this domain moves to the Loupe web app.

This repo is temporary on purpose. When the beta waitlist closes, unpublish Pages (Settings → Pages) and archive or delete the repo; the main app (`AryaTech-Labs/loupe-web`) doesn't depend on it.

## How it works

- Plain HTML, CSS and JavaScript in `src/`. No framework and no build step; GitHub Pages serves `src/` as is.
- The form inserts one row into the Supabase `waitlist` table with the **anon key** (`src/config.js`). The anon key is public by design; Row Level Security limits it to INSERT on that table, and nobody can read the list from the browser. The request asks for no row back (`Prefer: return=minimal`).
- Emails are trimmed and lowercased. An email already on the list (HTTP 409) shows the same success, "You're on the list."
- A hidden field catches form-filling bots: if it's filled, the page shows success and sends nothing.
- No beta date anywhere in the copy; `npm run check` fails the build if one appears.
- The dial and the Côtes de Genève background are the app's Welcome artwork, vendored from loupe-web (`src/vendor/`). Colours, type (Geist, self-hosted) and spacing are the app's design tokens, light and dark.
- The dial is a live watch showing the visitor's own time: the device clock in its local time zone, read afresh at every beat, so it's right after sleep, a hidden tab or a time-zone change, and the day-date turns over at their midnight. As in the app, the tourbillon is the seconds: its cage turns once a minute, advancing eight beats a second like a 28,800 bph movement. Inside it the balance wheel swings four times a second (120° each way) and passes through rest on every beat, the instant the cage ticks, drawn every frame from a sub-millisecond copy of the device clock with one 60 Hz frame of motion blur. `src/dial.js` draws the still face once and keeps it, so a frame only redraws the tourbillon and hands (about 0.3 ms on a slow phone). Nothing is drawn while the tab is hidden or the dial is off screen. With Reduce Motion the balance is still and the dial is redrawn once at each new minute.
- The vendored `drawDial` is split into `drawDialFace` + `drawDialMovement` (same drawing; a browser test checks the two layers match it pixel for pixel).
- Pinch-zoom: the stripes are sized to the page's own width, not `innerWidth` (Safari shrinks that while zoomed), and `src/keyboard.js` ignores the visible area shrinking while zoomed, so zooming in and out never cuts the background short or adds keyboard room.
- `src/og-image.jpg` (link preview; JPEG because WhatsApp drops previews over ~300 KB) and `src/apple-touch-icon.png` (home-screen icon) are rendered from the same drawing code: `node scripts/render-images.mjs`.
- Fonts: the full Geist files live in `fonts/` (not published). `python scripts/subset-fonts.py` (needs `pip install fonttools brotli`) cuts them into `src/fonts/`: Geist Latin (preloaded), Geist for every other script (fetched only if someone types it) and Geist Mono for the day-date alone. 41 KB of type instead of 115 KB. The script prints the `unicode-range` values `styles.css` uses.
- The module scripts are `modulepreload`ed, so they download together rather than one import after another.
- Deploys stamp their version on the page's own scripts and stylesheet (`styles.css?v=…`, every relative import): `scripts/stamp-version.mjs`, run by CI on what it publishes. GitHub Pages lets browsers keep files for 10 minutes; this way a phone never pairs a new script with an old cached one.
- On phones the page is exactly one screen: no scrolling, no rubber-band bounce. The dial is the page's one flexible item: it takes whatever height is left once the words and form are in (up to 240px), so each phone shows it as large as fits. The page is sized to the screen with the browser's bars showing (svh), and the card keeps its height after joining, so the dial never changes size as bars move, the keyboard opens, an error shows or someone joins. Very short screens drop the description line. While the keyboard is up, `src/keyboard.js` makes room below the form and scrolls the field being typed in, plus the Join button, to just above the keyboard. The page glides there in one smooth move and glides back when the keyboard closes. The striped background is drawn once at a fixed height and is part of the page, so it moves with the form and never redraws when Safari's bars hide.
- A Content-Security-Policy allows only this site's own files plus the one Supabase origin.

## Develop

```sh
npm ci
npm run serve        # http://localhost:4173
npm run check        # anon key only, CSP matches config, no beta date
npm test             # unit tests (Vitest)
npx playwright install webkit chromium
npm run test:e2e     # iPhone (WebKit) + Android (Chromium) browser tests
```

The browser tests answer Supabase inside the browser, so they never write to the real waitlist. To run them against the live site instead of a local server:

```sh
SITE_URL=https://loupeweb.com/ npm run test:e2e
```

## Deploy

Every push to `main` runs CI. If the tests pass, the **Deploy to GitHub Pages** job publishes `src/`, then **Live check** runs the phone tests against the published site. Pull requests run the tests only.

**Custom domain:** add the domain under Settings → Pages, point DNS at GitHub Pages, then update the `og:image` URL in `src/index.html`.

## Rules

- Never put the service role key in `src/config.js`. CI rejects any key whose role isn't `anon`.
- The `waitlist` table, its RLS policy and any constraints belong to the server track (Hoover). This repo never changes the database.
