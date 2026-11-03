// The app's Welcome artwork, as loupe-web draws it (src/components/guilloche-watch.tsx):
// a live guilloché dial that tells the real time over Côtes de Genève stripes.
// Twenty redraws a second; once a minute with Reduce Motion; a flat face with
// Reduce Transparency or Increase Contrast. Both canvases are decorative.
import { drawDial, drawGenevaStripes } from "./vendor/guilloche.js";
import { fallsBackToPlain } from "./vendor/finish.js";

const SWEEP_MS = 50;
const STILL_MS = 60_000;

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
  let timer = null;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    size = canvas.getBoundingClientRect().width || 200;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = () => {
    const drawsFinish = !fallsBackToPlain(reduceTransparency.matches, moreContrast.matches);
    drawDial(ctx, size, new Date(), palette, drawsFinish, TYPEFACES);
  };
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(draw, reduceMotion.matches ? STILL_MS : SWEEP_MS);
    draw();
  };

  resize();
  schedule();
  document.fonts?.ready.then(draw).catch(() => {});
  onSchemeChange(() => {
    palette = tokens();
    draw();
  });
  window.addEventListener("resize", () => {
    resize();
    draw();
  });
  reduceMotion.addEventListener("change", schedule);
  reduceTransparency.addEventListener("change", draw);
  moreContrast.addEventListener("change", draw);
}

export function startStripes(canvas) {
  let frame = 0;
  const render = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGenevaStripes(ctx, w, h, tokens());
    });
  };
  render();
  window.addEventListener("resize", render);
  onSchemeChange(render);
}
