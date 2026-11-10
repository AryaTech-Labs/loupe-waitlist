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
// - The face (finish, track, batons, day-date) is drawn once into an image and
//   kept; a beat only redraws what moves. Beats are timed to the clock, not to
//   the screen's refresh, so the page wakes eight times a second, not 120.
// - Nothing is drawn while the tab is hidden or the dial is off screen.
// - Reduce Motion: the face is redrawn once at each new minute.
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

/** Milliseconds from `ms` to the next beat, plus a hair so the wake-up lands on it. */
export function msToNextBeat(ms) {
  return BEAT_MS - (ms % BEAT_MS) + 1;
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

export function startDial(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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

  /** The dial at `ms`: the kept face, then the tourbillon and hands over it. */
  const paint = (ms) => {
    const date = new Date(ms);
    const image = faceFor(date);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDialMovement(ctx, size, date, palette);
    canvas.dataset.time = String(ms);
  };

  const now = () => (reduceMotion.matches ? Date.now() : beatTime(Date.now()));

  // Wake at the next beat (or minute), then draw on the frame after it.
  const schedule = () => {
    const wait = reduceMotion.matches ? msToNextMinute(Date.now()) : msToNextBeat(Date.now());
    timer = setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint(now());
        schedule();
      });
    }, wait);
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
    paint(now());
    schedule();
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
  window.addEventListener("resize", () => {
    // The dial is sized by svh, so browser bars and pinch-zoom leave it be;
    // browser zoom changes the pixel ratio, and the dial is drawn sharp again.
    const width = canvas.getBoundingClientRect().width || 200;
    if (width === size && (window.devicePixelRatio || 1) === dpr) return;
    resize();
    run();
  });
  reduceMotion.addEventListener("change", run);
  reduceTransparency.addEventListener("change", refresh);
  moreContrast.addEventListener("change", refresh);
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
