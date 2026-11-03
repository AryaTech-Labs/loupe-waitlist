import { describe, expect, it, vi } from "vitest";
import { buildRow, COLLECTS_MAX, isValidEmail, joinWaitlist, MESSAGES, normalizeEmail, validate } from "../src/waitlist.js";

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

  it("treats an email already on the list (409) as joined", async () => {
    await expect(joinWaitlist(row, opts(reply(409)))).resolves.toEqual({ status: "joined" });
  });

  it.each([400, 401, 403, 404, 500])("fails on %i", async (status) => {
    await expect(joinWaitlist(row, opts(reply(status)))).resolves.toEqual({ status: "failed", code: status });
  });

  it("fails, without throwing, when the network does", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(joinWaitlist(row, opts(fetchImpl))).resolves.toEqual({ status: "failed", code: 0 });
  });
});
