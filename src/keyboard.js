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
/** Keyboards animate in; look again once they've settled. */
export const SETTLE_MS = 350;

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
  let focused = null;
  let settle = 0;

  const isField = (el) => el instanceof HTMLInputElement && form.contains(el) && el.tabIndex !== -1;

  const align = () => {
    // The room follows the keyboard itself, not focus: a tap on Join moves
    // focus first, and the button must not jump before the tap lands.
    const keyboard = keyboardHeight(window.innerHeight, viewport.height);
    page.style.setProperty("--keyboard", `${keyboard}px`);
    page.classList.toggle("keyboard-open", keyboard > 0);
    if (keyboard === 0 || !focused) return;
    const field = focused.closest(".field") ?? focused;
    const delta = scrollDelta({
      fieldTop: field.getBoundingClientRect().top - viewport.offsetTop,
      actionBottom: action.getBoundingClientRect().bottom - viewport.offsetTop,
      viewHeight: viewport.height,
    });
    if (Math.abs(delta) < 1) return;
    window.scrollTo({ top: window.scrollY + delta, behavior: reduceMotion.matches ? "auto" : "smooth" });
  };

  form.addEventListener("focusin", (event) => {
    if (!isField(event.target)) return;
    focused = event.target;
    align();
    clearTimeout(settle);
    settle = setTimeout(align, SETTLE_MS);
  });

  form.addEventListener("focusout", () => {
    // Focus may be moving to the other field; decide once it has landed.
    setTimeout(() => {
      if (!isField(document.activeElement)) focused = null;
    }, 0);
  });

  viewport.addEventListener("resize", align);
}
