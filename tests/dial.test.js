import { describe, expect, test } from "vitest";

// dial.js imports the canvas drawing code, which only touches the DOM when called.
const {
  BALANCE_AMPLITUDE,
  BALANCE_PERIOD_MS,
  BEATS_PER_SECOND,
  BEAT_MS,
  balanceAngle,
  balanceExposure,
  beatTime,
  faceKey,
  msToNextMinute,
  smoothClock,
  stripesScale,
} = await import("../src/dial.js");
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

  test("the balance passes through rest on every beat, as the cage ticks, swinging 4 times a second", () => {
    expect(BALANCE_PERIOD_MS).toBe(250);
    const beat = beatTime(new Date(2026, 10, 10, 10, 8, 30, 600).getTime());
    for (let k = 0; k < 8; k++) expect(Math.abs(balanceAngle(beat + k * BEAT_MS))).toBeLessThan(1e-9);
    // Out to full swing midway between beats, one way then the other.
    const a = balanceAngle(beat + BEAT_MS / 2);
    const b = balanceAngle(beat + BEAT_MS + BEAT_MS / 2);
    expect(Math.abs(a)).toBeCloseTo(BALANCE_AMPLITUDE);
    expect(b).toBeCloseTo(-a);
    expect(balanceAngle(beat + 31, 0)).toBe(0);
  });

  test("each frame shows one 60 Hz exposure of the swing; a still balance is one sharp angle", () => {
    const at = 1_000_000 + 40;
    const frame = balanceExposure(at);
    expect(frame).toHaveLength(6);
    expect(frame[0]).toBe(balanceAngle(at));
    expect(frame[5]).toBeCloseTo(balanceAngle(at - (5 / 6) * (1000 / 60)));
    expect(balanceExposure(at, 0)).toEqual([0]);
  });

  test("the smooth clock is the device clock, and follows it when it's set", () => {
    let wall = 1_000_000;
    let mono = 500;
    const clock = smoothClock(() => wall, () => mono);
    expect(clock(500)).toBe(1_000_000);
    expect(clock(516.7)).toBeCloseTo(1_000_016.7);
    // The device clock jumps an hour ahead: the next frame follows.
    wall += 3_600_000;
    expect(clock(500)).toBe(4_600_000);
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
