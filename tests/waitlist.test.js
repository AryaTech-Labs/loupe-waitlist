import { describe, expect, it, vi } from "vitest";
import {
  buildRow,
  COLLECTS_MAX,
  failureMessage,
  isValidEmail,
  joinWaitlist,
  MESSAGES,
  normalizeEmail,
  validate,
} from "../src/waitlist.js";

const opts = (fetchImpl) => ({ supabaseUrl: "https://ref.supabase.co", anonKey: "anon-key", fetchImpl });
const reply = (status) => vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Collector@Example.COM ")).toBe("collector@example.com");
  });
  it("treats a missing value as empty", () => {
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });
  it.each(["", "plain", "a@b", "a@.com", "a b@c.com", "a@b..com", `${"a".repeat(250)}@b.com`])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("buildRow", () => {
  it("sends null for an empty collects", () => {
    expect(buildRow({ email: "A@B.co", collects: "   " })).toEqual({ email: "a@b.co", collects: null });
  });
  it("trims collects and folds whitespace", () => {
    expect(buildRow({ email: "a@b.co", collects: "  Divers,\n\n vintage  Omega " }).collects).toBe("Divers, vintage Omega");
  });
});

describe("validate", () => {
  it("passes a good row", () => {
    expect(validate({ email: "a@b.co", collects: null })).toBeNull();
  });
  it("flags the email field", () => {
    expect(validate({ email: "nope", collects: null })).toEqual({ field: "email", message: MESSAGES.invalidEmail });
  });
  it("flags an overlong collects", () => {
    expect(validate({ email: "a@b.co", collects: "x".repeat(COLLECTS_MAX + 1) })?.field).toBe("collects");
  });
});

describe("joinWaitlist", () => {
  const row = { email: "a@b.co", collects: "Divers" };

  it("inserts with the anon key and asks for no row back", async () => {
    const fetchImpl = reply(201);
    await expect(joinWaitlist(row, opts(fetchImpl))).resolves.toEqual({ status: "joined" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://ref.supabase.co/rest/v1/waitlist");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "anon-key",
      Authorization: "Bearer anon-key",
      Prefer: "return=minimal",
    });
    expect(JSON.parse(init.body)).toEqual(row);
  });

  it("treats an email already on the list (409) as joined, and says so", async () => {
    await expect(joinWaitlist(row, opts(reply(409)))).resolves.toEqual({ status: "joined", alreadyJoined: true });
  });

  it.each([400, 401, 403, 404, 500])("fails on %i", async (status) => {
    await expect(joinWaitlist(row, opts(reply(status)))).resolves.toEqual({ status: "failed", code: status });
  });

  it("fails, without throwing, when the network does", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(joinWaitlist(row, opts(fetchImpl))).resolves.toEqual({ status: "failed", code: 0 });
  });

  // LOU-102 4.1: a stalled connection (captive portal, a dropped mobile
  // link) must not leave the button on "Joining…" for a minute or more.
  it("gives up on a request that never answers, and aborts it", async () => {
    let signal;
    const fetchImpl = vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {}); // never settles
    });
    await expect(joinWaitlist(row, { ...opts(fetchImpl), timeoutMs: 20 })).resolves.toEqual({
      status: "failed",
      code: 0,
      timedOut: true,
    });
    expect(signal.aborted).toBe(true);
  });

  it("waits 10 seconds by default", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const result = joinWaitlist(row, opts(fetchImpl));
    let settled = false;
    result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(9_900);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});

describe("failureMessage (LOU-102 4.1)", () => {
  it("offline says so", () => {
    expect(failureMessage(null, { online: false })).toBe(MESSAGES.offline);
    expect(failureMessage({ status: "failed", code: 0 }, { online: false })).toBe(MESSAGES.offline);
  });
  it("a request that timed out says it's taking too long", () => {
    expect(failureMessage({ status: "failed", code: 0, timedOut: true })).toBe(MESSAGES.slow);
  });
  it("a server error or no answer is the plain failure (trying again can work)", () => {
    expect(failureMessage({ status: "failed", code: 0 })).toBe(MESSAGES.failed);
    expect(failureMessage({ status: "failed", code: 500 })).toBe(MESSAGES.failed);
    expect(failureMessage({ status: "failed", code: 503 })).toBe(MESSAGES.failed);
  });
});

// LOU-102 4.3: a 4xx is not "try again" — retrying the same thing can't work.
describe("failureMessage for a refused sign-up", () => {
  it("400 / 422: the address was refused (a server check), so check it", () => {
    expect(failureMessage({ status: "failed", code: 400 })).toBe(MESSAGES.refused);
    expect(failureMessage({ status: "failed", code: 422 })).toBe(MESSAGES.refused);
  });
  it("401 / 403 / 404: our side isn't taking sign-ups right now", () => {
    for (const code of [401, 403, 404]) expect(failureMessage({ status: "failed", code })).toBe(MESSAGES.unavailable);
  });
  it("429: wait, then try again", () => {
    expect(failureMessage({ status: "failed", code: 429 })).toBe(MESSAGES.rateLimited);
  });
  it("the messages are distinct", () => {
    const all = [MESSAGES.failed, MESSAGES.refused, MESSAGES.unavailable, MESSAGES.rateLimited, MESSAGES.offline, MESSAGES.slow];
    expect(new Set(all).size).toBe(all.length);
    for (const message of all) expect(message).toBeTruthy();
  });
});
