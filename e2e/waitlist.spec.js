import { expect, test } from "@playwright/test";

// Supabase is answered in the browser: no test writes to the real waitlist.
// Every request the page makes to Supabase is recorded so a test can assert
// what was (and wasn't) sent.

const SUPABASE = "https://dxrmrfaptbhzyegbbmnz.supabase.co";
const LOOPS = "https://app.loops.so";

/** Answers Loops' form endpoint in the browser and records what was sent. */
async function answerLoops(page, status = 200, body = { success: true }) {
  const requests = [];
  await page.route(`${LOOPS}/**`, async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), body: request.postData(), headers: request.headers() });
    if (status === 0) return route.abort();
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return requests;
}

async function answerInsert(page, status) {
  const requests = [];
  await page.route(`${SUPABASE}/**`, async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url(), body: request.postData(), headers: request.headers() });
    await route.fulfill({ status, contentType: "application/json", body: status === 201 ? "" : JSON.stringify({ code: String(status) }) });
  });
  return requests;
}

const byTestId = (page, id) => page.locator(`[data-testid="${id}"]`);

// Requests that reached for the real Supabase because a test forgot to answer
// them. They're aborted, and the test fails in afterEach.
let unanswered = [];

test.beforeEach(async ({ page }) => {
  unanswered = [];
  page.on("pageerror", (error) => {
    throw error;
  });
  // Supabase is refused unless a test answers it (answerInsert registers later,
  // and Playwright runs the latest matching route first). The suite also runs
  // against the live site, where a real insert would put a row on the list
  // and the waitlist-to-loops sync would email it.
  await page.route(`${SUPABASE}/**`, (route) => {
    unanswered.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
  // Loops is answered in the browser too (a test can override this): no test,
  // here or against the live site, adds a real contact or sends a real email.
  await answerLoops(page);
});

test.afterEach(() => {
  expect(unanswered, "requests to the real Supabase: answer them with answerInsert").toEqual([]);
});

test("the phone layout: dial, wordmark, form, nothing wider than the screen", async ({ page }) => {
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Loupe");
  await expect(page.getByText("Any watch welcome. Every watch celebrated.")).toBeVisible();
  await expect(byTestId(page, "waitlist.dial")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel(/What do you collect\?/)).toBeVisible();
  // Someone arriving from an ad can join without scrolling.
  await expect(byTestId(page, "waitlist.submit")).toBeInViewport({ ratio: 1 });
  // The bot trap is never something a person can reach.
  await expect(page.locator('[data-testid="waitlist.trap"]')).not.toBeInViewport();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const control of [page.getByLabel("Email"), page.getByLabel(/What do you collect\?/), byTestId(page, "waitlist.submit")]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // The dial is drawn (not a blank canvas) and nothing broke the CSP.
  const inked = await byTestId(page, "waitlist.dial").evaluate((c) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  expect(inked).toBe(true);
  expect(problems).toEqual([]);
});

test("joining sends one insert, lowercased, and shows You're on the list", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").fill("  Collector@Example.com ");
  await page.getByLabel(/What do you collect\?/).fill("Vintage divers");
  await byTestId(page, "waitlist.submit").click();

  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  await expect(byTestId(page, "waitlist.joined")).toContainText("You're on the list.");
  await expect(byTestId(page, "waitlist.form")).toBeHidden();
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("POST");
  expect(requests[0].url).toBe(`${SUPABASE}/rest/v1/waitlist`);
  expect(requests[0].headers.prefer).toBe("return=minimal");
  expect(JSON.parse(requests[0].body)).toEqual({ email: "collector@example.com", collects: "Vintage divers" });
});

test("an email already on the list is a success, not an error", async ({ page }) => {
  await answerInsert(page, 409);
  await page.goto("./");
  await page.getByLabel("Email").fill("again@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  await expect(byTestId(page, "waitlist.error")).toBeHidden();
});

test("a server error keeps the form, says so, and lets them try again", async ({ page }) => {
  await answerInsert(page, 500);
  await page.goto("./");
  await page.getByLabel("Email").fill("someone@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.error")).toHaveText("Couldn't join the list. Please try again.");
  await expect(byTestId(page, "waitlist.submit")).toBeEnabled();
  await expect(byTestId(page, "waitlist.submit")).toHaveText("Join the waitlist");
  await expect(byTestId(page, "waitlist.joined")).toBeHidden();
});

test("a bad email is caught before anything is sent", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.error")).toHaveText("Enter a valid email address.");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email").fill("not-an-email");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.error")).toHaveText("Enter a valid email address.");
  expect(requests).toHaveLength(0);
});

test("a bot that fills the hidden field sees success and sends nothing", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  const loops = await answerLoops(page);
  await page.goto("./");
  await page.getByLabel("Email").fill("bot@example.com");
  await page.locator('[data-testid="waitlist.trap"]').fill("https://spam.example", { force: true });
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(requests).toHaveLength(0);
  expect(loops).toHaveLength(0);
});

// LOU-102 4.6: password managers and form-fill profiles fill fields by
// name and label (a "Website" field gets an identity's URL). A person whose
// manager filled the trap would get a fake success and never join. The trap
// carries nothing autofill recognises; bots still fill every field.
test("the bot trap has nothing a password manager would fill", async ({ page }) => {
  await page.goto("./");
  const trap = page.locator('[data-testid="waitlist.trap"]');
  const attrs = await trap.evaluate((el) => ({
    name: el.getAttribute("name"),
    id: el.id,
    label: el.labels?.[0]?.textContent ?? "",
    autocomplete: el.getAttribute("autocomplete"),
    tabindex: el.getAttribute("tabindex"),
  }));
  const autofillWords = /url|web|site|name|mail|company|org|address|phone|tel|city|zip|post|user|login/i;
  for (const value of [attrs.name, attrs.id, attrs.label]) expect(value).not.toMatch(autofillWords);
  expect(attrs.autocomplete).toBe("off");
  expect(attrs.tabindex).toBe("-1");
});

test("a likely typo gets a 'Did you mean' on the first Join, sends nothing, and moves nothing", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  const before = await dialSize(page);
  await page.getByLabel("Email").fill("name@gmial.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.suggestion")).toBeVisible();
  await expect(byTestId(page, "waitlist.suggestion")).toContainText("Did you mean");
  await expect(byTestId(page, "waitlist.suggestion.fix")).toHaveText("name@gmail.com");
  await expect(page.locator(".fineprint")).toBeHidden();
  expect(requests).toHaveLength(0);
  // It takes the fine print's place: same page, same dial, nothing to scroll.
  expect(await dialSize(page)).toEqual(before);
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
});

test("tapping the suggestion puts it in the field, and Join sends it", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").fill("Name@Hotmial.com");
  await page.getByLabel(/What do you collect\?/).click();
  // Leaving the field is enough to see it.
  await expect(byTestId(page, "waitlist.suggestion.fix")).toHaveText("name@hotmail.com");
  await byTestId(page, "waitlist.suggestion.fix").click();
  await expect(page.getByLabel("Email")).toHaveValue("name@hotmail.com");
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(byTestId(page, "waitlist.suggestion")).toBeHidden();
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0].body).email).toBe("name@hotmail.com");
});

test("a second Join sends the address as typed (some domains are just unusual)", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").fill("name@gmial.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.suggestion")).toBeVisible();
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0].body).email).toBe("name@gmial.com");
});

test("an ordinary address gets no suggestion", async ({ page }) => {
  const requests = await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").fill("collector@company.com");
  await page.getByLabel(/What do you collect\?/).click();
  await expect(byTestId(page, "waitlist.suggestion")).toBeHidden();
  await expect(page.locator(".fineprint")).toBeVisible();
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("the fine print says what we'll send, and Privacy is loupeweb.com's own page", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".fineprint")).toHaveText("Beta and launch news only. Unsubscribe anytime.");
  const privacy = page.getByRole("link", { name: "Privacy" });
  await expect(privacy).toHaveAttribute("href", "privacy/");
  await expect(privacy).not.toHaveAttribute("target", /.+/);
  // One line: it shares a 20px line with the error and the suggestion.
  expect(await page.locator(".fineprint").evaluate((p) => p.getBoundingClientRect().height)).toBeLessThanOrEqual(20);
});

test("after joining, the person goes to the Loops list and the card names the welcome email", async ({ page }) => {
  const inserts = await answerInsert(page, 201);
  const loops = await answerLoops(page);
  await page.goto("./");
  await page.getByLabel("Email").fill("  Collector@Example.com ");
  await page.getByLabel(/What do you collect\?/).fill("Vintage divers");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toContainText("We've sent a welcome email to collector@example.com.");
  expect(inserts).toHaveLength(1);
  expect(loops).toHaveLength(1);
  expect(loops[0].method).toBe("POST");
  expect(loops[0].url).toBe(`${LOOPS}/api/newsletter-form/cmwb6vqci006n0j0d9fl670vn`);
  expect(loops[0].headers["content-type"]).toBe("application/x-www-form-urlencoded");
  expect(Object.fromEntries(new URLSearchParams(loops[0].body))).toEqual({
    email: "collector@example.com",
    source: "waitlist",
    userGroup: "Beta waitlist",
    mailingLists: "cmwb7tp127bfc0jzggi1gb7kp",
    collects: "Vintage divers",
  });
});

// LOU-102 4.2: Loops sends the welcome when someone is added to the list —
// once. Someone already on it gets no new email, whatever Loops answers, so
// the card mustn't promise one.
test("someone already on the list isn't promised a welcome email", async ({ page }) => {
  await answerInsert(page, 409);
  await answerLoops(page, 200, { success: true });
  await page.goto("./");
  await page.getByLabel("Email").fill("again@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toContainText("You'd already joined. We'll email you when your invite is ready.");
  await expect(byTestId(page, "waitlist.joined")).not.toContainText("welcome email");
});

test("someone already on the list is still sent to Loops (it ignores repeats)", async ({ page }) => {
  await answerInsert(page, 409);
  const loops = await answerLoops(page);
  await page.goto("./");
  await page.getByLabel("Email").fill("again@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(loops).toHaveLength(1);
});

for (const [name, status, body] of [
  ["refuses", 400, { success: false, message: "Something went wrong" }],
  ["is rate-limited", 429, { success: false, message: "Too many signups" }],
  ["can't be reached", 0, null],
]) {
  test(`when Loops ${name}: still on the list, and no promise of an email`, async ({ page }) => {
    await answerInsert(page, 201);
    await answerLoops(page, status, body);
    await page.goto("./");
    await page.getByLabel("Email").fill("collector@example.com");
    await byTestId(page, "waitlist.submit").click();
    await expect(byTestId(page, "waitlist.joined")).toContainText("You're on the list.");
    await expect(byTestId(page, "waitlist.joined")).toContainText("We'll email you when your invite is ready.");
    await expect(byTestId(page, "waitlist.error")).toBeHidden();
  });
}

// LOU-102 4.5: a keyboard user can always see which field has focus —
// including in forced-colors mode (Windows High Contrast), which replaces
// author colours: there the old cue (a 1px border colour change) became
// black → very dark navy, practically invisible. A real ring (an outline
// of 2px or more, which forced colours keep in a system colour) is required.
for (const forcedColors of ["none", "active"]) {
  test(`the focused field gets a visible ring (forced colors: ${forcedColors})`, async ({ page, browserName }) => {
    test.skip(forcedColors === "active" && browserName !== "chromium", "forced-colors emulation is Chromium-only");
    await page.emulateMedia({ forcedColors, reducedMotion: "reduce" });
    await page.goto("./");
    for (const label of ["Email", /What do you collect\?/]) {
      const field = page.getByLabel(label);
      await field.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab"); // keyboard focus, so :focus-visible applies
      await expect(field).toBeFocused();
      const ring = await field.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
      expect(ring.style).not.toBe("none");
      expect(ring.width).toBeGreaterThanOrEqual(2);
    }
  });
}

// LOU-102 4.3: a refusal says what the person can do, not "try again".
for (const [status, message] of [
  [400, "We couldn't add that address. Check it and try again."],
  [403, "Sign-ups are paused for a moment. Please try again later."],
  [429, "Too many tries. Please wait a minute and try again."],
]) {
  test(`a ${status} from the server says what to do`, async ({ page }) => {
    await answerInsert(page, status);
    await page.goto("./");
    await page.getByLabel("Email").fill("someone@example.com");
    await byTestId(page, "waitlist.submit").click();
    await expect(byTestId(page, "waitlist.error")).toHaveText(message);
    await expect(byTestId(page, "waitlist.submit")).toBeEnabled();
  });
}

// LOU-102 4.1: a request that never answers (captive portal, dropped link)
// gives the form back with a message, instead of "Joining…" for a minute+.
test("a stalled sign-up gives the form back after 10 seconds", async ({ page }) => {
  await page.clock.install();
  await page.route(`${SUPABASE}/**`, () => {}); // never answers
  await page.goto("./");
  await page.getByLabel("Email").fill("someone@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.submit")).toBeDisabled();
  await page.clock.fastForward(10_500);
  await expect(byTestId(page, "waitlist.error")).toHaveText("This is taking too long. Check your connection and try again.");
  await expect(byTestId(page, "waitlist.submit")).toBeEnabled();
  await expect(byTestId(page, "waitlist.joined")).toBeHidden();
});

test("offline: says so, sends nothing, keeps the form", async ({ page, context }) => {
  const inserts = await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").fill("someone@example.com");
  await context.setOffline(true);
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.error")).toHaveText("You're offline. Check your connection and try again.");
  await expect(byTestId(page, "waitlist.submit")).toBeEnabled();
  expect(inserts).toHaveLength(0);
  await context.setOffline(false);
});

test("a Supabase failure never reaches Loops", async ({ page }) => {
  await answerInsert(page, 500);
  const loops = await answerLoops(page);
  await page.goto("./");
  await page.getByLabel("Email").fill("someone@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.error")).toBeVisible();
  expect(loops).toHaveLength(0);
});

test("with the welcome email switched off: no Loops call, the invite line", async ({ page }) => {
  await answerInsert(page, 201);
  const loops = await answerLoops(page);
  await page.route("**/config.js*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("WELCOME_EMAIL_LIVE = true", "WELCOME_EMAIL_LIVE = false");
    await route.fulfill({ response, body });
  });
  await page.goto("./");
  await page.getByLabel("Email").fill("collector@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toContainText("We'll email you when your invite is ready.");
  expect(loops).toHaveLength(0);
});

test("the copy never shows a beta date", async ({ page }) => {
  await page.goto("./");
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\b|\bQ[1-4]\b/);
});

// The page is exactly one screen on phones: nothing to scroll, nothing to drag.
// Visible areas with the browser's bars showing, small to large.
// `dial`: the least the dial gets there, since it takes all the spare height (up to
// 240). It was 66, 113, 126 and 143 when sized by 17svh. Room for a line of text
// that wraps on one system and not another (the SE's tagline does on Linux).
const SCREENS = [
  { name: "iPhone SE", width: 375, height: 548, dial: 96 },
  { name: "iPhone 14", width: 390, height: 664, dial: 140 },
  { name: "iPhone 15 Pro Max", width: 430, height: 740, dial: 210 },
  { name: "Pixel 7", width: 412, height: 839, dial: 240 },
];

const dialSize = (page) =>
  byTestId(page, "waitlist.dial").evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  });

for (const screen of SCREENS) {
  test(`fits one screen with nothing to scroll: ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("./");
    const fits = () => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
    expect(await fits()).toBeLessThanOrEqual(0);
    // The dial is as large as fits, round, and drawn sharp at that size.
    const dial = await dialSize(page);
    expect(dial.width).toBe(dial.height);
    expect(dial.height).toBeGreaterThanOrEqual(screen.dial);
    expect(dial.height).toBeLessThanOrEqual(240);
    await expect
      .poll(() => byTestId(page, "waitlist.dial").evaluate((c) => c.width / (c.getBoundingClientRect().width * devicePixelRatio)))
      .toBeCloseTo(1, 2);
    await expect(byTestId(page, "waitlist.submit")).toBeInViewport({ ratio: 1 });
    // No rubber-band bounce (where the browser supports turning it off; Safari 16+ and Chrome do).
    const overscroll = await page.evaluate(() =>
      CSS.supports("overscroll-behavior", "none") ? getComputedStyle(document.documentElement).overscrollBehaviorY : "none",
    );
    expect(overscroll).toBe("none");
    // An error takes the fine print's place, so it still fits and nothing moves.
    await byTestId(page, "waitlist.submit").click();
    await expect(byTestId(page, "waitlist.error")).toBeVisible();
    expect(await fits()).toBeLessThanOrEqual(0);
    expect(await dialSize(page)).toEqual(dial);
  });
}

test("the dial keeps its size with the keyboard up and after joining", async ({ page }) => {
  await fakeKeyboard(page);
  await answerInsert(page, 201);
  await page.goto("./");
  const before = await dialSize(page);
  await page.getByLabel("Email").click();
  await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD);
  await expect(page.locator(".page")).toHaveClass(/keyboard-open/);
  expect(await dialSize(page)).toEqual(before);
  await page.getByLabel("Email").fill("collector@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => window.__setKeyboard(0));
  await expect(page.locator(".page")).not.toHaveClass(/keyboard-open/);
  expect(await dialSize(page)).toEqual(before);
});

// Browsers in tests have no on-screen keyboard, so this stands one in: it
// shrinks visualViewport the way Safari and Chrome do when the keyboard opens.
async function fakeKeyboard(page) {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    let keyboard = 0;
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight - keyboard },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => 0 },
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
    window.__setKeyboard = (px) => {
      keyboard = px;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
}

const KEYBOARD = 336; // an iPhone keyboard with its suggestion bar

/** Where an element is against the part of the screen the keyboard leaves. */
const visible = (locator) =>
  locator.evaluate((el, keyboard) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight - keyboard;
  }, KEYBOARD);

test("with the keyboard up, the field being typed in and Join stay above it", async ({ page }) => {
  await fakeKeyboard(page);
  await page.goto("./");
  const email = page.getByLabel("Email");
  const collects = page.getByLabel(/What do you collect\?/);
  const submit = byTestId(page, "waitlist.submit");

  await email.click();
  await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD);
  await expect(page.locator(".page")).toHaveClass(/keyboard-open/);
  await expect.poll(() => visible(email)).toBe(true);
  await expect.poll(() => visible(submit)).toBe(true);
  await email.pressSequentially("collector@example.com");
  await expect.poll(() => visible(email)).toBe(true);

  // Moving to the next field keeps that one in view too.
  await collects.click();
  await expect.poll(() => visible(collects)).toBe(true);
  await expect.poll(() => visible(submit)).toBe(true);

  // Keyboard down: one screen again, back at the top.
  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => window.__setKeyboard(0));
  await expect(page.locator(".page")).not.toHaveClass(/keyboard-open/);
  await expect.poll(() => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("the background moves with the form as one piece and never redraws for a height change", async ({ page }) => {
  await fakeKeyboard(page);
  await page.goto("./");
  // Let the page's entrance (the hero and card rising into place) finish first.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const stripes = byTestId(page, "waitlist.stripes");
  // A fingerprint of the drawing: its size and a column of pixels.
  const fingerprint = () =>
    stripes.evaluate((c) => {
      const ctx = c.getContext("2d");
      const column = Array.from(ctx.getImageData(Math.floor(c.width / 2), 0, 1, Math.min(c.height, 600)).data);
      return `${c.width}x${c.height}:${column.join(",")}`;
    });
  // Where the stripes sit relative to the form; constant if they move together.
  const offset = () =>
    page.evaluate(
      () =>
        document.querySelector("[data-testid='waitlist.stripes']").getBoundingClientRect().top -
        document.querySelector("[data-testid='waitlist.form']").getBoundingClientRect().top,
    );
  await expect.poll(fingerprint).not.toMatch(/^0x0/);
  const before = await fingerprint();

  // Safari's bars hiding as the keyboard opens: the height changes, the width doesn't.
  const { width, height } = page.viewportSize();
  await page.setViewportSize({ width, height: height + 80 });
  await page.waitForTimeout(150);
  expect(await fingerprint()).toBe(before);

  // (A test browser's svh follows the window, so measure after the resize.)
  const together = await offset();
  await page.getByLabel("Email").click();
  await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await offset()).toBe(together);
  expect(await fingerprint()).toBe(before);
});

test("with the keyboard up, Join still submits", async ({ page }) => {
  await fakeKeyboard(page);
  await answerInsert(page, 201);
  await page.goto("./");
  await page.getByLabel("Email").click();
  await page.evaluate((px) => window.__setKeyboard(px), KEYBOARD);
  await page.getByLabel("Email").fill("collector@example.com");
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  test("takes the dark tokens", async ({ page }) => {
    await page.goto("./");
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(document.querySelector(".card")).backgroundColor,
    }));
    expect(colors).toEqual({ body: "rgb(16, 18, 22)", card: "rgb(24, 27, 33)" });
  });
});

test("the dial tells the device's time from the first frame, and the tourbillon beats", async ({ page }) => {
  await page.goto("./");
  const dial = byTestId(page, "waitlist.dial");
  // The drawn instant is the device clock's, on a beat. (A busy test machine
  // can hold a frame back, so poll for a fresh read.)
  const lag = () => dial.evaluate((c) => Date.now() - Number(c.dataset.time));
  await expect.poll(lag).toBeLessThan(250);
  expect(await lag()).toBeGreaterThanOrEqual(0);
  // It keeps going, beat by beat: every frame drawn is a beat 125 ms on from
  // the last, about eight a second, and no beat is drawn twice.
  const frames = await dial.evaluate(
    (c) =>
      new Promise((resolve) => {
        const drawn = [];
        const observer = new MutationObserver(() => drawn.push(Number(c.dataset.time)));
        observer.observe(c, { attributes: true, attributeFilter: ["data-time"] });
        setTimeout(() => {
          observer.disconnect();
          resolve(drawn);
        }, 2000);
      }),
  );
  expect(frames.length).toBeGreaterThanOrEqual(12);
  expect(frames.length).toBeLessThanOrEqual(17);
  for (let i = 0; i < frames.length; i++) {
    expect(frames[i] % 125).toBe(0);
    if (i > 0) expect(frames[i] - frames[i - 1]).toBeGreaterThanOrEqual(125);
  }
  // On an idle machine every beat is drawn; allow a busy one to drop a couple.
  const steps = frames.slice(1).map((t, i) => t - frames[i]);
  expect(steps.filter((s) => s === 125).length).toBeGreaterThanOrEqual(steps.length - 2);
});

test("the dial is the app's dial exactly: kept face plus moving parts, no extra hands", async ({ page }) => {
  await page.goto("./");
  // drawDial (the app's, whole) against the page's two layers, at one instant.
  const differing = await page.evaluate(async () => {
    const { drawDial, drawDialFace, drawDialMovement } = await import("./vendor/guilloche.js");
    const t = {
      background: "#101216", surface: "#181b21", elevated: "#22262e", hairline: "#22262e", primary: "#eceef2",
      secondary: "#98a0ae", accent: "#6fa3d9", error: "#f07a72", finishHighlight: "#33363c", finishShadow: "#08090b",
    };
    const fonts = { sans: "Geist", mono: "Geist Mono" };
    const at = new Date(2026, 10, 10, 10, 8, 31, 500);
    const make = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 480;
      const g = c.getContext("2d");
      g.setTransform(2, 0, 0, 2, 0, 0);
      return [c, g];
    };
    const [whole, w] = make();
    drawDial(w, 240, at, t, true, fonts);
    const [face, f] = make();
    drawDialFace(f, 240, at, t, true, fonts);
    const [layered, l] = make();
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.drawImage(face, 0, 0);
    l.setTransform(2, 0, 0, 2, 0, 0);
    drawDialMovement(l, 240, at, t);
    const a = w.getImageData(0, 0, 480, 480).data;
    const b = l.getImageData(0, 0, 480, 480).data;
    let off = 0;
    for (let i = 0; i < a.length; i += 4) {
      if ([0, 1, 2, 3].some((k) => Math.abs(a[i + k] - b[i + k]) > 2)) off++;
    }
    return off;
  });
  // Pixel for pixel, give or take a few antialiased edge pixels where an
  // engine rounds a composited layer differently (WebKit on Linux: 9 of
  // 230,400). A seconds hand alone would be about 550.
  expect(differing).toBeLessThanOrEqual(24);
});

test("pinch-zooming in and back out leaves the background covering the page", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const cover = () =>
    page.evaluate(() => {
      const r = document.querySelector("[data-testid='waitlist.stripes']").getBoundingClientRect();
      return {
        width: Math.round(r.width) >= document.documentElement.scrollWidth,
        height: Math.round(r.height) >= document.documentElement.scrollHeight,
        keyboardRoom: document.querySelector(".page").classList.contains("keyboard-open"),
      };
    });
  const covered = { width: true, height: true, keyboardRoom: false };
  await expect.poll(cover).toEqual(covered);
  // Safari on iPhone reports the zoomed-in area as innerWidth/innerHeight and
  // fires resize; the gesture's last report can land just short of full size.
  await page.evaluate(async () => {
    const real = { w: window.innerWidth, h: window.innerHeight };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const zoom of [1.5, 2, 3, 2, 1.5, 1.04]) {
      Object.defineProperty(window, "innerWidth", { configurable: true, get: () => Math.round(real.w / zoom) });
      Object.defineProperty(window, "innerHeight", { configurable: true, get: () => Math.round(real.h / zoom) });
      window.dispatchEvent(new Event("resize"));
      await wait(60);
    }
  });
  await page.waitForTimeout(200);
  expect(await cover()).toEqual(covered);
});

test("a real pinch-zoom isn't mistaken for the keyboard (Chrome)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "page scale is a Chrome DevTools control");
  await page.goto("./");
  const cdp = await page.context().newCDPSession(page);
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  const before = await height();
  for (const pageScaleFactor of [2, 3, 5]) await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.visualViewport.scale)).toBeGreaterThan(4);
  await expect(page.locator(".page")).not.toHaveClass(/keyboard-open/);
  expect(await height()).toBe(before);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await page.waitForTimeout(300);
  expect(await height()).toBe(before);
});

test("the dial follows the device's time zone", async ({ browser }) => {
  for (const timezoneId of ["America/Chicago", "Asia/Tokyo"]) {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    await page.goto("./");
    const hours = await page.evaluate(async () => {
      const { handAngles } = await import("./vendor/guilloche.js");
      const drawn = new Date(Number(document.querySelector("[data-testid='waitlist.dial']").dataset.time));
      return { local: drawn.getHours(), hourHand: handAngles(drawn).hour };
    });
    expect(Math.floor(hours.hourHand / 30)).toBe(hours.local % 12);
    await context.close();
  }
});

test.describe("with Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the dial holds still: one face a minute, no sweep", async ({ page }) => {
    await page.goto("./");
    const dial = byTestId(page, "waitlist.dial");
    const first = Number(await dial.evaluate((c) => c.dataset.time));
    await page.waitForTimeout(1200);
    const later = Number(await dial.evaluate((c) => c.dataset.time));
    expect(Date.now() - first).toBeLessThan(65_000);
    // Not redrawn within the same minute.
    if (Math.floor(first / 60_000) === Math.floor(Date.now() / 60_000)) expect(later).toBe(first);
  });
});

for (const [slug, heading] of [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["community-guidelines", "Community Guidelines"],
]) {
  test(`loupeweb.com/${slug}/ shows the ${heading}, with no script and nothing blocked`, async ({ page }) => {
    const problems = [];
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await page.goto(`./${slug}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator(`[data-testid="legal.${slug}"]`)).toContainText("Arya Tech Inc.");
    expect(await page.locator("script").count()).toBe(0);
    await expect(page.locator(".legal-nav").getByRole("link", { name: heading })).toHaveAttribute("aria-current", "page");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(problems).toEqual([]);
  });
}

test("the footer's Privacy link opens loupeweb.com/privacy/", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy Policy");
});

test("framed by another site, the page hides its form and offers to open Loupe", async ({ page }, testInfo) => {
  const site = new URL("./", testInfo.project.use.baseURL).href;
  const framing = `<!doctype html><iframe src="${site}" width="400" height="800"></iframe>`;
  const local = new URL(site);
  if (local.hostname === "localhost") {
    // Another real origin on this machine (127.0.0.1, not localhost): Chrome
    // only lets a local page frame localhost, and an https page can't frame http.
    // (A missing page: our real pages' Trusted Types would refuse the write.)
    local.hostname = "127.0.0.1";
    await page.goto(new URL("not-a-page", local).href);
    await page.setContent(framing);
  } else {
    // Against the live site: any other website framing https://loupeweb.com.
    await page.route("https://attacker.example/**", (route) => route.fulfill({ contentType: "text/html", body: framing }));
    await page.goto("https://attacker.example/");
  }
  const frame = page.frameLocator("iframe");
  await expect(frame.locator('[data-testid="waitlist.framed"]')).toBeVisible();
  await expect(frame.locator('[data-testid="waitlist.framed"]')).toHaveAttribute("target", "_top");
  await expect(frame.locator('[data-testid="waitlist.form"]')).toBeHidden();
});

test("not framed, the open-Loupe link never shows", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('[data-testid="waitlist.framed"]')).toHaveCount(0);
  await expect(byTestId(page, "waitlist.form")).toBeVisible();
});

// LOU-102 4.7 (audit claim checked): the dial writes its data-time stamp once
// per beat (8 a second), not once per frame — the write is guarded.
test("the dial's time stamp changes per beat, not per frame", async ({ page }) => {
  await page.goto("./");
  await expect(byTestId(page, "waitlist.dial")).toBeVisible();
  const { writes, frames } = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('[data-testid="waitlist.dial"]');
        let writes = 0;
        let frames = 0;
        new MutationObserver((list) => (writes += list.length)).observe(canvas, { attributeFilter: ["data-time"] });
        const tick = () => {
          frames += 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(() => resolve({ writes, frames }), 2000);
      }),
  );
  expect(writes).toBeGreaterThan(0); // the dial is running
  expect(writes).toBeLessThanOrEqual(2 * 8 + 2); // per beat
  expect(frames).toBeGreaterThan(writes * 2); // far fewer writes than frames
});
