// The app's Welcome artwork, as loupe-web draws it (src/components/guilloche-watch.tsx):
// a live guilloché dial that tells the visitor's own time over Côtes de Genève
// stripes.
//
// - The time is the device's clock (`new Date()`, its local time zone), read
//   afresh at every beat, so it is right after sleep, a hidden tab or a time
//   zone change. The day-date turns over at the visitor's midnight.
// - The tourbillon is the seconds: its cage turns once a minute, the cage's
//   first arm at 12 on the minute. Like a 28,800 bph movement it advances in
//   eight beats a second, and the hands move with it.
// - Inside the cage the balance wheel swings four times a second and passes
//   through its centre on every beat, as it does when it releases the
//   escapement: the cage ticks at the instant the balance crosses. It moves
//   every frame, on a sub-millisecond copy of the device clock, with one
//   frame's motion blur so it reads as a swing, not a flicker.
// - The face (finish, track, batons, day-date) is drawn once into an image and
//   kept; a frame only redraws what moves (well under a millisecond).
// - Nothing is drawn while the tab is hidden or the dial is off screen.
// - Reduce Motion: the balance is still and the face is redrawn once at each
//   new minute.
// - Reduce Transparency / Increase Contrast: a flat face.
// Both canvases are decorative.
import { dayDate, drawDialFace, drawDialMovement, drawGenevaStripes } from "./vendor/guilloche.js";
import { fallsBackToPlain } from "./vendor/finish.js";

/** 28,800 bph: eight beats a second. */
export const BEATS_PER_SECOND = 8;
export const BEAT_MS = 1000 / BEATS_PER_SECOND;

/** The instant of the last beat at or before `ms` (epoch ms). */
export function beatTime(ms) {
  return Math.floor(ms / BEAT_MS) * BEAT_MS;
}

/** A full swing of the balance, there and back: two beats (4 Hz). */
export const BALANCE_PERIOD_MS = 2 * BEAT_MS;
/** How far the balance swings each way from rest, in degrees. */
export const BALANCE_AMPLITUDE = 120;
/** One 60 Hz frame's exposure, sampled this many times for the motion blur. */
const EXPOSURE_MS = 1000 / 60;
const EXPOSURE_SAMPLES = 6;

/** The balance's swing at `ms` (epoch ms): at rest on every beat, out to ±amplitude between. */
export function balanceAngle(ms, amplitude = BALANCE_AMPLITUDE) {
  const phase = (((ms % BALANCE_PERIOD_MS) + BALANCE_PERIOD_MS) % BALANCE_PERIOD_MS) / BALANCE_PERIOD_MS;
  return amplitude * Math.sin(2 * Math.PI * phase);
}

/** The swing across the frame ending at `ms` (a 60 Hz shutter), for the motion blur. */
export function balanceExposure(ms, amplitude = BALANCE_AMPLITUDE, samples = EXPOSURE_SAMPLES) {
  if (!amplitude) return [0];
  return Array.from({ length: samples }, (_, i) => balanceAngle(ms - (i * EXPOSURE_MS) / samples, amplitude));
}

/**
 * The device's wall-clock time at a frame, with the frame clock's smoothness:
 * Date.now() alone ticks in whole milliseconds (coarser in some browsers), and
 * that jitter would shake a balance moving at hundreds of degrees a second.
 * Follows the device clock if it's set or drifts by more than 50 ms.
 */
export function smoothClock(wallNow = () => Date.now(), monoNow = () => performance.now()) {
  let offset = wallNow() - monoNow();
  return (frameTime) => {
    if (Math.abs(wallNow() - (monoNow() + offset)) > 50) offset = wallNow() - monoNow();
    return frameTime + offset;
  };
}

/** Milliseconds from `ms` to the start of the next minute (plus a hair, so the redraw lands in it). */
export function msToNextMinute(ms) {
  return 60_000 - (ms % 60_000) + 20;
}

/** What the kept face depends on, besides size and palette: the day-date. */
export function faceKey(date) {
  const { day, date: num } = dayDate(date);
  return `${day} ${num}`;
}

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--was-background", "#f2f3f5"),
    surface: v("--was-surface", "#ffffff"),
    elevated: v("--was-elevated", "#e6e8ec"),
    hairline: v("--was-hairline", "#e6e8ec"),
    primary: v("--was-primary-text", "#15181d"),
    secondary: v("--was-secondary-text", "#5a6170"),
    accent: v("--was-accent", "#2f5d8a"),
    error: v("--was-error", "#b42318"),
    finishHighlight: v("--was-finish-highlight", "#ffffff"),
    finishShadow: v("--was-finish-shadow", "#dbdde1"),
  };
}

const TYPEFACES = { sans: '"Geist", system-ui, sans-serif', mono: '"Geist Mono", ui-monospace, monospace' };
/** Canvas text never asks for a web font itself, so the dial's two are asked for here. */
const DIAL_FONTS = ['500 4px "Geist Mono"', '600 3px "Geist"'];

function onSchemeChange(callback) {
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", callback);
}

/** Starts the live dial. `amplitude`: the balance's swing each way (0 holds it still, as in the app). */
export function startDial(canvas, { amplitude = BALANCE_AMPLITUDE } = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduceTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
  const moreContrast = window.matchMedia("(prefers-contrast: more)");
  let palette = tokens();
  let size = 0;
  let dpr = 1;
  let face = null; // { image, key }
  let timer = 0;
  let frame = 0;
  let onScreen = true;

  const resize = () => {
    dpr = window.devicePixelRatio || 1;
    size = canvas.getBoundingClientRect().width || 200;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    face = null;
  };

  /** The still face for `date`'s day, drawn once and kept. */
  const faceFor = (date) => {
    const key = faceKey(date);
    if (face?.key === key) return face.image;
    const image = document.createElement("canvas");
    image.width = canvas.width;
    image.height = canvas.height;
    const g = image.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const drawsFinish = !fallsBackToPlain(reduceTransparency.matches, moreContrast.matches);
    drawDialFace(g, size, date, palette, drawsFinish, TYPEFACES);
    face = { image, key };
    return image;
  };

  /**
   * The dial at `shown` (the instant its hands and tourbillon show: a beat, or
   * any moment under Reduce Motion), the balance at `balance` degrees.
   */
  const paint = (shown, balance) => {
    const date = new Date(shown);
    const image = faceFor(date);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDialMovement(ctx, size, date, palette, balance);
    const stamp = String(shown);
    if (canvas.dataset.time !== stamp) canvas.dataset.time = stamp;
  };

  let clock = smoothClock();

  /** One frame: the cage and hands on the last beat, the balance exactly where it is now. */
  const animate = (frameTime) => {
    frame = requestAnimationFrame(animate);
    const ms = clock(frameTime);
    paint(beatTime(ms), balanceExposure(ms, amplitude));
  };

  /** Reduce Motion: the minute's face, redrawn as each new minute begins. */
  const stillMinute = () => {
    paint(Date.now(), [0]);
    timer = setTimeout(stillMinute, msToNextMinute(Date.now()));
  };

  const stop = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
  };

  const run = () => {
    stop();
    if (document.hidden || !onScreen) return;
    if (reduceMotion.matches) return stillMinute();
    clock = smoothClock();
    animate(performance.now());
  };

  /** Something the face depends on changed: draw it again. */
  const refresh = () => {
    face = null;
    run();
  };

  resize();
  run();
  if (document.fonts) Promise.all(DIAL_FONTS.map((f) => document.fonts.load(f))).then(refresh, () => {});
  document.addEventListener("visibilitychange", run);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible === onScreen) return;
      onScreen = visible;
      run();
    }).observe(canvas);
  }
  onSchemeChange(() => {
    palette = tokens();
    refresh();
  });
  // On phones the dial takes the screen's spare height, so the layout sets its
  // size (and can change it: rotation, the fonts settling). Browser zoom
  // changes the pixel ratio. Either way it is drawn sharp at its new size;
  // browser bars, the keyboard and pinch-zoom leave it as it is.
  const fit = () => {
    const width = canvas.getBoundingClientRect().width || 200;
    if (width === size && (window.devicePixelRatio || 1) === dpr) return;
    resize();
    run();
  };
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(canvas);
  window.addEventListener("resize", fit);
  reduceMotion.addEventListener("change", run);
  reduceTransparency.addEventListener("change", refresh);
  moreContrast.addEventListener("change", refresh);
  return {
    /** A new swing, from the next frame. */
    setAmplitude(degrees) {
      amplitude = degrees;
    },
  };
}

/**
 * The stripes' height, fixed for the life of the page. They're drawn rotated
 * about the canvas centre, so a redraw at a new height (Safari's bars hiding
 * when the keyboard opens) would visibly slide them; one tall drawing, clipped
 * by its .backdrop, covers the page and the keyboard's extra room without ever
 * redrawing.
 */
export function stripesHeight(innerHeight, screenWidth, screenHeight) {
  return Math.ceil(Math.max(innerHeight, screenWidth, screenHeight) * 1.6);
}

/**
 * Pixels per CSS px for the stripes. They're soft ramps, so past 2x nothing
 * shows but memory: a 3x phone would spend 23 MB on them instead of 10.
 */
export function stripesScale(devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, 2);
}

export function startStripes(canvas) {
  let frame = 0;
  let drawn = "";
  const height = stripesHeight(window.innerHeight, window.screen.width, window.screen.height);
  // The page's own width (the layout viewport). Not innerWidth: Safari on
  // iPhone shrinks that while pinch-zoomed, and stripes redrawn to it would
  // stop short of the edge once zoomed back out.
  const width = () => canvas.parentElement?.clientWidth || document.documentElement.clientWidth || window.innerWidth;
  const key = () => `${width()}@${stripesScale(window.devicePixelRatio)}`;
  const render = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = stripesScale(window.devicePixelRatio);
      const w = width();
      drawn = key();
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(height * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawGenevaStripes(ctx, w, height, tokens());
    });
  };
  render();
  // Only a new page width (rotation) or browser zoom redraws; height changes never do.
  window.addEventListener("resize", () => {
    if (key() !== drawn) render();
  });
  onSchemeChange(render);
}
