# Waitlist email: welcome, beta-live and update emails

Date: 2026-11-10 · Owner: Jacob (product, email content) · Web track: Claude · Server: Hoover · Linear: LOU-80 follow-up

## Intent

Someone joins the Loupe beta waitlist on loupeweb.com. Right away they get a welcome
email thanking them, telling them a little about Loupe, and a short note from the team.
When the beta goes live, everyone on the list gets an email with a button that takes
them straight to the download (TestFlight for the iPhone beta, or whatever channel is
chosen then). After that, the same list hears about things that matter, such as the
official launch.

Jacob writes every email himself. The tools must let him write, preview and send
without a developer, and the whole thing should cost nothing until the list is large.

## Goals

- A welcome email arrives within a minute of joining, automatically, for every new
  signup.
- Jacob can write and send a one-off email to the whole list (beta live, launch,
  updates) from a dashboard, with a preview and a test send first.
- Mail lands in the inbox, not spam: the sending domain is authenticated (SPF, DKIM,
  DMARC) and bad addresses are dropped automatically.
- Typos in common email domains are caught on the form before the signup is sent.
- Free to run at beta scale.

## Non-goals

- No click-to-confirm ("double opt-in") step. Decided: the welcome email is the check,
  and bounces remove bad addresses.
- No custom admin dashboard or broadcast tool of our own. The email platform's
  dashboard is the admin.
- No email from the apps themselves, and nothing about account email (Supabase Auth
  keeps sending its own sign-in and reset mail).
- No change to how the waitlist page writes to Supabase.

## Anti-goals (would make this a failure even if it works)

- Hurting Arya Tech's everyday email. arya-tech.net is the company's working domain;
  a spam-complaint or bounce problem on Loupe mail must not spill onto it.
- Anything that loses signups: the form must never fail or slow down because the email
  side is down. Supabase stays the record of who joined.
- Promising an email on the page before the welcome email actually sends.
- Any secret (the platform's API key) in the browser, the repo, Linear or chat.

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| Sender | **From: `Loupe <hello@loupe.arya-tech.net>`**, Reply-To `loupe@arya-tech.net` | Arya Tech matches the App Store/TestFlight developer and won't change; loupeweb.com suggests a separate "web" product and may move. The `loupe.` subdomain keeps Loupe's sending reputation apart from everyday company mail on arya-tech.net. Jacob chose this (2026-11-10). |
| Fine print | "We'll email you about the Loupe beta and launch. Unsubscribe anytime." + link to the Loupe privacy policy. Built as "Beta and launch news only. Unsubscribe anytime." with the Privacy link in the footer, because the longer line wraps on phones and would shrink the dial (Jacob to confirm) | Matches what the list will receive. People who joined under the old line ("only about the Loupe beta") get beta emails and the launch email, each with unsubscribe. Jacob chose this (2026-11-10). |
| `loupe@` | A Google Group in the arya-tech.net Workspace that delivers to Jacob (and Hoover), open to replies from anyone outside | Free (no paid seat); beta testers' replies reach people. |
| Verification | Typo suggestions on the form, plus automatic removal of addresses that bounce or complain | No confirm step losing 20–40% of ad signups. Jacob agreed. |
| Email platform | **Loops** (loops.so), free plan | Built for exactly this: contacts, an automation that sends when a contact is added, one-off campaigns, a visual editor Jacob can use, unsubscribe and bounce handling built in. Free: unlimited contacts, 4,000 sends per rolling 30 days to the first 1,000 contacts, a small Loops footer. Next tier $49/month. Alternatives rejected: Resend (free automated sends capped at 100/day, too low for an ad-driven signup day), Brevo (300/day: a beta-live email to 2,000 people would take a week), MailerLite (free tier cut to 250 subscribers in 2026). |
| Source of truth | Supabase `waitlist` stays the record of signups; Loops holds the mailing list and its subscribe/unsubscribe state | Signups never depend on the email side. |
| How signups reach Loops | Server side: a scheduled sync (every minute) adds new `waitlist` rows to Loops and marks them synced | API key stays server-side; the page doesn't change; failures never touch the form and are retried on the next run (Supabase database webhooks don't retry, so a webhook alone would silently lose welcomes). The same job does the backfill. Server work is Hoover's (web track never deploys functions or migrations). |

## How it works

```
loupeweb.com form ──insert──▶ Supabase waitlist (unchanged)
                                   │ INSERT webhook
                                   ▼
                       edge function waitlist-to-loops (Hoover)
                                   │ Loops API: create contact
                                   ▼
                     Loops contact (email, collects, source "waitlist")
                                   │ "contact added" automation
                                   ▼
                         Welcome email from loupe@arya-tech.net
Later: Jacob sends campaigns (beta live, launch, updates) to the list in Loops.
```

### 1. The form (web, this repo)

- **Typo suggestion.** When the email's domain is one edit away (or a known misspelling)
  from a common provider — gmail.com, googlemail.com, outlook.com, hotmail.com, live.com,
  msn.com, yahoo.com, icloud.com, me.com, mac.com, aol.com, proton.me, protonmail.com,
  gmx.com, comcast.net, and the matching country variants like hotmail.co.uk, yahoo.co.uk —
  or the top-level domain is a common slip (`.con`, `.cmo`, `.comm`, `.om`, `.cm`,
  `.co` for a provider that only uses `.com`), the page shows **"Did you mean
  name@gmail.com?"** under the field with a one-tap fix. The first press of Join with an
  uncorrected suggestion shows the hint instead of sending; a second press sends the
  address as typed (people do have unusual domains). Pure function in `src/waitlist.js`,
  unit-tested; no network.
- **After joining**, today the card says "You're on the list. We'll email you when your
  invite is ready." Once the welcome email is live (a flag in `src/config.js`, flipped
  when the server side ships), the body becomes "We've sent a welcome email to
  name@gmail.com." Until then the copy stays as it is.
- No change to the Supabase insert, the CSP or the page's look, apart from the fine
  print under the form (see "Open with Jacob").

### 2. Server (Hoover, filed as a `Server` issue)

- **Schema:** one nullable column `waitlist.loops_synced_at timestamptz`, plus a partial
  index on rows where it is null. Not readable or writable by anon (the page's grant stays
  INSERT of `email, collects` only).
- **Edge function `waitlist-to-loops`**, run every minute by `pg_cron` (via `pg_net`, with
  the service role) and safe to run by hand. Each run takes up to **50** unsynced rows,
  oldest first, and for each calls Loops "create contact" with: `email`,
  `source: "waitlist"`, the custom property `collects` (may be null),
  `subscribed: true`, and `mailingLists: { <Beta waitlist list id>: true }` (setting a
  user group does not put a contact on a list; the list id comes from the Loops
  dashboard). On success, or on Loops answering that the contact already exists, it sets
  `loops_synced_at = now()`. Anything else leaves the row for the next run and is logged.
  - The 50-per-minute cap keeps a burst of fake signups from turning into a burst of
    mail (see Abuse below) while still welcoming 3,000 real people an hour.
- Secret `LOOPS_API_KEY` in the project's function secrets. Hoover creates the key
  himself inside Loops (Jacob invites him to the Loops team), so the key never passes
  through anyone else.
- `[functions.waitlist-to-loops]` block in `supabase/config.toml` before the first deploy
  (iOS repo rule).
- **Backfill is automatic:** existing rows start with `loops_synced_at` null, so the job
  adds them over its first runs, through the API, which fires the welcome automation. So
  early signups get the same welcome (Claude's call; Jacob can say otherwise). A CSV import
  is not used: it doesn't fire automations.
- Supabase keeps signups; Loops keeps mailing state (subscribed, unsubscribed, bounced).

### Abuse (fake signups)

Anyone with the public key can insert rows directly, and there is no confirm step. What
limits harm, without changing the page or its CSP (Claude's call, accepted risk for the
beta):

- one welcome email per address, ever (the table's unique email + Loops' own dedupe), so
  nobody's inbox can be flooded;
- at most 50 new contacts a minute leave Supabase;
- Loops suppresses addresses that bounce or complain;
- Loupe mail's domain reputation is kept apart from everyday company mail (see the sender
  decision).

If abuse shows up (a burst of junk rows, a rising bounce rate in Loops), the next step is a
Cloudflare Turnstile check on the form with the insert moved behind an edge function —
noted, not built now.

### 3. Sending domain and inboxes (Jacob's accounts, set up with Claude in Jacob's browser session)

- **Google Workspace (arya-tech.net):**
  - Create the `loupe@arya-tech.net` group: members Jacob and Hoover; anyone on the web
    can post (so replies arrive); conversation history on.
  - Turn on DKIM signing for Gmail (Admin › Apps › Google Workspace › Gmail ›
    Authenticate email): generate a 2048-bit key, publish its TXT record, then start
    authentication.
  - Add the missing SPF record for the root: `v=spf1 include:_spf.google.com ~all`
    (arya-tech.net has none today, and no DKIM — so everyday Arya Tech mail is
    unauthenticated now; this fixes that too). `~all` (soft fail) with DMARC at
    `p=none` means any other service that sends as @arya-tech.net is flagged, never
    rejected, so this can't break anything; such senders get added to SPF as found.
  - Done 2026-11-10: the `loupe@` group exists (Jacob owner, Hoover member, outside
    replies allowed), and Google's DKIM key is generated (selector `google`), waiting
    for its DNS record.
  - DMARC already exists (`p=none`); leave it while Loops warms up. Tightening it later
    is noted, not part of this work.
- **Loops:** Jacob creates the account (only he can). Then: add the sending domain
  `arya-tech.net` and publish the records Loops gives (they sit on Loops' own
  subdomains/selectors and don't touch Google's records); set the default sender to
  `Loupe <loupe@arya-tech.net>`, reply-to the same; add the contact property `collects`;
  create the "Beta waitlist" mailing list; create the welcome automation (trigger:
  contact added with source "waitlist") with a placeholder email for Jacob to write.
- **DNS** for arya-tech.net is on Squarespace (same account as loupeweb.com). Jacob
  completes Squarespace's "Verify to continue" sign-in; Claude adds the records.

### 4. Emails (Jacob writes them)

- **Welcome** (automatic): thanks, a little about Loupe, a short note.
- **Beta is live** (campaign): a button to the TestFlight public link (or the chosen
  channel). The form doesn't ask what phone people use, and won't: the email gives the
  TestFlight button for iPhone and a second link to Loupe on the web for everyone else
  (Claude's call).
- **Updates** (campaigns): launch and other news.
- Every email carries Loops' unsubscribe link and the company's mailing address in the
  footer (required for marketing email). Jacob supplies the address.

## Constraints

- Web track never deploys edge functions, webhooks or migrations: those go to Hoover via
  a `Server` issue (Loupe Web project, `Web` + `Server` labels).
- Claude never types passwords, creates accounts or handles API keys: Jacob signs in,
  creates the Loops account and invites Hoover; Hoover makes and stores the key.
- Free tier limits: 1,000 contacts get email; 4,000 sends per rolling 30 days. If the
  list passes ~900, decide whether to upgrade ($49/month) before the beta-live send.
- Supabase's own Auth email is untouched.

## Open with Jacob

1. **Sending address: root domain or a Loupe subdomain?** Mailbox providers judge the
   domain in the From line, so a bounce or complaint problem on `loupe@arya-tech.net`
   counts against arya-tech.net itself. Recommended: send as
   `Loupe <hello@loupe.arya-tech.net>`, replies to `loupe@arya-tech.net`. That isolates
   Loupe's reputation, still reads as "Loupe, by Arya Tech", and moves cleanly if Loupe
   gets its own domain later.
2. **What signups agree to.** The form says "We'll only email you about the Loupe beta",
   but the plan includes launch and update emails. Recommended fine print: "We'll email
   you about the Loupe beta and launch. Unsubscribe anytime." with a link to the Loupe
   privacy policy (`https://jacob-gonsalves.github.io/loupe/privacy-policy`, the one the
   App Store listing uses). People who joined under the old line get beta emails and the
   launch email (each with unsubscribe), nothing more frequent.

## Left to the builder

- The exact typo list and matching rule (as long as it is conservative: suggest only
  when confident, never block).
- Wording and styling of the "Did you mean" hint, within the page's design tokens.
- Edge-function internals (retries, logging) — Hoover's.
- Whether the welcome-email flag lives in `config.js` or alongside the messages.

## Verification

- Unit tests for the typo suggestions (common slips caught, real domains untouched).
- Browser tests: the hint appears, the fix applies, a second press sends as typed.
- DNS: SPF, Google DKIM and Loops' records resolve; Google shows "Authenticating email";
  Loops shows the domain verified.
- End to end once the server side ships: a signup on loupeweb.com with a test address
  produces a Loops contact and a welcome email in the inbox (not spam), with SPF, DKIM
  and DMARC passing in the message headers.
