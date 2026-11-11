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
