import { describe, expect, test } from "vitest";
import { stampHtml, stampJs } from "../scripts/stamp-version.mjs";

describe("stamping a deploy's version", () => {
  test("marks the page's own scripts and stylesheet, nothing else", () => {
    const html = [
      '<link rel="stylesheet" href="styles.css" />',
      '<script type="module" src="main.js"></script>',
      '<link rel="modulepreload" href="vendor/guilloche.js" />',
      '<link rel="preload" href="fonts/Geist-Latin.woff2" as="font" />',
      '<link rel="icon" href="favicon.ico" />',
      '<link rel="canonical" href="https://loupeweb.com/" />',
      '<meta property="og:image" content="https://loupeweb.com/og-image.jpg" />',
    ].join("\n");
    expect(stampHtml(html, "abc123")).toBe(
      [
        '<link rel="stylesheet" href="styles.css?v=abc123" />',
        '<script type="module" src="main.js?v=abc123"></script>',
        '<link rel="modulepreload" href="vendor/guilloche.js?v=abc123" />',
        '<link rel="preload" href="fonts/Geist-Latin.woff2" as="font" />',
        '<link rel="icon" href="favicon.ico" />',
        '<link rel="canonical" href="https://loupeweb.com/" />',
        '<meta property="og:image" content="https://loupeweb.com/og-image.jpg" />',
      ].join("\n"),
    );
  });

  test("marks every relative import, so the module graph is one deploy's", () => {
    const js = 'import { a } from "./vendor/guilloche.js";\nimport { b } from "../finish.js";\nconst s = "./not-an-import.js";';
    expect(stampJs(js, "v1")).toBe(
      'import { a } from "./vendor/guilloche.js?v=v1";\nimport { b } from "../finish.js?v=v1";\nconst s = "./not-an-import.js";',
    );
  });

  test("a stamped preload and the import it stands for are the same URL", () => {
    const html = stampHtml('<link rel="modulepreload" href="dial.js" />', "x");
    const js = stampJs('import { startDial } from "./dial.js";', "x");
    expect(html).toContain('href="dial.js?v=x"');
    expect(js).toContain('"./dial.js?v=x"');
  });
});

// LOU-102 4.9: every way a module can load another must carry the stamp, or a
// browser could run one deploy's file beside another deploy's cached copy.
describe("stampJs: every relative import form", () => {
  test("side-effect imports, re-exports, dynamic imports and single quotes", () => {
    const js = [
      'import "./polyfill.js";',
      "import { a } from './single.js';",
      'export { b } from "./re-export.js";',
      'const lazy = await import("./lazy.js");',
      "const other = import('../other.js');",
      'const text = "./not-an-import.js";',
      'import { c } from "https://cdn.example/x.js";',
    ].join("\n");
    expect(stampJs(js, "v2")).toBe(
      [
        'import "./polyfill.js?v=v2";',
        "import { a } from './single.js?v=v2';",
        'export { b } from "./re-export.js?v=v2";',
        'const lazy = await import("./lazy.js?v=v2");',
        "const other = import('../other.js?v=v2');",
        'const text = "./not-an-import.js";',
        'import { c } from "https://cdn.example/x.js";',
      ].join("\n"),
    );
  });

  test("stamping twice doesn't stamp twice", () => {
    const once = stampJs('import "./a.js";', "v3");
    expect(stampJs(once, "v3")).toBe(once);
  });
});
