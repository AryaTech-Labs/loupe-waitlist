import { describe, expect, it } from "vitest";
import { extractCard, renderPage, safeHref, sanitize } from "../scripts/import-legal.mjs";

describe("the legal import keeps plain document markup only", () => {
  it("keeps headings, paragraphs, lists, emphasis and the effective-date line", () => {
    const html = '<h1>Privacy Policy</h1><p class="meta">Effective: March 22</p><h2>1. Data</h2><ul><li><strong>Email</strong></li></ul>';
    expect(sanitize(html)).toBe(
      '<h1>Privacy Policy</h1><p class="meta">Effective: March 22</p><h2>1. Data</h2><ul><li><strong>Email</strong></li></ul>',
    );
  });

  it("removes scripts, styles, frames and event handlers, whatever the case", () => {
    const html =
      '<p onclick="steal()">Hi</p><SCRIPT>alert(1)</SCRIPT><style>p{}</style><iframe src="https://x"></iframe><img src=x onerror=alert(1)><svg onload=alert(1)></svg>';
    const out = sanitize(html);
    expect(out).toBe("<p>Hi</p>");
    expect(out).not.toMatch(/script|onerror|onload|onclick|iframe|svg|img/i);
  });

  it("can't be tricked by tags split around other tags or comments", () => {
    for (const trick of [
      "<scr<script>x</script>ipt>alert(1)</script>",
      "<<script>script>alert(1)<</script>/script>",
      "<!<!--- comment --->>",
      "<sc<!-- -->ript>alert(1)</script>",
      "<p>ok<scr<style></style>ipt src=//evil></script></p>",
      "<script>alert(1)</script foo='bar'>",
      "<SCRIPT>alert(1)</SCRIPT\n>",
      "<style>p{}</style\t>",
      "<!-- x --!><script>alert(1)</script>",
    ]) {
      const out = sanitize(trick);
      expect(out).not.toMatch(/<\s*script/i);
      expect(out).not.toMatch(/<!--/);
      expect(out).not.toMatch(/<(?!\/?(h1|h2|h3|p|ul|ol|li|strong|em|b|i|a|br)\b)/i);
    }
  });

  it("keeps only https:, mailto: and our own page links", () => {
    expect(safeHref("privacy-policy.html")).toBe("../privacy/");
    expect(safeHref("terms-of-service.html")).toBe("../terms/");
    expect(safeHref("mailto:support@example.com")).toBe("mailto:support@example.com");
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "http://example.com", "//evil.example", "other.html"]) {
      expect(safeHref(bad)).toBeNull();
    }
  });

  it("drops a bad link but keeps its text, and closes links correctly", () => {
    expect(sanitize('<p><a href="javascript:alert(1)">click</a> and <a href="terms-of-service.html">terms</a></p>')).toBe(
      '<p>click and <a href="../terms/">terms</a></p>',
    );
    expect(sanitize('<a href="https://example.com" target="_blank" onmouseover="x()">site</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">site</a>',
    );
  });

  it("shows anything else that looks like markup as text", () => {
    expect(sanitize("<p>a <foo>b</foo> < c</p>")).toBe("<p>a b &lt; c</p>");
  });

  it("an unterminated tag at the end of the page becomes text, never a live tag", () => {
    const out = sanitize('<p>fine</p>\n<p onmouseover="steal()" class="x');
    expect(out).toBe('<p>fine</p>\n&lt;p onmouseover="steal()" class="x');
    expect(sanitize("<p>a</p><a href=\"https://x.example\" onclick=\"y()\"")).not.toMatch(/<a /);
  });

  it("finds the document inside the original page's card", () => {
    const page = '<html><body><nav>x</nav><div class="card">\n<h1>T</h1>\n</div>\n</body></html>';
    expect(extractCard(page).trim()).toBe("<h1>T</h1>");
    expect(() => extractCard("<body>no card</body>")).toThrow();
  });

  it("renders a page with no scripts allowed and our own navigation", () => {
    const html = renderPage({ slug: "privacy", title: "Privacy Policy", description: "d", source: "privacy-policy.html" }, "<h1>Privacy Policy</h1>");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<a href="../privacy/" aria-current="page">Privacy Policy</a>');
    expect(html).toContain('<link rel="canonical" href="https://loupeweb.com/privacy/" />');
  });
});

// LOU-102 4.8: robustness of the sanitiser (none of these could run script;
// the final canonical-form pass already guarantees that).
describe("sanitize: robustness", () => {
  it("an escaped & in a link survives as one & (query links keep working)", () => {
    const out = sanitize('<p><a href="https://example.com/?a=1&amp;b=2">x</a></p>');
    expect(out).toBe('<p><a href="https://example.com/?a=1&amp;b=2" rel="noopener noreferrer">x</a></p>');
    // …and the browser reads it back as a=1&b=2, not a=1&amp;b=2.
    expect(out).not.toContain("&amp;amp;");
  });

  it("a > inside a quoted attribute doesn't spill the rest of the tag onto the page", () => {
    expect(sanitize('<p title="a>b" onclick="x()">Hello</p>')).toBe("<p>Hello</p>");
    expect(sanitize("<p data-x='1>2'>Hi</p>")).toBe("<p>Hi</p>");
  });

  it("a kept tag left open is closed where its parent ends, so it can't style the rest of the page", () => {
    expect(sanitize("<p><strong>Important</p><p>Normal</p>")).toBe("<p><strong>Important</strong></p><p>Normal</p>");
    expect(sanitize("<h2>Title<p>Body</p>")).toBe("<h2>Title</h2><p>Body</p>");
  });

  it("a closing tag with nothing open is dropped", () => {
    expect(sanitize("<p>Text</em></p>")).toBe("<p>Text</p>");
  });

  it("well-formed markup is unchanged", () => {
    const html = "<h2>1. Data</h2><p>We keep <strong>email</strong> and <em>nothing else</em>.</p><ul><li>One</li><li>Two</li></ul>";
    expect(sanitize(html)).toBe(html);
  });
});
