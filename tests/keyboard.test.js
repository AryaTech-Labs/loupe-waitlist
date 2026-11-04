import { describe, expect, it } from "vitest";
import { KEYBOARD_MIN, MARGIN, keyboardHeight, scrollDelta } from "../src/keyboard.js";

// dial.js imports the canvas drawing code, which only touches the DOM when called.
const { stripesHeight } = await import("../src/dial.js");

describe("stripesHeight", () => {
  it("is tall enough for the page plus the keyboard's room, on the screen's longest side", () => {
    expect(stripesHeight(664, 390, 844)).toBe(Math.ceil(844 * 1.6));
    expect(stripesHeight(340, 844, 390)).toBe(Math.ceil(844 * 1.6));
  });
  it("doesn't depend on the current visible height once the screen is taller", () => {
    expect(stripesHeight(600, 390, 844)).toBe(stripesHeight(700, 390, 844));
  });
});

describe("keyboardHeight", () => {
  it("is the height the keyboard took", () => {
    expect(keyboardHeight(664, 330)).toBe(334);
  });
  it("ignores a browser bar sliding (less than KEYBOARD_MIN)", () => {
    expect(keyboardHeight(664, 664 - (KEYBOARD_MIN - 1))).toBe(0);
  });
  it("is 0 with no keyboard", () => {
    expect(keyboardHeight(664, 664)).toBe(0);
  });
});

describe("scrollDelta", () => {
  it("puts the Join button just above the keyboard when the field and button fit", () => {
    // Email at 380, button bottom at 590, 330 visible: scroll until the button is at 314.
    expect(scrollDelta({ fieldTop: 380, actionBottom: 590, viewHeight: 330 })).toBe(590 - (330 - MARGIN));
  });
  it("scrolls up when there is room to show more above", () => {
    expect(scrollDelta({ fieldTop: 40, actionBottom: 200, viewHeight: 330 })).toBeLessThan(0);
  });
  it("puts the field at the top when the field and button don't both fit", () => {
    expect(scrollDelta({ fieldTop: 380, actionBottom: 700, viewHeight: 200 })).toBe(380 - MARGIN);
  });
});
