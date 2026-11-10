// Keeps what someone is typing in view while the phone's keyboard is up.
//
// The page is exactly one screen tall, so there is nothing for the browser to
// scroll when the keyboard covers the bottom of it. While a field has focus and
// the keyboard is open, the page gets room below the form (the keyboard's
// height) and scrolls so the field and the Join button sit just above the
// keyboard. When the keyboard closes the room goes and the page is one screen
// again. Safari on iPhone and Chrome on Android (resizes-visual, its default
// since Chrome 108) both report the keyboard through visualViewport. Where a
// browser shrinks the whole page instead, the page becomes scrollable and the
// browser brings the field into view itself.

/** Lost height smaller than this is a browser bar moving, not a keyboard. */
export const KEYBOARD_MIN = 120;
/** Space kept between the form and the keyboard / top of the screen. */
export const MARGIN = 16;
/** Keyboards animate in; look once they've settled. */
export const SETTLE_MS = 350;
/** Quiet time after the last viewport resize before the page moves. */
export const RESIZE_SETTLE_MS = 80;
/** How long the glide back to the top gets before the keyboard room goes. */
export const CLOSE_MS = 450;

/** Pinch-zoomed in (visualViewport.scale past 1, allowing for rounding). */
export function isZoomed(scale) {
  return typeof scale === "number" && scale > 1.01;
}

export function keyboardHeight(layoutHeight, visibleHeight) {
  const lost = Math.round(layoutHeight - visibleHeight);
  return lost >= KEYBOARD_MIN ? lost : 0;
}

/**
 * How far to scroll (positive is down). Positions are relative to the top of
 * the visible area. When the field and the Join button fit together, the
 * button sits just above the keyboard; otherwise the field goes to the top.
 */
export function scrollDelta({ fieldTop, actionBottom, viewHeight, margin = MARGIN }) {
  if (actionBottom - fieldTop + 2 * margin <= viewHeight) return actionBottom - (viewHeight - margin);
  return fieldTop - margin;
}

export function keepFormAboveKeyboard({ page, form, action }) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const behavior = () => (reduceMotion.matches ? "auto" : "smooth");
  let focused = null;
  let settle = 0;
  let closing = 0;
  let target = null;

  const isField = (el) => el instanceof HTMLInputElement && form.contains(el) && el.tabIndex !== -1;

  /** One smooth scroll per destination: repeat calls on the way don't restart it. */
  const glideTo = (top) => {
    const max = document.scrollingElement.scrollHeight - window.innerHeight;
    const next = Math.max(0, Math.min(Math.round(top), max));
    if (target !== null && Math.abs(next - target) < 2) return;
    if (target === null && Math.abs(next - window.scrollY) < 2) return;
    target = next;
    window.scrollTo({ top: next, behavior: behavior() });
  };

  const open = (keyboard) => {
    clearTimeout(closing);
    page.style.setProperty("--keyboard", `${keyboard}px`);
    page.classList.add("keyboard-open");
    if (!focused) return;
    const field = focused.closest(".field") ?? focused;
    const delta = scrollDelta({
      fieldTop: field.getBoundingClientRect().top - viewport.offsetTop,
      actionBottom: action.getBoundingClientRect().bottom - viewport.offsetTop,
      viewHeight: viewport.height,
    });
    glideTo(window.scrollY + delta);
  };

  // Glide back to the top first, then take the room away, so nothing snaps.
  const close = () => {
    if (!page.classList.contains("keyboard-open")) return;
    glideTo(0);
    clearTimeout(closing);
    closing = setTimeout(
      () => {
        page.classList.remove("keyboard-open");
        page.style.setProperty("--keyboard", "0px");
        target = null;
      },
      reduceMotion.matches ? 0 : CLOSE_MS,
    );
  };

  const align = () => {
    // Pinch-zoom shrinks the visible area too, but it isn't a keyboard: while
    // someone is zoomed in the page stays exactly as they left it, and it
    // settles again once they're back at normal size.
    if (isZoomed(viewport.scale)) return;
    // The room follows the keyboard itself, not focus: a tap on Join moves
    // focus first, and the button must not jump before the tap lands.
    const keyboard = keyboardHeight(window.innerHeight, viewport.height);
    if (keyboard > 0) open(keyboard);
    else close();
  };

  // Keyboards report their size several times while sliding in; act once
  // they've settled so the page makes a single smooth move.
  const alignSoon = () => {
    clearTimeout(settle);
    settle = setTimeout(align, RESIZE_SETTLE_MS);
  };

  form.addEventListener("focusin", (event) => {
    if (!isField(event.target)) return;
    focused = event.target;
    target = null;
    clearTimeout(settle);
    settle = setTimeout(align, SETTLE_MS);
  });

  form.addEventListener("focusout", () => {
    // Focus may be moving to the other field; decide once it has landed.
    setTimeout(() => {
      if (!isField(document.activeElement)) focused = null;
    }, 0);
  });

  viewport.addEventListener("resize", alignSoon);
}
