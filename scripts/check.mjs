// Static checks the browser can't make for us. Fails CI when:
//  - config.js carries anything but an anon key (a service role key here would
//    hand the whole database to anyone who opens the page);
//  - the page's CSP doesn't allow the Supabase origin config.js talks to;
//  - a beta date slips into the copy (LOU-80: no date shown anywhere).
import { readFile } from "node:fs/promises";
import { policyProblems } from "./csp-rules.mjs";

const root = new URL("../src/", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");
const failures = [];

const config = await read("config.js");
const url = config.match(/SUPABASE_URL = "([^"]+)"/)?.[1];
const key = config.match(/SUPABASE_ANON_KEY = "([^"]+)"/)?.[1];
if (!url || !key) failures.push("config.js: SUPABASE_URL or SUPABASE_ANON_KEY is missing");
if (key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (payload.role !== "anon") failures.push(`config.js: the key's role is "${payload.role}", not "anon"`);
    if (url && !url.includes(payload.ref)) failures.push("config.js: the key belongs to another project");
  } catch {
    failures.push("config.js: SUPABASE_ANON_KEY is not a Supabase JWT");
  }
}

const html = await read("index.html");
const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
if (url && !csp.includes(`connect-src ${url}`)) failures.push(`index.html: CSP connect-src doesn't allow ${url}`);

// Every page carries exactly its pinned CSP (scripts/csp-rules.mjs): nothing
// allowed by default, script only from the site and only on the index page,
// connections exactly Supabase and Loops, Trusted Types enforced. Any source
// or directive added, dropped or loosened fails (LOU-102 4.4).
const pages = ["index.html", "privacy/index.html", "terms/index.html", "community-guidelines/index.html"];
for (const page of pages) {
  const source = await read(page).catch(() => null);
  if (source === null) {
    failures.push(`${page}: missing`);
    continue;
  }
  const policy = source.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? "";
  if (!policy) failures.push(`${page}: no Content-Security-Policy`);
  else failures.push(...policyProblems(page, policy, url));
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(source)) failures.push(`${page}: inline <script>`);
  if (/\son[a-z]+\s*=/i.test(source)) failures.push(`${page}: inline event handler`);
  if (page !== "index.html" && /<script/i.test(source)) failures.push(`${page}: legal pages carry no script`);
}

const text = html.replace(/<[^>]+>/g, " ");
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const date = text.match(new RegExp(`\\b(${MONTHS})\\b|\\b\\d{1,2}/\\d{1,2}\\b|\\bQ[1-4]\\b`, "i"));
if (date) failures.push(`index.html: "${date[0]}" looks like a beta date; LOU-80 shows none`);

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("✓ anon key only, strict CSP on every page (Supabase + Loops only), no beta date");
