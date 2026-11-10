// The app's Welcome artwork, as loupe-web draws it (src/components/guilloche-watch.tsx):
// a live guilloché dial that tells the visitor's own time over Côtes de Genève
// stripes, with a seconds hand of our own on top.
//
// - The time is the device's clock (`new Date()`, its local time zone), read
//   afresh on every frame, so it is right after sleep, a hidden tab or a time
//   zone change.
// - The seconds hand beats eight times a second, as a 28,800 bph movement does;
//   the dial redraws only on a beat. On load it sweeps up from 12 to the time.
// - Nothing is drawn while the tab is hidden or the dial is off screen.
// - Reduce Motion: no seconds hand, one redraw at each new minute.
// - Reduce Transparency / Increase Contrast: a flat face.
// Both canvases are decorative.
import { drawDial, drawGenevaStripes, handAngles } from "./vendor/guilloche.js";
import { fallsBackToPlain } from "./vendor/finish.js";

/** 28,800 bph: eight beats a second. */
export const BEATS_PER_SECOND = 8;
const BEAT_MS = 1000 / BEATS_PER_SECOND;
export const INTRO_MS = 1100;

/** The instant of the last beat at or before `ms` (epoch ms). */
export function beatTime(ms) {
  return Math.floor(ms / BEAT_MS) * BEAT_MS;
}

/** Ease-out cubic, 0…1. */
export function easeOut(p) {
  const t = Math.min(1, Math.max(0, p));
  return 1 - (1 - t) ** 3;
}

/** The seconds hand during the opening sweep: from 12 up to the live angle. */
export function introSecondAngle(liveAngle, elapsedMs) {
  return liveAngle * easeOut(elapsedMs / INTRO_MS);
}

/** Milliseconds from `ms` to the start of the next minute (plus a hair, so the redraw lands in it). */
export function msToNextMinute(ms) {
  return 60_000 - (ms % 60_000) + 20;
}

/**
 * The seconds hand, in the dial's 100-unit space: a slim red hand with a
 * counterweight tail, over the hour and minute hands, under its own cap.
 */
export function drawSecondsHand(ctx, size, degrees, t) {
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.translate(50, 50);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.fillStyle = t.error;
  ctx.beginPath();
  ctx.moveTo(-0.32, 9);
  ctx.lineTo(-0.22, -35.5);
  ctx.lineTo(0.22, -35.5);
  ctx.lineTo(0.32, 9);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 6.4, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.surface;
  ctx.beginPath();
  ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
  let frame = 0;
  let minuteTimer = 0;
  let lastBeat = -1;
  let introStart = reduceMotion.matches ? null : performance.now();
  let onScreen = true;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    size = canvas.getBoundingClientRect().width || 200;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /** Draws the dial at `ms`; the seconds hand at `secondsAngle`, or none. */
  const paint = (ms, secondsAngle) => {
    const drawsFinish = !fallsBackToPlain(reduceTransparency.matches, moreContrast.matches);
    drawDial(ctx, size, new Date(ms), palette, drawsFinish, TYPEFACES);
    if (secondsAngle !== null) drawSecondsHand(ctx, size, secondsAngle, palette);
    canvas.dataset.time = String(ms);
  };

  const tick = () => {
    frame = 0;
    const beat = beatTime(Date.now());
    const live = handAngles(new Date(beat)).second;
    if (introStart !== null) {
      const elapsed = performance.now() - introStart;
      paint(beat, introSecondAngle(live, elapsed));
      if (elapsed >= INTRO_MS) introStart = null;
      lastBeat = beat;
    } else if (beat !== lastBeat) {
      paint(beat, live);
      lastBeat = beat;
    }
    frame = requestAnimationFrame(tick);
  };

  /** Reduce Motion: the minute's face, redrawn as each new minute begins. */
  const stillMinute = () => {
    paint(Date.now(), null);
    minuteTimer = setTimeout(stillMinute, msToNextMinute(Date.now()));
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(minuteTimer);
    frame = 0;
    minuteTimer = 0;
  };

  const run = () => {
    stop();
    if (document.hidden || !onScreen) return;
    lastBeat = -1;
    if (reduceMotion.matches) stillMinute();
    else tick();
  };

  const redraw = () => {
    lastBeat = -1;
    if (reduceMotion.matches) paint(Date.now(), null);
    else if (!frame) paint(beatTime(Date.now()), handAngles(new Date(beatTime(Date.now()))).second);
  };

  resize();
  run();
  // A frame for anything that reads the canvas before the first animation frame.
  if (!reduceMotion.matches) paint(beatTime(Date.now()), 0);
  document.fonts?.ready.then(redraw).catch(() => {});
  document.addEventListener("visibilitychange", run);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      run();
    }).observe(canvas);
  }
  onSchemeChange(() => {
    palette = tokens();
    redraw();
  });
  window.addEventListener("resize", () => {
    // The dial is sized by svh, so browser bars moving don't change it.
    if ((canvas.getBoundingClientRect().width || 200) === size) return;
    resize();
    redraw();
  });
  reduceMotion.addEventListener("change", () => {
    introStart = null;
    run();
  });
  reduceTransparency.addEventListener("change", redraw);
  moreContrast.addEventListener("change", redraw);
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

export function startStripes(canvas) {
  let frame = 0;
  let drawnWidth = 0;
  const height = stripesHeight(window.innerHeight, window.screen.width, window.screen.height);
  const render = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      drawnWidth = w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGenevaStripes(ctx, w, height, tokens());
    });
  };
  render();
  // Only a new width (rotation) redraws; height changes never do.
  window.addEventListener("resize", () => {
    if (window.innerWidth !== drawnWidth) render();
  });
  onSchemeChange(render);
}
