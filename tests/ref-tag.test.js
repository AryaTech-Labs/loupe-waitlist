import { describe, expect, it } from "vitest";
import { buildRow, currentRef, normalizeRef, REF_MAX, REF_STORAGE_KEY } from "../src/waitlist.js";

// LOU-103: a sign-up carries the ad or post that sent it (`?ref=`), kept for
// the session. Tags are lowercase, a–z 0–9 and hyphens, at most 64 characters;
// anything else is NULL, never an error. `ref` is only sent once the column
// exists (REF_COLUMN_LIVE): PostgREST refuses an unknown column with 400.

function memory() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    map,
  };
}

describe("normalizeRef", () => {
  it("keeps a tag in the convention, lowercased and trimmed", () => {
    expect(normalizeRef("meta-teaser-nov")).toBe("meta-teaser-nov");
    expect(normalizeRef("  IG-Launch-01 ")).toBe("ig-launch-01");
  });

  it("caps at 64 characters", () => {
    expect(REF_MAX).toBe(64);
    expect(normalizeRef("a".repeat(80))).toBe("a".repeat(64));
  });

  it("anything malformed or missing is null", () => {
    for (const bad of [null, undefined, "", "   ", "meta teaser", "meta_teaser", "<script>", "ref%20x", "émail", 42]) {
      expect(normalizeRef(bad)).toBeNull();
    }
  });
});

describe("currentRef", () => {
  it("reads ?ref= and keeps it for the session", () => {
    const storage = memory();
    expect(currentRef("?ref=meta-teaser-nov", storage)).toBe("meta-teaser-nov");
    expect(storage.getItem(REF_STORAGE_KEY)).toBe("meta-teaser-nov");
    // A later page in the same session without ?ref= still carries it.
    expect(currentRef("", storage)).toBe("meta-teaser-nov");
  });

  it("a new valid ref replaces the kept one; a malformed one doesn't", () => {
    const storage = memory();
    currentRef("?ref=meta-a", storage);
    expect(currentRef("?ref=ig-b", storage)).toBe("ig-b");
    expect(currentRef("?ref=not valid", storage)).toBe("ig-b");
  });

  it("a plain visit has none", () => {
    expect(currentRef("", memory())).toBeNull();
    expect(currentRef("?utm_source=x", memory())).toBeNull();
  });

  it("works without storage (private mode throws)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(currentRef("?ref=creator-jane", throwing)).toBe("creator-jane");
    expect(currentRef("", throwing)).toBeNull();
    expect(currentRef("?ref=creator-jane", null)).toBe("creator-jane");
  });

  it("a tampered stored value is read as null", () => {
    const storage = memory();
    storage.setItem(REF_STORAGE_KEY, "<img src=x>");
    expect(currentRef("", storage)).toBeNull();
  });
});

describe("buildRow with a ref", () => {
  it("sends ref only once the column is live", () => {
    expect(buildRow({ email: "a@b.co", collects: "", ref: "meta-x" })).toEqual({ email: "a@b.co", collects: null });
    expect(buildRow({ email: "a@b.co", collects: "", ref: "meta-x" }, { refLive: true })).toEqual({
      email: "a@b.co",
      collects: null,
      ref: "meta-x",
    });
  });

  it("no ref, no key, even when live", () => {
    expect(buildRow({ email: "a@b.co", collects: "" }, { refLive: true })).toEqual({ email: "a@b.co", collects: null });
  });
});
