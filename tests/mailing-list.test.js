import { describe, expect, it } from "vitest";
import { addToMailingList, joinedBody, loopsFormBody } from "../src/waitlist.js";

const row = { email: "collector@example.com", collects: "Vintage divers" };
const options = { formUrl: "https://app.loops.so/api/newsletter-form/FORM", listId: "LIST" };
const reply = (status, body) => async () => new Response(body === undefined ? "" : JSON.stringify(body), { status });

describe("loopsFormBody", () => {
  it("sends the list, where they came from and what they collect", () => {
    expect(Object.fromEntries(loopsFormBody(row, "LIST"))).toEqual({
      email: "collector@example.com",
      source: "waitlist",
      userGroup: "Beta waitlist",
      mailingLists: "LIST",
      collects: "Vintage divers",
    });
  });

  it("leaves collects out when they didn't say", () => {
    expect(loopsFormBody({ email: "a@b.co", collects: null }, "LIST").has("collects")).toBe(false);
  });
});

describe("addToMailingList", () => {
  it("is true only when Loops says it took them", async () => {
    expect(await addToMailingList(row, { ...options, fetchImpl: reply(200, { success: true }) })).toBe(true);
    expect(await addToMailingList(row, { ...options, fetchImpl: reply(200, { success: false }) })).toBe(false);
    expect(await addToMailingList(row, { ...options, fetchImpl: reply(200, undefined) })).toBe(false);
  });

  it("is false on a refusal, a rate limit or a network failure, and never throws", async () => {
    expect(await addToMailingList(row, { ...options, fetchImpl: reply(400, { success: false }) })).toBe(false);
    expect(await addToMailingList(row, { ...options, fetchImpl: reply(429, { success: false }) })).toBe(false);
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await addToMailingList(row, { ...options, fetchImpl: offline })).toBe(false);
  });

  it("gives up on a Loops that doesn't answer", async () => {
    const never = (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    expect(await addToMailingList(row, { ...options, fetchImpl: never, timeoutMs: 20 })).toBe(false);
  });

  it("posts a form, as Loops' endpoint expects", async () => {
    let seen;
    const capture = async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    await addToMailingList(row, { ...options, fetchImpl: capture });
    expect(seen.url).toBe(options.formUrl);
    expect(seen.init.method).toBe("POST");
    expect(seen.init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(new URLSearchParams(seen.init.body).get("mailingLists")).toBe("LIST");
  });
});

// LOU-99: after the waitlist migration a repeat sign-up is answered 201, the
// same as a first one, and Loops says success to both but only welcomes the
// first. So the card never claims an email was sent (Hoover's ruling).
describe("joinedBody", () => {
  it("is true for a first sign-up and a repeat one: names the address, claims no email sent", () => {
    expect(joinedBody("a@b.co")).toBe("We'll email a@b.co when your invite is ready.");
    expect(joinedBody("a@b.co")).not.toMatch(/sent|welcome/i);
  });
});

describe("joinedBody for someone the server says is already on the list (409, LOU-102 4.2)", () => {
  it("says so, and promises no welcome email", () => {
    expect(joinedBody("a@b.co", true)).toBe("You'd already joined. We'll email a@b.co when your invite is ready.");
  });
});
