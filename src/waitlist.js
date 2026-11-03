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
};

/** Trimmed and lowercased, so one person is one row however they type it. */
export function normalizeEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length > 0 && email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** The row as sent. An empty "What do you collect?" is null, not "". */
export function buildRow({ email, collects }) {
  const text = String(collects ?? "").trim().replace(/\s+/g, " ");
  return { email: normalizeEmail(email), collects: text.length > 0 ? text : null };
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
 */
export async function joinWaitlist(row, { supabaseUrl, anonKey, fetchImpl = globalThis.fetch }) {
  try {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        // Anon can't read the table, so ask for nothing back.
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (response.ok || response.status === 409) return { status: "joined" };
    return { status: "failed", code: response.status };
  } catch {
    return { status: "failed", code: 0 };
  }
}
