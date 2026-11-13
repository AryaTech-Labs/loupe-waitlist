// Builds loupeweb.com's legal pages (/privacy/, /terms/, /community-guidelines/)
// from the published originals on the app's site, which stay the source of
// truth (they're what the App Store listing links to).
//
// The imported HTML is cut down to plain document markup (headings,
// paragraphs, lists, bold/italic, line breaks and links to https:, mailto: or
// our own pages): no scripts, styles, attributes or anything else survives, so
// even a compromised source page can't put code on loupeweb.com. The pages
// themselves carry no JavaScript at all.
//
//   node scripts/import-legal.mjs           write src/<page>/index.html
//   node scripts/import-legal.mjs --check   exit 1 if the source has changed
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const SOURCE = "https://jacob-gonsalves.github.io/loupe/";

export const PAGES = [
  {
    source: "privacy-policy.html",
    slug: "privacy",
    title: "Privacy Policy",
    description: "How Arya Tech Inc. collects, uses and protects your information in Loupe.",
  },
  {
    source: "terms-of-service.html",
    slug: "terms",
    title: "Terms of Service",
    description: "The terms for using Loupe.",
  },
  {
    source: "community-guidelines.html",
    slug: "community-guidelines",
    title: "Community Guidelines",
    description: "How we look after each other on Loupe.",
  },
];

/** Links between the original pages, pointed at their loupeweb.com homes. */
const LINKS = {
  "index.html": "../",
  "privacy-policy.html": "../privacy/",
  "terms-of-service.html": "../terms/",
  "community-guidelines.html": "../community-guidelines/",
};

const KEEP = new Set(["h1", "h2", "h3", "p", "ul", "ol", "li", "strong", "em", "b", "i", "a", "br"]);

/** A link we'd keep, rewritten for loupeweb.com; null to drop it (its text stays). */
export function safeHref(raw) {
  const href = raw.trim();
  if (Object.hasOwn(LINKS, href)) return LINKS[href];
  if (/^mailto:[^\s"<>]+$/i.test(href)) return href;
  if (/^https:\/\/[^\s"<>]+$/i.test(href)) return href;
  return null;
}

/** Removes every match of `pattern`, again and again until none is left (no "<scr<script>ipt>" tricks). */
function removeAll(text, pattern) {
  let previous;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, "");
  } while (current !== previous);
  return current;
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** An attribute value as the browser reads it (so escaping it once is right). */
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity) => {
    const e = entity.toLowerCase();
    if (e === "amp") return "&";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

// Tags that hold paragraph-level content: opening another block closes them.
const PARAGRAPHS = new Set(["p", "h1", "h2", "h3"]);
const BLOCKS = new Set(["p", "h1", "h2", "h3", "ul", "ol"]);

/**
 * Plain document markup only. Every tag not on the list is removed (its text
 * kept); kept tags lose every attribute except a checked href on <a>, and
 * class="meta" on the effective-date line.
 */
export function sanitize(html) {
  // A comment ends at "-->" or "--!>" (both, per the HTML spec).
  let s = removeAll(html, /<!--[\s\S]*?--!?>/g);
  s = removeAll(s, /<(script|style|iframe|object|embed|template|svg|math|noscript)\b[\s\S]*?<\/\1\b[^>]*>/gi);
  s = removeAll(s, /<\/?(script|style|iframe|object|embed|template|svg|math|noscript)\b[^>]*>/gi);
  s = removeAll(s, /<!--|--!?>/g);
  const linkOpen = [];
  // Kept tags still open, innermost last: a tag left open is closed where
  // its parent ends (or at the end), so it can't style the rest of the page.
  const open = [];
  const closeDownTo = (index) => {
    let out = "";
    while (open.length > index) out += `</${open.pop()}>`;
    return out;
  };
  // Attributes are matched quote-aware: a ">" inside a quoted value doesn't
  // end the tag (it used to spill the rest of the tag onto the page).
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash, rawName, attrs) => {
    const name = rawName.toLowerCase();
    if (!KEEP.has(name)) return "";
    if (name === "br") return slash ? "" : "<br />";
    if (slash) {
      if (name === "a" && !linkOpen.pop()) return ""; // its <a> was dropped
      const at = open.lastIndexOf(name);
      return at === -1 ? "" : closeDownTo(at); // a close with nothing open is dropped
    }
    // Opening a block ends an open paragraph or heading; a new item ends the last.
    let before = "";
    if (BLOCKS.has(name)) {
      const at = open.findLastIndex((tag) => PARAGRAPHS.has(tag));
      if (at !== -1) before = closeDownTo(at);
    }
    if (name === "li") {
      const at = open.lastIndexOf("li");
      if (at !== -1 && !open.slice(at).some((tag) => tag === "ul" || tag === "ol")) before += closeDownTo(at);
    }
    if (name === "a") {
      const raw = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bhref\s*=\s*'([^']*)'/i.exec(attrs)?.[1];
      const safe = raw ? safeHref(decodeEntities(raw)) : null;
      linkOpen.push(Boolean(safe));
      if (!safe) return before;
      open.push("a");
      const external = /^https:/i.test(safe) ? ' rel="noopener noreferrer"' : "";
      return `${before}<a href="${escapeAttr(safe)}"${external}>`;
    }
    open.push(name);
    if (name === "p" && /\bclass\s*=\s*"meta"/i.test(attrs)) return `${before}<p class="meta">`;
    return `${before}<${name}>`;
  });
  s += closeDownTo(0);
  // Everything above emits tags in exactly these forms. Any other "<" (an
  // unterminated tag at the end of the page, a stray attribute, anything
  // unexpected) is shown as text.
  const canonical = /<(?:\/?(?:h1|h2|h3|p|ul|ol|li|strong|em|b|i|a)>|br \/>|p class="meta">|a href="[^"<>]*"(?: rel="noopener noreferrer")?>)/y;
  s = s.replace(/</g, (match, offset) => {
    canonical.lastIndex = offset;
    return canonical.test(s) ? match : "&lt;";
  });
  return s
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** The document inside the original page's card. */
export function extractCard(html) {
  const start = html.search(/<div\s+class="card"\s*>/i);
  if (start < 0) throw new Error("no card in the source page");
  const open = html.indexOf(">", start) + 1;
  const end = html.lastIndexOf("</div>", html.search(/<\/body>/i));
  if (end <= open) throw new Error("card not closed in the source page");
  return html.slice(open, end);
}

const CSP =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'";

export function renderPage(page, body) {
  const nav = PAGES.map((p) =>
    p.slug === page.slug
      ? `<a href="../${p.slug}/" aria-current="page">${p.title}</a>`
      : `<a href="../${p.slug}/">${p.title}</a>`,
  ).join("\n        ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${page.title} — Loupe</title>
    <meta name="description" content="${page.description}" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#f2f3f5" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#101216" media="(prefers-color-scheme: dark)" />
    <link rel="canonical" href="https://loupeweb.com/${page.slug}/" />
    <link rel="icon" href="../favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="../apple-touch-icon.png" />
    <link rel="stylesheet" href="../styles.css" />
    <link rel="stylesheet" href="../legal.css" />
  </head>
  <body class="legal">
    <!-- Generated by scripts/import-legal.mjs from ${SOURCE}${page.source}. Change the source, then re-run the script. -->
    <div class="legal-page">
      <nav class="legal-nav" aria-label="Loupe">
        <a class="legal-home" href="../">Loupe</a>
        ${nav}
      </nav>
      <main class="legal-doc" data-testid="legal.${page.slug}">
${body
  .split("\n")
  .map((line) => (line ? `        ${line}` : ""))
  .join("\n")}
      </main>
      <footer class="footer">© 2026 Arya Tech</footer>
    </div>
  </body>
</html>
`;
}

async function build(page) {
  const response = await fetch(new URL(page.source, SOURCE), { redirect: "error" });
  if (!response.ok) throw new Error(`${page.source}: HTTP ${response.status}`);
  return renderPage(page, sanitize(extractCard(await response.text())));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const page of PAGES) {
    const html = await build(page);
    const path = `src/${page.slug}/index.html`;
    if (check) {
      const current = await readFile(path, "utf8").catch(() => "");
      if (current.replace(/\r\n/g, "\n") !== html) {
        console.error(`${path} is out of date with ${SOURCE}${page.source}: run node scripts/import-legal.mjs`);
        stale++;
      }
    } else {
      await mkdir(`src/${page.slug}`, { recursive: true });
      await writeFile(path, html);
      console.log(`wrote ${path}`);
    }
  }
  if (stale) process.exit(1);
  if (check) console.log("✓ legal pages match the published source");
}
