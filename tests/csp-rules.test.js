import { describe, expect, it } from "vitest";
import { expectedPolicy, policyProblems } from "../scripts/csp-rules.mjs";

// LOU-102 4.4: `npm run check` must fail when any page's CSP is loosened —
// not only for the unsafe keywords it looked for before. Each page's policy
// is pinned, directive by directive.

const SUPABASE = "https://ref.supabase.co";
const INDEX =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; " +
  `connect-src ${SUPABASE} https://app.loops.so; base-uri 'none'; form-action 'none'; ` +
  "require-trusted-types-for 'script'; trusted-types 'none'";
const LEGAL =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; " +
  "form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'";

const problems = (page, policy) => policyProblems(page, policy, SUPABASE);

describe("policyProblems", () => {
  it("the pinned policies pass, in any order and spacing", () => {
    expect(problems("index.html", INDEX)).toEqual([]);
    expect(problems("terms/index.html", LEGAL)).toEqual([]);
    const shuffled = INDEX.split(";").map((d) => `  ${d.trim()}`).reverse().join(" ;");
    expect(problems("index.html", shuffled)).toEqual([]);
  });

  it.each([
    ["a script host added", INDEX.replace("script-src 'self'", "script-src 'self' https://cdn.evil.example")],
    ["Trusted Types loosened", INDEX.replace("trusted-types 'none'", "trusted-types default")],
    ["inline script allowed", INDEX.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")],
    ["images from anywhere", INDEX.replace("img-src 'self'", "img-src *")],
    ["an extra connection", INDEX.replace("https://app.loops.so", "https://app.loops.so https://track.example")],
    ["a directive added", `${INDEX}; worker-src blob:`],
    ["a directive dropped", INDEX.replace("base-uri 'none'; ", "")],
    ["default-src opened", INDEX.replace("default-src 'none'", "default-src 'self'")],
  ])("fails: %s", (_, policy) => {
    expect(problems("index.html", policy).length).toBeGreaterThan(0);
  });

  it("a legal page may not run script at all", () => {
    expect(problems("privacy/index.html", `${LEGAL}; script-src 'self'`).length).toBeGreaterThan(0);
  });

  it("names the directive and what differs", () => {
    const [problem] = problems("index.html", INDEX.replace("script-src 'self'", "script-src 'self' https://x.example"));
    expect(problem).toContain("script-src");
    expect(problem).toContain("https://x.example");
  });

  it("expectedPolicy knows every page", () => {
    for (const page of ["index.html", "privacy/index.html", "terms/index.html", "community-guidelines/index.html"]) {
      expect(expectedPolicy(page, SUPABASE)).toBeTruthy();
    }
  });
});
