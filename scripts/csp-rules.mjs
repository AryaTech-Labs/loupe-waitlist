// Each page's Content-Security-Policy, pinned directive by directive
// (LOU-102 4.4). `npm run check` fails on any difference: a source or a
// directive added, dropped or loosened. Changing a page's policy means
// changing it here too, on purpose.

const LOOPS = "https://app.loops.so";

const COMMON = {
  "default-src": ["'none'"],
  "style-src": ["'self'"],
  "font-src": ["'self'"],
  "img-src": ["'self'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "require-trusted-types-for": ["'script'"],
  "trusted-types": ["'none'"],
};

/** The policy a page must carry, as { directive: [sources] }. */
export function expectedPolicy(page, supabaseUrl) {
  if (page === "index.html") {
    return { ...COMMON, "script-src": ["'self'"], "connect-src": [supabaseUrl, LOOPS] };
  }
  // The legal pages are static text: no script, no connections.
  if (["privacy/index.html", "terms/index.html", "community-guidelines/index.html"].includes(page)) return { ...COMMON };
  return null;
}

function parse(policy) {
  const directives = {};
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives[name.toLowerCase()] = sources;
  }
  return directives;
}

const same = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** Every difference between a page's policy and its pinned one. */
export function policyProblems(page, policy, supabaseUrl) {
  const expected = expectedPolicy(page, supabaseUrl);
  if (!expected) return [`${page}: no pinned CSP for this page`];
  const actual = parse(policy);
  const problems = [];
  for (const [name, sources] of Object.entries(expected)) {
    if (!actual[name]) problems.push(`${page}: CSP is missing ${name}`);
    else if (!same(actual[name], sources)) {
      problems.push(`${page}: CSP ${name} is "${actual[name].join(" ")}", expected "${sources.join(" ")}"`);
    }
  }
  for (const name of Object.keys(actual)) {
    if (!(name in expected)) problems.push(`${page}: CSP has an unexpected ${name} "${actual[name].join(" ")}"`);
  }
  return problems;
}
