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
- The dial is a live watch showing the visitor's own time: the device clock in its local time zone, read afresh every frame, so it's right after sleep, a hidden tab or a time-zone change. `src/dial.js` adds a red seconds hand that beats eight times a second (28,800 bph) and sweeps up from 12 on load; it draws only on a beat, and not at all while the tab is hidden or the dial is off screen. With Reduce Motion there's no seconds hand and the face is redrawn once at each new minute.
- `src/og-image.png` (link preview) and `src/apple-touch-icon.png` (home-screen icon) are rendered from the same drawing code: `node scripts/render-images.mjs`.
- On phones the page is exactly one screen: no scrolling, no rubber-band bounce. The dial scales with the screen's height, and very short screens drop the description line. While the keyboard is up, `src/keyboard.js` makes room below the form and scrolls the field being typed in, plus the Join button, to just above the keyboard. The page glides there in one smooth move and glides back when the keyboard closes. The striped background is drawn once at a fixed height and is part of the page, so it moves with the form and never redraws when Safari's bars hide.
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
