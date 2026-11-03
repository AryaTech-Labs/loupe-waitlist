// Static checks the browser can't make for us. Fails CI when:
//  - config.js carries anything but an anon key (a service role key here would
//    hand the whole database to anyone who opens the page);
//  - the page's CSP doesn't allow the Supabase origin config.js talks to;
//  - a beta date slips into the copy (LOU-80: no date shown anywhere).
import { readFile } from "node:fs/promises";

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

const text = html.replace(/<[^>]+>/g, " ");
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const date = text.match(new RegExp(`\\b(${MONTHS})\\b|\\b\\d{1,2}/\\d{1,2}\\b|\\bQ[1-4]\\b`, "i"));
if (date) failures.push(`index.html: "${date[0]}" looks like a beta date; LOU-80 shows none`);

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("✓ anon key only, CSP allows Supabase, no beta date");
