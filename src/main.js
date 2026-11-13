import { LOOPS_FORM_URL, LOOPS_LIST_ID, SUPABASE_ANON_KEY, SUPABASE_URL, WELCOME_EMAIL_LIVE } from "./config.js";
import {
  addToMailingList,
  buildRow,
  failureMessage,
  isValidEmail,
  joinedBody,
  joinWaitlist,
  normalizeEmail,
  suggestEmail,
  validate,
} from "./waitlist.js";
import { startDial, startStripes } from "./dial.js";
import { keepFormAboveKeyboard } from "./keyboard.js";

const form = document.querySelector("[data-testid='waitlist.form']");
const email = form.querySelector("#email");
const collects = form.querySelector("#collects");
const honeypot = form.querySelector("#loupe-trap");
const submit = form.querySelector("[data-testid='waitlist.submit']");
const error = form.querySelector("[data-testid='waitlist.error']");
const suggestion = form.querySelector("[data-testid='waitlist.suggestion']");
const suggestionFix = form.querySelector("[data-testid='waitlist.suggestion.fix']");
const joined = document.querySelector("[data-testid='waitlist.joined']");
const joinedBodyText = joined.querySelector(".joined-body");

const SUBMIT_LABEL = submit.textContent;

/** The address someone kept after we suggested another: Join then sends it as typed. */
let keptAsTyped = null;

/**
 * Each field is described by what's showing for it, and nothing else: the
 * error for the field it's about, the typo suggestion for the email. A hidden
 * element named in aria-describedby is still read out (it used to say "Did you
 * mean ?" on every focus), and a "What do you collect?" error was only ever
 * attached to Email (LOU-102 4.12).
 */
function describeFields() {
  for (const input of [email, collects]) {
    const ids = [];
    if (!error.hidden && input.getAttribute("aria-invalid") === "true") ids.push(error.id);
    if (input === email && !suggestion.hidden) ids.push(suggestion.id);
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }
}

function showError(field, message) {
  hideSuggestion();
  error.textContent = message;
  error.hidden = false;
  const input = field === "collects" ? collects : email;
  input.setAttribute("aria-invalid", "true");
  describeFields();
  input.focus();
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
  email.removeAttribute("aria-invalid");
  collects.removeAttribute("aria-invalid");
  describeFields();
}

function showSuggestion(address) {
  suggestionFix.textContent = address;
  suggestionFix.setAttribute("aria-label", `Use ${address}`);
  suggestion.hidden = false;
  describeFields();
}

function hideSuggestion() {
  suggestion.hidden = true;
  suggestionFix.textContent = "";
  describeFields();
}

/** "Did you mean …@gmail.com?" for a likely typo in a valid-looking address. */
function offerSuggestion() {
  const typed = normalizeEmail(email.value);
  const better = isValidEmail(typed) && error.hidden ? suggestEmail(typed) : null;
  if (better) showSuggestion(better);
  else hideSuggestion();
}

function showJoined(address, welcomeSent = false, alreadyJoined = false) {
  // The card keeps the form's height, so the dial above it doesn't jump.
  const card = form.closest(".card");
  card.style.minHeight = `${card.getBoundingClientRect().height}px`;
  joinedBodyText.textContent = joinedBody(address, welcomeSent, alreadyJoined);
  form.hidden = true;
  joined.hidden = false;
  joined.focus();
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? "Joining…" : SUBMIT_LABEL;
  form.setAttribute("aria-busy", String(busy));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  clearError();
  const row = buildRow({ email: email.value, collects: collects.value });
  // Bots fill every field; people never see this one. Look like it worked.
  if (honeypot.value) return showJoined(row.email);
  const problem = validate(row);
  if (problem) return showError(problem.field, problem.message);
  // A likely typo: the first Join shows the suggestion; a second sends it as typed.
  if (suggestEmail(row.email) && keptAsTyped !== row.email) {
    offerSuggestion();
    keptAsTyped = row.email;
    return;
  }
  hideSuggestion();
  // Offline: nothing to send, and saying so beats a generic failure.
  if (navigator.onLine === false) return showError("email", failureMessage(null, { online: false }));
  setBusy(true);
  const result = await joinWaitlist(row, { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  if (result.status !== "joined") {
    setBusy(false);
    return showError("email", failureMessage(result, { online: navigator.onLine !== false }));
  }
  // On the list. Now the mailing list, which sends the welcome email; the card
  // only promises that email when Loops took them.
  const welcomeSent =
    WELCOME_EMAIL_LIVE && (await addToMailingList(row, { formUrl: LOOPS_FORM_URL, listId: LOOPS_LIST_ID }));
  setBusy(false);
  showJoined(row.email, welcomeSent, result.alreadyJoined === true);
});

email.addEventListener("blur", (event) => {
  if (event.relatedTarget === suggestionFix) return;
  offerSuggestion();
});

email.addEventListener("input", () => {
  keptAsTyped = null;
  hideSuggestion();
});

suggestionFix.addEventListener("click", () => {
  email.value = suggestionFix.textContent;
  keptAsTyped = null;
  hideSuggestion();
  clearError();
  email.focus();
});

[email, collects].forEach((input) =>
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    describeFields();
  }),
);

// Clickjacking: GitHub Pages can't send frame-ancestors or X-Frame-Options, so
// inside another site's frame the page hides its form and offers a link that
// opens loupeweb.com properly instead.
if (window.top !== window.self) {
  const card = form.closest(".card");
  card.style.display = "none";
  const open = document.createElement("a");
  open.href = "https://loupeweb.com/";
  open.target = "_top";
  open.rel = "noopener";
  open.className = "primary framed-open";
  open.dataset.testid = "waitlist.framed";
  open.textContent = "Open Loupe to join the waitlist";
  card.after(open);
}

keepFormAboveKeyboard({ page: document.querySelector(".page"), form, action: submit });
startStripes(document.querySelector("[data-testid='waitlist.stripes']"));
startDial(document.querySelector("[data-testid='waitlist.dial']"));
