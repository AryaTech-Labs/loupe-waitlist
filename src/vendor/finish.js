// Vendored from AryaTech-Labs/loupe-web src/lib/finish.ts @ ca238d3 (transpiled with tsc, unchanged otherwise).
// The dial is the one on the app's Welcome screen; keep it in step with the app.
// Background finish (REDESIGN_DIRECTION_C.md §4.25): WASFinish,
// WASFinishGeometry and WASFinishDrawer ported to a 2D canvas. Geometry is in
// CSS pixels (iOS points) and never scales with the screen; colours are the
// three tokens (background, finish highlight, finish shadow) with every alpha
// multiplied by one strength.
export const FINISHES = [
    { value: "plain", label: "Plain" },
    { value: "geneva", label: "Geneva Stripes" },
    { value: "perlage", label: "Perlage" },
    { value: "clous", label: "Clous de Paris" },
    { value: "brushed", label: "Brushed" },
];
/** AppearanceService.finishKey — device-local, kept through sign-out. */
export const FINISH_STORAGE_KEY = "appearance.finish";
export const FINISH_STRENGTH = 0.25;
export function isFinish(value) {
    return FINISHES.some((f) => f.value === value);
}
/** A missing or unknown stored value reads as Plain. */
export function readFinish() {
    try {
        const stored = localStorage.getItem(FINISH_STORAGE_KEY);
        return isFinish(stored) ? stored : "plain";
    }
    catch {
        return "plain";
    }
}
export function writeFinish(finish) {
    try {
        localStorage.setItem(FINISH_STORAGE_KEY, finish);
    }
    catch {
        // Per-device convenience only.
    }
}
/** WASFinish.fallsBackToPlain: Reduce Transparency or Increase Contrast. */
export function fallsBackToPlain(reduceTransparency, increasedContrast) {
    return reduceTransparency || increasedContrast;
}
const H = (alpha) => ({ token: "highlight", alpha });
const S = (alpha) => ({ token: "shadow", alpha });
export const GENEVA_PERIOD = 36;
export const GENEVA_AXIS_DEGREES = 30;
export const GENEVA_STOPS = [
    { position: 0, ink: S(0.8) },
    { position: 10, ink: S(0.15) },
    { position: 22, ink: H(0.45) },
    { position: 29, ink: H(1) },
    { position: 31, ink: S(0.9) },
    { position: 36, ink: S(0.8) },
];
export const PERLAGE_DIAMETER = 36;
export const PERLAGE_PITCH = 23;
const PERLAGE_RIM_WIDTH = 1;
const PERLAGE_RIM_INK = S(1);
const PERLAGE_RING_SPACING = 2.2;
const PERLAGE_RING_WIDTH = 0.6;
const PERLAGE_RING_INK = H(0.35);
const PERLAGE_FACE_STOPS = [
    { position: 0, ink: H(1) },
    { position: 0.25, ink: S(0.85) },
    { position: 0.5, ink: H(1) },
    { position: 0.75, ink: S(0.85) },
    { position: 1, ink: H(1) },
];
export function perlageRingRadii() {
    const out = [];
    for (let r = 0; r < PERLAGE_DIAMETER / 2 - PERLAGE_RIM_WIDTH; r += PERLAGE_RING_SPACING) {
        out.push(r + PERLAGE_RING_WIDTH / 2);
    }
    return out;
}
/** 15 + (k × 37 mod 31) for the k-th disc drawn. */
export function perlageStartDegrees(index) {
    return 15 + ((index * 37) % 31);
}
/** Rows top to bottom, each row left to right, odd rows shifted half a pitch, columns from −1. */
export function perlageDiscs(width, height) {
    const discs = [];
    let index = 0;
    for (let row = 0; row * PERLAGE_PITCH < height + PERLAGE_DIAMETER; row++) {
        const shift = row % 2 === 0 ? 0 : PERLAGE_PITCH / 2;
        for (let column = -1; column * PERLAGE_PITCH + shift < width + PERLAGE_DIAMETER; column++) {
            discs.push({ x: column * PERLAGE_PITCH + shift, y: row * PERLAGE_PITCH, startDegrees: perlageStartDegrees(index) });
            index++;
        }
    }
    return discs;
}
export const CLOUS_TILE = 18;
const CLOUS_ROTATION_DEGREES = 45;
const CLOUS_FIELD_HALF_SIDE = 500;
const CLOUS_GROOVE_WIDTH = 1;
const CLOUS_GROOVE_INK = S(1);
const CLOUS_SIDES = ["top", "right", "bottom", "left"];
const CLOUS_INK = { top: H(1), right: S(0.35), bottom: S(0.9), left: H(0.4) };
/** The tile indices, on both axes, that cover the screen turned about its centre. */
export function clousTileIndices(width, height) {
    const reach = Math.hypot(width, height) / 2;
    const first = Math.floor((CLOUS_FIELD_HALF_SIDE - reach) / CLOUS_TILE);
    const last = Math.ceil((CLOUS_FIELD_HALF_SIDE + reach) / CLOUS_TILE) - 1;
    return { first, last: Math.max(first, last) };
}
function clousOrigin(column, row) {
    return { x: column * CLOUS_TILE - CLOUS_FIELD_HALF_SIDE, y: row * CLOUS_TILE - CLOUS_FIELD_HALF_SIDE };
}
function clousFacet(side, ox, oy) {
    const maxX = ox + CLOUS_TILE;
    const maxY = oy + CLOUS_TILE;
    const c = [ox + CLOUS_TILE / 2, oy + CLOUS_TILE / 2];
    switch (side) {
        case "top":
            return [[ox, oy], [maxX, oy], c];
        case "right":
            return [[maxX, oy], [maxX, maxY], c];
        case "bottom":
            return [[maxX, maxY], [ox, maxY], c];
        case "left":
            return [[ox, maxY], [ox, oy], c];
    }
}
const BRUSHED_LINE_WIDTH = 1;
const BRUSHED_FAMILIES = [
    { ink: S(0.3), pitch: 2 },
    { ink: H(0.35), pitch: 3 },
    { ink: S(0.4), pitch: 5 },
    { ink: H(0.5), pitch: 7 },
    { ink: S(0.5), pitch: 9 },
    { ink: H(0.55), pitch: 11 },
    { ink: S(0.6), pitch: 13 },
    { ink: H(0.7), pitch: 17 },
    { ink: S(0.6), pitch: 19 },
    { ink: H(0.8), pitch: 23 },
    { ink: S(0.75), pitch: 29 },
    { ink: H(0.7), pitch: 31 },
    { ink: S(0.8), pitch: 37 },
    { ink: H(0.9), pitch: 41 },
    { ink: S(0.7), pitch: 53 },
    { ink: H(0.85), pitch: 61 },
];
const BRUSHED_SHEEN = [
    { position: 0, ink: S(0.5) },
    { position: 0.32, ink: H(0.8) },
    { position: 0.58, ink: S(0.35) },
    { position: 0.82, ink: H(0.6) },
    { position: 1, ink: S(0.5) },
];
const BRUSHED_FALL = [
    { position: 0, ink: H(0.3) },
    { position: 0.4, ink: H(0) },
    { position: 0.4, ink: S(0) },
    { position: 1, ink: S(0.3) },
];
/** Each line's x across the width: the first at ⌊pitch / 2⌋. */
export function brushedLineOffsets(pitch, width) {
    if (pitch <= 0 || width <= 0)
        return [];
    const out = [];
    for (let x = Math.floor(pitch / 2); x < width; x += pitch)
        out.push(x);
    return out;
}
/** "#rrggbb" (or "#rgb") → "rgba(r,g,b,a)". */
export function withAlpha(hex, alpha) {
    let h = hex.trim().replace("#", "");
    if (h.length === 3)
        h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Number(a.toFixed(4))})`;
}
export function inkColor(palette, ink) {
    return withAlpha(ink.token === "highlight" ? palette.highlight : palette.shadow, ink.alpha * palette.strength);
}
function addStops(gradient, palette, stops, span = 1) {
    for (const s of stops)
        gradient.addColorStop(Math.min(1, Math.max(0, s.position / span)), inkColor(palette, s.ink));
}
export function drawFinish(ctx, finish, width, height, palette) {
    ctx.save();
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, width, height);
    if (finish === "geneva")
        drawGeneva(ctx, width, height, palette);
    if (finish === "perlage")
        drawPerlage(ctx, width, height, palette);
    if (finish === "clous")
        drawClous(ctx, width, height, palette);
    if (finish === "brushed")
        drawBrushed(ctx, width, height, palette);
    ctx.restore();
}
function drawGeneva(ctx, w, h, palette) {
    const rad = (GENEVA_AXIS_DEGREES * Math.PI) / 180;
    const extent = w * Math.cos(rad) + h * Math.sin(rad);
    const top = -w * Math.sin(rad);
    const span = h * Math.cos(rad) - top;
    ctx.save();
    ctx.rotate(rad);
    for (let start = 0; start < extent; start += GENEVA_PERIOD) {
        const g = ctx.createLinearGradient(start, 0, start + GENEVA_PERIOD, 0);
        addStops(g, palette, GENEVA_STOPS, GENEVA_PERIOD);
        ctx.fillStyle = g;
        ctx.fillRect(start, top, GENEVA_PERIOD, span);
    }
    ctx.restore();
}
function circle(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
}
function drawPerlage(ctx, w, h, palette) {
    const radius = PERLAGE_DIAMETER / 2;
    const rings = perlageRingRadii();
    const ringColor = inkColor(palette, PERLAGE_RING_INK);
    const rimColor = inkColor(palette, PERLAGE_RIM_INK);
    for (const disc of perlageDiscs(w, h)) {
        ctx.save();
        ctx.translate(disc.x, disc.y);
        // The base first, so the disc hides the ones it overlaps.
        circle(ctx, radius);
        ctx.fillStyle = palette.base;
        ctx.fill();
        // Canvas, like SwiftUI, measures a conic angle from the x axis; the spec's is from straight up.
        const g = ctx.createConicGradient(((disc.startDegrees - 90) * Math.PI) / 180, 0, 0);
        addStops(g, palette, PERLAGE_FACE_STOPS);
        circle(ctx, radius - PERLAGE_RIM_WIDTH);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = PERLAGE_RING_WIDTH;
        ctx.strokeStyle = ringColor;
        for (const r of rings) {
            circle(ctx, r);
            ctx.stroke();
        }
        ctx.lineWidth = PERLAGE_RIM_WIDTH;
        ctx.strokeStyle = rimColor;
        circle(ctx, radius - PERLAGE_RIM_WIDTH / 2);
        ctx.stroke();
        ctx.restore();
    }
}
function drawClous(ctx, w, h, palette) {
    const { first, last } = clousTileIndices(w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((CLOUS_ROTATION_DEGREES * Math.PI) / 180);
    for (const side of CLOUS_SIDES) {
        ctx.beginPath();
        for (let row = first; row <= last; row++) {
            for (let column = first; column <= last; column++) {
                const o = clousOrigin(column, row);
                const [a, b, c] = clousFacet(side, o.x, o.y);
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.lineTo(c[0], c[1]);
                ctx.closePath();
            }
        }
        ctx.fillStyle = inkColor(palette, CLOUS_INK[side]);
        ctx.fill();
    }
    const start = clousOrigin(first, first);
    const span = (last - first + 1) * CLOUS_TILE;
    ctx.fillStyle = inkColor(palette, CLOUS_GROOVE_INK);
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
        ctx.rect(clousOrigin(i, i).x, start.y, CLOUS_GROOVE_WIDTH, span);
    }
    ctx.fill();
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
        ctx.rect(start.x, clousOrigin(i, i).y + CLOUS_TILE - CLOUS_GROOVE_WIDTH, span, CLOUS_GROOVE_WIDTH);
    }
    ctx.fill();
    ctx.restore();
}
function drawBrushed(ctx, w, h, palette) {
    const sheen = ctx.createLinearGradient(0, 0, w, 0);
    addStops(sheen, palette, BRUSHED_SHEEN);
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    const fall = ctx.createLinearGradient(0, 0, 0, h);
    addStops(fall, palette, BRUSHED_FALL);
    ctx.fillStyle = fall;
    ctx.fillRect(0, 0, w, h);
    for (const family of [...BRUSHED_FAMILIES].reverse()) {
        ctx.beginPath();
        for (const x of brushedLineOffsets(family.pitch, w))
            ctx.rect(x, 0, BRUSHED_LINE_WIDTH, h);
        ctx.fillStyle = inkColor(palette, family.ink);
        ctx.fill();
    }
}
