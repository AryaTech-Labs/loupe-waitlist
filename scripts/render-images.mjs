// Renders the page's still images from the same drawing code the page uses,
// so they always match the live dial:
//   src/og-image.png         1200×630 link preview (dark), the dial at 10:08:31
//   src/apple-touch-icon.png  180×180 home-screen icon (dark), the dial alone
// Run: node scripts/render-images.mjs   (needs Playwright's Chromium)
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const PORT = 4199;
const server = spawn(process.execPath, ["scripts/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 600));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ colorScheme: "dark" });
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => document.fonts.ready);
  const images = await page.evaluate(async () => {
    const { drawDial, drawGenevaStripes, handAngles } = await import("/vendor/guilloche.js");
    const { drawSecondsHand } = await import("/dial.js");
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    const t = {
      background: v("--was-background"),
      surface: v("--was-surface"),
      elevated: v("--was-elevated"),
      hairline: v("--was-hairline"),
      primary: v("--was-primary-text"),
      secondary: v("--was-secondary-text"),
      accent: v("--was-accent"),
      error: v("--was-error"),
      finishHighlight: v("--was-finish-highlight"),
      finishShadow: v("--was-finish-shadow"),
    };
    const fonts = { sans: '"Geist", system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, monospace' };
    // The watchmaker's 10:08, on a Tuesday the 3rd (no real date in the copy).
    const at = new Date(2026, 10, 3, 10, 8, 31);
    const dialAt = (ctx, size) => {
      drawDial(ctx, size, at, t, true, fonts);
      drawSecondsHand(ctx, size, handAngles(at).second, t);
    };
    const canvas = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return [c, c.getContext("2d")];
    };

    const [og, o] = canvas(1200, 630);
    o.fillStyle = t.background;
    o.fillRect(0, 0, 1200, 630);
    drawGenevaStripes(o, 1200, 630, t);
    const [dial, d] = canvas(360, 360);
    dialAt(d, 360);
    o.drawImage(dial, 222, 135);
    o.textBaseline = "alphabetic";
    o.fillStyle = t.secondary;
    o.font = `600 18px ${fonts.sans}`;
    if ("letterSpacing" in o) o.letterSpacing = "1.5px";
    o.fillText("CLOSED BETA", 638, 216);
    if ("letterSpacing" in o) o.letterSpacing = "0px";
    o.fillStyle = t.primary;
    o.font = `700 96px ${fonts.sans}`;
    o.fillText("Loupe", 632, 318);
    o.fillStyle = t.secondary;
    o.font = `500 30px ${fonts.sans}`;
    o.fillText("Any watch welcome.", 638, 384);
    o.fillText("Every watch celebrated.", 638, 424);

    const [icon, i] = canvas(180, 180);
    i.fillStyle = t.background;
    i.fillRect(0, 0, 180, 180);
    const [small, s] = canvas(164, 164);
    dialAt(s, 164);
    i.drawImage(small, 8, 8);

    return { og: og.toDataURL("image/png"), icon: icon.toDataURL("image/png") };
  });
  const bytes = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
  await writeFile("src/og-image.png", bytes(images.og));
  await writeFile("src/apple-touch-icon.png", bytes(images.icon));
  console.log("wrote src/og-image.png and src/apple-touch-icon.png");
} finally {
  await browser.close();
  server.kill();
}
