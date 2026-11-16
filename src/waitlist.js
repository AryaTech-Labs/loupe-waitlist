// The waitlist signup (LOU-80). One insert into Supabase `waitlist` with the
// anon key; the table is INSERT-only for anon (no SELECT), so the request asks
// for no row back. An email already on the list is a success, not an error.

export const EMAIL_MAX = 254;
export const COLLECTS_MAX = 280;

export const MESSAGES = {
  joined: "You're on the list.",
  invalidEmail: "Enter a valid email address.",
  collectsTooLong: `Keep it under ${COLLECTS_MAX} characters.`,
  failed: "Couldn't join the list. Please try again.",
  offline: "You're offline. Check your connection and try again.",
  slow: "This is taking too long. Check your connection and try again.",
  refused: "We couldn't add that address. Check it and try again.",
  unavailable: "Sign-ups are paused for a moment. Please try again later.",
  rateLimited: "Too many tries. Please wait a minute and try again.",
};

/**
 * What to tell someone whose sign-up didn't go through (LOU-102 4.1, 4.3),
 * by what they can do about it. PostgREST answers a refused CHECK with 400,
 * RLS or a bad key with 401/403, a missing table with 404; the gateway's
 * rate limit is 429. Only a 5xx or no answer is worth an immediate retry.
 */
export function failureMessage(result, { online = true } = {}) {
  if (!online) return MESSAGES.offline;
  if (result?.timedOut) return MESSAGES.slow;
  const code = result?.code ?? 0;
  if (code === 400 || code === 422) return MESSAGES.refused;
  if (code === 401 || code === 403 || code === 404) return MESSAGES.unavailable;
  if (code === 429) return MESSAGES.rateLimited;
  return MESSAGES.failed;
}

/** Trimmed and lowercased, so one person is one row however they type it. */
export function normalizeEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length > 0 && email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** The row as sent. An empty "What do you collect?" is null, not "". */
/**
 * The row to insert. `ref` (LOU-103) is added only once the `waitlist.ref`
 * column is live (REF_COLUMN_LIVE): PostgREST refuses an unknown column with
 * 400, which would break every sign-up.
 */
export function buildRow({ email, collects, ref = null }, { refLive = false } = {}) {
  const text = String(collects ?? "").trim().replace(/\s+/g, " ");
  const row = { email: normalizeEmail(email), collects: text.length > 0 ? text : null };
  if (refLive && ref) row.ref = ref;
  return row;
}

// Where a sign-up came from (LOU-103): `loupeweb.com/?ref=meta-teaser-nov`.
// Tags are meta-<ad>, ig-<post>, creator-<handle>, email-<send>: lowercase,
// a–z 0–9 and hyphens. Anything else is NULL, never an error.

export const REF_MAX = 64;
export const REF_STORAGE_KEY = "loupe.waitlist.ref";

/** A ref tag as stored: trimmed, lowercased, at most REF_MAX; null if malformed. */
export function normalizeRef(raw) {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(tag)) return null;
  return tag.slice(0, REF_MAX);
}

/**
 * The ref for this visit: the URL's `?ref=` when valid (kept for the session,
 * so a visitor who browses first still carries it), else the one kept earlier.
 * Storage can be missing or throw (private mode); then only the URL counts.
 */
export function currentRef(search, storage) {
  const fromUrl = normalizeRef(new URLSearchParams(search).get("ref"));
  if (fromUrl) {
    try {
      storage?.setItem(REF_STORAGE_KEY, fromUrl);
    } catch {
      // Not kept: this page still sends it.
    }
    return fromUrl;
  }
  try {
    return normalizeRef(storage?.getItem(REF_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

// Typo suggestions for the big mail providers ("Did you mean name@gmail.com?").
// Conservative on purpose: it only speaks up when it's sure, and it never
// blocks anyone; a second press of Join sends the address as typed.

/** The providers we correct towards: name.tld. */
const PROVIDERS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "comcast.net", "hotmail.co.uk", "yahoo.co.uk", "outlook.co.uk", "live.co.uk",
];

/** Real domains that look like slips of the above: never "corrected". */
const REAL = new Set([
  ...PROVIDERS,
  "ymail.com", "email.com", "mail.com", "rocketmail.com", "cloud.com", "gmx.de", "gmx.net", "gmx.at",
  "web.de", "pm.me", "proton.ch", "protonmail.ch", "hey.com", "fastmail.com", "zoho.com", "yandex.com",
  "tutanota.com", "att.net", "verizon.net", "sbcglobal.net", "cox.net", "charter.net", "earthlink.net",
  "optonline.net", "bellsouth.net", "comcast.com", "btinternet.com", "sky.com", "virginmedia.com",
  "hotmail.de", "hotmail.fr", "hotmail.it", "hotmail.es", "hotmail.ca", "yahoo.de", "yahoo.fr",
  "yahoo.es", "yahoo.it", "yahoo.ca", "yahoo.com.au", "yahoo.co.in", "yahoo.co.jp", "outlook.de",
  "outlook.fr", "outlook.es", "outlook.it", "live.ca", "live.fr", "live.de", "live.it", "live.nl",
  "aol.co.uk", "me.org", "mac.org",
]);

/** Slips of ".com" and ".net" (the providers named "only .com" also get ".co"). */
const COM_SLIPS = new Set(["con", "cmo", "comm", "om", "cm", "vom", "xom", "ocm", "cpm", "coom", "clm", "cim", "comn"]);
const NET_SLIPS = new Set(["ner", "nte", "nt", "met", "bet", "nett", "ney"]);
const ONLY_COM = new Set(["gmail", "googlemail", "icloud"]);

/** Edit distance where swapping two neighbouring letters counts as one (optimal string alignment). */
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function tldSlipOf(tld, providerTld, providerName) {
  if (providerTld === "com") return COM_SLIPS.has(tld) || (tld === "co" && ONLY_COM.has(providerName));
  if (providerTld === "net") return NET_SLIPS.has(tld);
  return false;
}

/**
 * The address the person most likely meant, or null. Names of five letters or
 * more allow one slip (two from eight letters: googlemail, protonmail); short
 * ones (me, mac, aol, msn, live, gmx) only a slip in ".com". A tie between
 * providers suggests nothing.
 */
export function suggestEmail(raw) {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (REAL.has(domain)) return null;
  const dot = domain.indexOf(".");
  if (dot < 1) return null;
  const name = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  let best = null;
  let bestScore = Infinity;
  let tied = false;
  for (const provider of PROVIDERS) {
    const providerDot = provider.indexOf(".");
    const providerName = provider.slice(0, providerDot);
    const providerTld = provider.slice(providerDot + 1);
    let nameDistance = 0;
    if (name !== providerName) {
      if (providerName.length < 5) continue;
      nameDistance = editDistance(name, providerName);
      if (nameDistance > (providerName.length >= 8 ? 2 : 1)) continue;
    }
    const sameTld = tld === providerTld;
    if (!sameTld && !tldSlipOf(tld, providerTld, providerName)) continue;
    const score = nameDistance + (sameTld ? 0 : 0.5);
    if (score < bestScore) {
      best = provider;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return best && !tied ? `${local}@${best}` : null;
}

/** What the card says once someone's on the list. It never says an email was
 * sent: Loops welcomes someone only the first time they're added, and after
 * the LOU-99 waitlist migration a repeat sign-up is answered 201 like a first
 * one, so the page can't tell them apart (Hoover's ruling: neutral wording).
 * The address is named so a typo shows. A 409 (before that migration) still
 * says they'd already joined. */
export function joinedBody(email, alreadyJoined = false) {
  const line = `We'll email ${email} when your invite is ready.`;
  return alreadyJoined ? `You'd already joined. ${line}` : line;
}

/** The Loops form post: the list, where they came from, and what they collect. */
export function loopsFormBody(row, listId) {
  const body = new URLSearchParams({ email: row.email, source: "waitlist", userGroup: "Beta waitlist", mailingLists: listId });
  if (row.collects) body.set("collects", row.collects);
  return body;
}

/**
 * Adds the person to the Loops mailing list, which sends the welcome email.
 * Resolves to true only when Loops says it took them; never throws, and gives
 * up after `timeoutMs` so a slow Loops never holds up joining.
 */
export async function addToMailingList(row, { formUrl, listId, fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(formUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loopsFormBody(row, listId).toString(),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return data?.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Checks the form before anything is sent; null when it can go. */
export function validate(row) {
  if (!isValidEmail(row.email)) return { field: "email", message: MESSAGES.invalidEmail };
  if (row.collects && row.collects.length > COLLECTS_MAX) {
    return { field: "collects", message: MESSAGES.collectsTooLong };
  }
  return null;
}

/**
 * Adds the row. Resolves to { status: "joined" } or { status: "failed" };
 * never throws. 409 (unique violation) is someone already on the list.
 * Gives up after `timeoutMs` (a stalled connection would otherwise leave the
 * button on "Joining…" for a minute or more), as { timedOut: true }.
 */
export async function joinWaitlist(row, { supabaseUrl, anonKey, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // A fetch that ignores the signal still can't hold the form past the timeout.
  const gaveUp = new Promise((resolve) => controller.signal.addEventListener("abort", () => resolve(null)));
  try {
    const response = await Promise.race([
      fetchImpl(`${supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          // Anon can't read the table, so ask for nothing back.
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
        signal: controller.signal,
      }),
      gaveUp,
    ]);
    if (!response) return { status: "failed", code: 0, timedOut: true };
    if (response.status === 409) return { status: "joined", alreadyJoined: true };
    if (response.ok) return { status: "joined" };
    return { status: "failed", code: response.status };
  } catch {
    return timedOut ? { status: "failed", code: 0, timedOut: true } : { status: "failed", code: 0 };
  } finally {
    clearTimeout(timer);
  }
}
