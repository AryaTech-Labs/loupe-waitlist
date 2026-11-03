import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// SITE_URL runs the same tests against a deployed copy (Supabase is still
// answered in the browser, so nothing is written), e.g.
// SITE_URL=https://aryatech-labs.github.io/loupe-waitlist/ npm run test:e2e
const SITE_URL = process.env.SITE_URL;

// Ad traffic is Meta Reels/Stories, so the phone layouts are the ones that
// matter: Safari on iPhone (WebKit) and Chrome on Android.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: SITE_URL ?? `http://localhost:${PORT}/`, trace: "retain-on-failure" },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 14"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: SITE_URL
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(PORT) },
      },
});
