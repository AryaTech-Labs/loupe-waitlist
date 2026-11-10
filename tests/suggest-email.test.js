import { describe, expect, it } from "vitest";
import { editDistance, joinedBody, suggestEmail } from "../src/waitlist.js";

describe("editDistance", () => {
  it("counts a swap of neighbouring letters as one", () => {
    expect(editDistance("gmial", "gmail")).toBe(1);
    expect(editDistance("gmai", "gmail")).toBe(1);
    expect(editDistance("gnail", "gmail")).toBe(1);
    expect(editDistance("gmail", "gmail")).toBe(0);
    expect(editDistance("googlmeail", "googlemail")).toBe(1);
  });
});

describe("suggestEmail catches common slips", () => {
  const cases = [
    ["name@gmial.com", "name@gmail.com"],
    ["name@gamil.com", "name@gmail.com"],
    ["name@gmai.com", "name@gmail.com"],
    ["name@gnail.com", "name@gmail.com"],
    ["name@gmaill.com", "name@gmail.com"],
    ["name@gmail.con", "name@gmail.com"],
    ["name@gmail.cmo", "name@gmail.com"],
    ["name@gmail.comm", "name@gmail.com"],
    ["name@gmail.cm", "name@gmail.com"],
    ["name@gmail.co", "name@gmail.com"],
    ["name@gmial.con", "name@gmail.com"],
    ["Name@GMIAL.com", "name@gmail.com"],
    ["name@hotmial.com", "name@hotmail.com"],
    ["name@hotmal.com", "name@hotmail.com"],
    ["name@hotmial.co.uk", "name@hotmail.co.uk"],
    ["name@outlok.com", "name@outlook.com"],
    ["name@outllok.com", "name@outlook.com"],
    ["name@yahooo.com", "name@yahoo.com"],
    ["name@yaho.com", "name@yahoo.com"],
    ["name@yahoo.co.uj", null],
    ["name@iclod.com", "name@icloud.com"],
    ["name@icoud.com", "name@icloud.com"],
    ["name@icloud.co", "name@icloud.com"],
    ["name@googlmail.com", "name@googlemail.com"],
    ["name@protonmial.com", "name@protonmail.com"],
    ["name@comcast.nte", "name@comcast.net"],
    ["name@aol.con", "name@aol.com"],
    ["name@me.con", "name@me.com"],
    ["name@msn.cm", "name@msn.com"],
  ];
  for (const [typed, meant] of cases) {
    it(`${typed} → ${meant}`, () => expect(suggestEmail(typed)).toBe(meant));
  }
});

describe("suggestEmail leaves real addresses alone", () => {
  const real = [
    "name@gmail.com",
    "name@hotmail.co.uk",
    "name@outlook.com",
    "name@icloud.com",
    "name@company.com",
    "jacob@arya-tech.net",
    "name@gmx.de",
    "name@gmx.com",
    "name@ymail.com",
    "name@email.com",
    "name@mail.com",
    "name@cloud.com",
    "name@comcast.com",
    "name@hotmail.fr",
    "name@yahoo.co.jp",
    "name@outlook.co",
    "name@yahoo.co",
    "name@max.com",
    "name@live.co.uk",
    "name@proton.me",
    "name@pm.me",
    "name@example.com",
    "name@loupe.arya-tech.net",
    "not-an-email",
    "",
  ];
  for (const typed of real) {
    it(`${typed || "(empty)"} → nothing`, () => expect(suggestEmail(typed)).toBeNull());
  }
});

describe("joinedBody", () => {
  it("names the welcome email once it's live", () => {
    expect(joinedBody("name@gmail.com", true)).toBe("We've sent a welcome email to name@gmail.com.");
  });
  it("keeps the invite line until then", () => {
    expect(joinedBody("name@gmail.com", false)).toBe("We'll email you when your invite is ready.");
  });
});
