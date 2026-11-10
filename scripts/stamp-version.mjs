// Stamps a deploy's version onto the page's own script and stylesheet URLs
// (styles.css?v=…, main.js?v=…, and every relative import inside the scripts).
// GitHub Pages lets browsers keep each file for 10 minutes, so without this a
// phone could pair a new dial.js with an old cached copy of the code it
// imports. With it, each deploy's files only ever load alongside each other.
//
// CI runs it on the folder it publishes, after the tests:
//   node scripts/stamp-version.mjs src <version>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** <script src> and <link href> pointing at this site's own .js/.css files. */
export function stampHtml(html, version) {
  return html.replace(
    /(<(?:script|link)\b[^>]*?\s(?:src|href)=")((?![a-z]+:|\/\/)[^"?#]+\.(?:js|css))(")/g,
    `$1$2?v=${version}$3`,
  );
}

/** Relative static imports: `from "./x.js"`, `from "../y.js"`. */
export function stampJs(js, version) {
  return js.replace(/(\bfrom\s+")(\.{1,2}\/[^"?#]+\.js)(")/g, `$1$2?v=${version}$3`);
}

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [dir, version] = process.argv.slice(2);
  if (!dir || !/^[\w.-]+$/.test(version ?? "")) {
    console.error("usage: node scripts/stamp-version.mjs <dir> <version>");
    process.exit(1);
  }
  let count = 0;
  for await (const path of files(dir)) {
    const stamp = path.endsWith(".html") ? stampHtml : path.endsWith(".js") ? stampJs : null;
    if (!stamp) continue;
    const before = await readFile(path, "utf8");
    const after = stamp(before, version);
    if (after !== before) {
      await writeFile(path, after);
      count++;
    }
  }
  console.log(`stamped ${count} files with ?v=${version}`);
}
