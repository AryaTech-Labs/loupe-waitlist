import { describe, expect, test } from "vitest";

// dial.js imports the canvas drawing code, which only touches the DOM when called.
const { BEATS_PER_SECOND, BEAT_MS, beatTime, faceKey, msToNextBeat, msToNextMinute, stripesScale } = await import(
  "../src/dial.js"
);
const { handAngles } = await import("../src/vendor/guilloche.js");

describe("the live dial", () => {
  test("tells the device's own local time", () => {
    // 10:08:30 local, whatever the zone: hour 304.25°, minute 51°, tourbillon 180°.
    const at = new Date(2026, 10, 10, 10, 8, 30);
    expect(handAngles(at)).toEqual({ hour: 304.25, minute: 51, second: 180 });
    expect(handAngles(new Date(2026, 10, 10, 0, 0, 0))).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(handAngles(new Date(2026, 10, 10, 12, 35, 0)).hour).toBeCloseTo(17.5);
  });

  test("the tourbillon turns once a minute in eight beats a second (28,800 bph)", () => {
    expect(BEATS_PER_SECOND).toBe(8);
    expect(BEAT_MS).toBe(125);
    expect(beatTime(1_000)).toBe(1_000);
    expect(beatTime(1_124)).toBe(1_000);
    expect(beatTime(1_125)).toBe(1_125);
    // 0.75° a beat; on the minute, back at 12.
    const beat = beatTime(new Date(2026, 10, 10, 9, 0, 15, 300).getTime());
    expect(handAngles(new Date(beat)).second).toBeCloseTo(15.25 * 6);
    expect(handAngles(new Date(beatTime(Date.UTC(2026, 10, 10, 9, 1, 0, 60)))).second).toBe(0);
  });

  test("wakes just after each beat, never before it", () => {
    expect(msToNextBeat(1_000)).toBe(126);
    expect(msToNextBeat(1_124)).toBe(2);
    for (const ms of [5, 61, 124, 999_937]) expect(beatTime(ms + msToNextBeat(ms))).toBe(beatTime(ms) + BEAT_MS);
  });

  test("Reduce Motion redraws as each new minute begins", () => {
    expect(msToNextMinute(60_000 * 5)).toBe(60_020);
    expect(msToNextMinute(60_000 * 5 + 59_000)).toBe(1_020);
  });

  test("the kept face is redrawn when the day-date turns over at local midnight", () => {
    expect(faceKey(new Date(2026, 10, 10, 23, 59, 59, 875))).toBe("TUE 10");
    expect(faceKey(new Date(2026, 10, 11, 0, 0, 0))).toBe("WED 11");
    expect(faceKey(new Date(2026, 10, 10, 8))).toBe(faceKey(new Date(2026, 10, 10, 20)));
  });
});

describe("the stripes", () => {
  test("are drawn at up to 2x: soft ramps show nothing more at 3x, only cost memory", () => {
    expect(stripesScale(1)).toBe(1);
    expect(stripesScale(2)).toBe(2);
    expect(stripesScale(3)).toBe(2);
    expect(stripesScale(1.5)).toBe(1.5);
    expect(stripesScale(undefined)).toBe(1);
  });
});
