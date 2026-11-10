// Vendored from AryaTech-Labs/loupe-web src/lib/guilloche.ts @ ca238d3 (transpiled with tsc). One change:
// drawDial is split into drawDialFace + drawDialMovement (same drawing, same order), and
// drawDialMovement can swing the balance wheel (by default it stands still, as in the app).
// The tourbillon's balance is drawn larger than the app's (a rim of 4.7 units, not 2.2, with
// weights and a hairspring) and the escape wheel sits at the cage's edge, as Hoover asked
// for the waitlist; the app's own dial is unchanged.
// The dial is the one on the app's Welcome screen; keep it in step with the app.
import { drawFinish, withAlpha } from "./finish.js";
const VIEWBOX = 100;
const C = 50;
const DIAL_FINISH_STRENGTH = 0.4;
const FINISH_REFERENCE_SCALE = 2.4;
export const DAY_ABBREVIATIONS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
/** Hour, minute and second hand angles (degrees clockwise from 12) at an instant. */
export function handAngles(date) {
    const secondFraction = date.getSeconds() + date.getMilliseconds() / 1000;
    return {
        hour: (date.getHours() % 12) * 30 + date.getMinutes() * 0.5 + secondFraction * (0.5 / 60),
        minute: date.getMinutes() * 6 + secondFraction * 0.1,
        second: secondFraction * 6,
    };
}
export function dayDate(date) {
    return { day: DAY_ABBREVIATIONS[date.getDay()], date: String(date.getDate()) };
}
function polar(radius, degrees) {
    const r = (degrees * Math.PI) / 180;
    return [C + radius * Math.sin(r), C - radius * Math.cos(r)];
}
function offset(radius, degrees) {
    const r = (degrees * Math.PI) / 180;
    return [radius * Math.sin(r), -radius * Math.cos(r)];
}
function circlePath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
}
/** The balance's rim radius, in dial units (the cage's ring is 8). */
const BALANCE_RIM = 4.7;
const SPRING_INNER = 1.1;
const SPRING_OUTER = 3.4;
const SPRING_TURNS = 2.5;
/**
 * The hairspring at a swing of `swing` degrees: a flat spiral from the collet to its stud.
 * Each point turns by the swing in proportion to how near the centre it is (all of it at the
 * collet, none at the stud), so the coils open and close as a real balance spring does.
 * Stroked in the current strokeStyle.
 */
function hairspring(ctx, swing) {
    const steps = Math.ceil(SPRING_TURNS * 28);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const r = SPRING_INNER + (SPRING_OUTER - SPRING_INNER) * u;
        const deg = 90 + 360 * SPRING_TURNS * u + swing * (1 - u);
        const [x, y] = offset(r, deg);
        if (i === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.lineWidth = 0.16;
    ctx.lineCap = "round";
    ctx.stroke();
}
/**
 * Draws the dial into `ctx` at `size` CSS px. `drawsFinish` false leaves the
 * face flat (the Reduce Transparency / Increase Contrast fallback).
 */
export function drawDial(ctx, size, date, t, drawsFinish, fonts) {
    drawDialFace(ctx, size, date, t, drawsFinish, fonts);
    drawDialMovement(ctx, size, date, t);
}
/**
 * The parts of the dial that stand still for a day: case, finish, minute track,
 * batons, day-date and brand line. Clears `ctx` first.
 * (Waitlist split: drawDial = drawDialFace + drawDialMovement, same pixels, so a
 * live dial can keep the face as an image and redraw only what moves.)
 */
export function drawDialFace(ctx, size, date, t, drawsFinish, fonts) {
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    const s = size / VIEWBOX;
    ctx.scale(s, s); // everything below is in dial units
    // Case and dial.
    circlePath(ctx, C, C, 48);
    ctx.fillStyle = t.background;
    ctx.fill();
    ctx.fillStyle = withAlpha(t.secondary, 0.25);
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = withAlpha(t.secondary, 0.5);
    ctx.stroke();
    circlePath(ctx, C, C, 42.5);
    ctx.fillStyle = t.background;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = withAlpha(t.secondary, 0.4);
    ctx.stroke();
    // Clous de Paris, as drawn on Welcome's 240 dial and scaled with the dial.
    if (drawsFinish) {
        ctx.save();
        circlePath(ctx, C, C, 42.2);
        ctx.clip();
        const factor = 1 / FINISH_REFERENCE_SCALE;
        ctx.scale(factor, factor);
        const side = VIEWBOX * FINISH_REFERENCE_SCALE;
        drawFinish(ctx, "clous", side, side, {
            base: t.background,
            highlight: t.finishHighlight,
            shadow: t.finishShadow,
            strength: DIAL_FINISH_STRENGTH,
        });
        ctx.restore();
    }
    // Minute track: sixty round-capped ticks, the hour ones longer.
    ctx.lineCap = "round";
    for (const hourTicks of [false, true]) {
        ctx.beginPath();
        for (let i = 0; i < 60; i++) {
            const isHour = i % 5 === 0;
            if (isHour !== hourTicks)
                continue;
            const [x1, y1] = polar(41.2, i * 6);
            const [x2, y2] = polar(isHour ? 38.8 : 39.8, i * 6);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.lineWidth = hourTicks ? 0.6 : 0.3;
        ctx.strokeStyle = hourTicks ? t.primary : withAlpha(t.secondary, 0.55);
        ctx.stroke();
    }
    // Hour batons — none at 12 (day-date) or 6 (tourbillon).
    ctx.fillStyle = t.primary;
    for (const hour of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
        ctx.save();
        ctx.translate(C, C);
        ctx.rotate((hour * 30 * Math.PI) / 180);
        ctx.fillRect(-0.9, -37, 1.8, 37 - 31.5);
        ctx.restore();
    }
    // Day-date windows at 12.
    const dd = dayDate(date);
    for (const w of [
        { minX: 39.25, text: dd.day, fontSize: 3.5, baseline: 18.85 },
        { minX: 50.75, text: dd.date, fontSize: 3.8, baseline: 18.9 },
    ]) {
        ctx.beginPath();
        ctx.roundRect(w.minX, 14, 10, 7, 0.8);
        ctx.fillStyle = t.surface;
        ctx.fill();
        ctx.lineWidth = 0.4;
        ctx.strokeStyle = withAlpha(t.secondary, 0.5);
        ctx.stroke();
        ctx.font = `500 ${w.fontSize}px ${fonts.mono}`;
        ctx.fillStyle = t.primary;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(w.text, w.minX + 5, w.baseline);
    }
    // Brand line, tracked.
    ctx.font = `600 2.7px ${fonts.sans}`;
    ctx.fillStyle = t.secondary;
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx)
        ctx.letterSpacing = "0.9px";
    ctx.fillText("LOUPE", C, 29.5);
    if ("letterSpacing" in ctx)
        ctx.letterSpacing = "0px";
    ctx.restore();
}
/**
 * The parts that move: the tourbillon (the seconds), the hands and the centre pin. Draws over the face.
 * `balance` (waitlist addition): the balance wheel's swing in degrees, relative to the cage. One angle
 * draws it sharp; several are one frame's exposure, drawn as a motion blur. [0] is the app's still balance.
 */
export function drawDialMovement(ctx, size, date, t, balance = [0]) {
    ctx.save();
    const s = size / VIEWBOX;
    ctx.scale(s, s);
    const angles = handAngles(date);
    // Tourbillon at 6: the aperture, then the cage and escapement turned by the seconds.
    circlePath(ctx, C, 67, 10.4);
    ctx.fillStyle = t.elevated;
    ctx.fill();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = withAlpha(t.secondary, 0.5);
    ctx.stroke();
    ctx.save();
    circlePath(ctx, C, 67, 10.4);
    ctx.clip();
    ctx.translate(C, 67);
    ctx.rotate((angles.second * Math.PI) / 180);
    // Cage: ring, three arms, a jewel on each.
    circlePath(ctx, 0, 0, 8);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = t.accent;
    ctx.stroke();
    ctx.beginPath();
    for (const deg of [0, 120, 240]) {
        ctx.moveTo(0, 0);
        ctx.lineTo(...offset(7.6, deg));
    }
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.fillStyle = t.error;
    for (const deg of [0, 120, 240]) {
        const [x, y] = offset(6.3, deg);
        circlePath(ctx, x, y, 0.9);
        ctx.fill();
    }
    // Escape wheel: twelve teeth, at the cage's edge between two arms, where its
    // pinion meets the fixed seconds wheel. (Waitlist: moved out from under the balance.)
    const [ex, ey] = offset(6.35, 60);
    ctx.beginPath();
    for (let tooth = 0; tooth < 12; tooth++) {
        const [ox, oy] = offset(1.2, tooth * 30);
        const [ix, iy] = offset(0.85, (tooth + 0.5) * 30);
        if (tooth === 0)
            ctx.moveTo(ex + ox, ey + oy);
        else
            ctx.lineTo(ex + ox, ey + oy);
        ctx.lineTo(ex + ix, ey + iy);
    }
    ctx.closePath();
    ctx.lineWidth = 0.25;
    ctx.lineCap = "butt";
    ctx.strokeStyle = t.secondary;
    ctx.stroke();
    // Balance wheel (waitlist: the cage's largest part, as on a real tourbillon): a rim with
    // four timing weights, four arms, and the hairspring under them, whose inner end turns
    // with the balance while its outer end stays pinned to the cage, so it breathes.
    circlePath(ctx, 0, 0, BALANCE_RIM);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = t.primary;
    ctx.stroke();
    // Each exposure at an even share, so the parts are 95% solid where they overlap (at the turn).
    ctx.globalAlpha = balance.length === 1 ? 1 : 1 - Math.pow(0.05, 1 / balance.length);
    for (const swing of balance) {
        ctx.strokeStyle = t.secondary;
        hairspring(ctx, swing);
        ctx.strokeStyle = t.primary;
        ctx.fillStyle = t.primary;
        ctx.lineWidth = 0.45;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const deg of [45, 135, 225, 315]) {
            ctx.moveTo(...offset(0.9, deg + swing));
            ctx.lineTo(...offset(BALANCE_RIM, deg + swing));
        }
        ctx.stroke();
        for (const deg of [0, 90, 180, 270]) {
            const [x, y] = offset(BALANCE_RIM, deg + swing);
            circlePath(ctx, x, y, 0.45);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    // Collet, then the centre jewel.
    circlePath(ctx, 0, 0, 0.9);
    ctx.fillStyle = t.primary;
    ctx.fill();
    circlePath(ctx, 0, 0, 0.6);
    ctx.fillStyle = t.error;
    ctx.fill();
    ctx.restore();
    // Hands, blued steel.
    for (const [outline, deg] of [
        [
            [
                [-1.2, 3.5],
                [-0.4, -21],
                [0.4, -21],
                [1.2, 3.5],
            ],
            angles.hour,
        ],
        [
            [
                [-0.9, 3.5],
                [-0.3, -30],
                [0.3, -30],
                [0.9, 3.5],
            ],
            angles.minute,
        ],
    ]) {
        ctx.save();
        ctx.translate(C, C);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.beginPath();
        outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = t.accent;
        ctx.fill();
        ctx.restore();
    }
    // Centre pin.
    circlePath(ctx, C, C, 1.7);
    ctx.fillStyle = t.accent;
    ctx.fill();
    circlePath(ctx, C, C, 0.55);
    ctx.fillStyle = t.surface;
    ctx.fill();
    ctx.restore();
}
// --- GenevaStripesBackground (Welcome) ---
const STRIPE_WIDTH = 42;
const STRIPE_ROTATION_DEGREES = -30;
const STRIPE_RAMP = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1];
const BRUSH_WIDTH = 0.3;
const BRUSH_SPACING = 4;
const BRUSH_OPACITY = 0.035;
/** Diagonal rounded-ridge stripes: an elevated ramp over the background, brushed in hairline. */
export function drawGenevaStripes(ctx, width, height, t) {
    ctx.save();
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((STRIPE_ROTATION_DEGREES * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    const diagonal = Math.hypot(width, height);
    const left = cx - diagonal / 2;
    const top = cy - diagonal / 2;
    const sub = STRIPE_WIDTH / STRIPE_RAMP.length;
    ctx.lineWidth = BRUSH_WIDTH;
    ctx.strokeStyle = withAlpha(t.hairline, BRUSH_OPACITY);
    for (let x = left; x < left + diagonal; x += STRIPE_WIDTH) {
        STRIPE_RAMP.forEach((alpha, i) => {
            ctx.fillStyle = withAlpha(t.elevated, alpha);
            ctx.fillRect(x + i * sub, top, sub + 0.5, diagonal);
        });
        ctx.beginPath();
        for (let hx = x; hx < x + STRIPE_WIDTH; hx += BRUSH_SPACING) {
            ctx.moveTo(hx, top);
            ctx.lineTo(hx, top + diagonal);
        }
        ctx.stroke();
    }
    ctx.restore();
}
