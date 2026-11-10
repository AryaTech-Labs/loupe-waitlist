import { describe, expect, test } from "vitest";

// dial.js imports the canvas drawing code, which only touches the DOM when called.
const { BEATS_PER_SECOND, INTRO_MS, beatTime, easeOut, introSecondAngle, msToNextMinute } = await import("../src/dial.js");
const { handAngles } = await import("../src/vendor/guilloche.js");

describe("the live dial", () => {
  test("tells the device's own local time", () => {
    // 10:08:30 local, whatever the zone: hour 304.25°, minute 51°, second 180°.
    const at = new Date(2026, 10, 10, 10, 8, 30);
    expect(handAngles(at)).toEqual({ hour: 304.25, minute: 51, second: 180 });
    expect(handAngles(new Date(2026, 10, 10, 0, 0, 0))).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(handAngles(new Date(2026, 10, 10, 12, 35, 0)).hour).toBeCloseTo(17.5);
  });

  test("the seconds hand beats 8 times a second (28,800 bph)", () => {
    expect(BEATS_PER_SECOND).toBe(8);
    expect(beatTime(1_000)).toBe(1_000);
    expect(beatTime(1_124)).toBe(1_000);
    expect(beatTime(1_125)).toBe(1_125);
    const beat = beatTime(new Date(2026, 10, 10, 9, 0, 15, 300).getTime());
    expect(handAngles(new Date(beat)).second).toBeCloseTo(15.25 * 6);
  });

  test("on load the seconds hand sweeps up from 12 and lands on the time", () => {
    expect(introSecondAngle(180, 0)).toBe(0);
    expect(introSecondAngle(180, INTRO_MS)).toBe(180);
    expect(introSecondAngle(180, INTRO_MS * 2)).toBe(180);
    expect(introSecondAngle(180, INTRO_MS / 2)).toBeGreaterThan(90);
    expect(easeOut(-1)).toBe(0);
  });

  test("Reduce Motion redraws as each new minute begins", () => {
    expect(msToNextMinute(60_000 * 5)).toBe(60_020);
    expect(msToNextMinute(60_000 * 5 + 59_000)).toBe(1_020);
  });
});
