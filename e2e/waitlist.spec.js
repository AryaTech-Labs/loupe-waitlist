import { expect, test } from "@playwright/test";

// Supabase is answered in the browser: no test writes to the real waitlist.
// Every request the page makes to Supabase is recorded so a test can assert
// what was (and wasn't) sent.

const SUPABASE = "https://dxrmrfaptbhzyegbbmnz.supabase.co";

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

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
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
  await expect(page.locator("#website")).not.toBeInViewport();

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
  await page.goto("./");
  await page.getByLabel("Email").fill("bot@example.com");
  await page.locator("#website").fill("https://spam.example", { force: true });
  await byTestId(page, "waitlist.submit").click();
  await expect(byTestId(page, "waitlist.joined")).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("the copy never shows a beta date", async ({ page }) => {
  await page.goto("./");
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\b|\bQ[1-4]\b/);
});

// The page is exactly one screen on phones: nothing to scroll, nothing to drag.
// Visible areas with the browser's bars showing, small to large.
const SCREENS = [
  { name: "iPhone SE", width: 375, height: 548 },
  { name: "iPhone 14", width: 390, height: 664 },
  { name: "iPhone 15 Pro Max", width: 430, height: 740 },
  { name: "Pixel 7", width: 412, height: 839 },
];

for (const screen of SCREENS) {
  test(`fits one screen with nothing to scroll: ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("./");
    const fits = () => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
    expect(await fits()).toBeLessThanOrEqual(0);
    await expect(byTestId(page, "waitlist.submit")).toBeInViewport({ ratio: 1 });
    // No rubber-band bounce (where the browser supports turning it off; Safari 16+ and Chrome do).
    const overscroll = await page.evaluate(() =>
      CSS.supports("overscroll-behavior", "none") ? getComputedStyle(document.documentElement).overscrollBehaviorY : "none",
    );
    expect(overscroll).toBe("none");
    // An error takes the fine print's place, so it still fits.
    await byTestId(page, "waitlist.submit").click();
    await expect(byTestId(page, "waitlist.error")).toBeVisible();
    expect(await fits()).toBeLessThanOrEqual(0);
  });
}

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
