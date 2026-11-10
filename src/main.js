import { SUPABASE_ANON_KEY, SUPABASE_URL, WELCOME_EMAIL_LIVE } from "./config.js";
import { buildRow, isValidEmail, joinedBody, joinWaitlist, MESSAGES, normalizeEmail, suggestEmail, validate } from "./waitlist.js";
import { startDial, startStripes } from "./dial.js";
import { keepFormAboveKeyboard } from "./keyboard.js";

const form = document.querySelector("[data-testid='waitlist.form']");
const email = form.querySelector("#email");
const collects = form.querySelector("#collects");
const honeypot = form.querySelector("#website");
const submit = form.querySelector("[data-testid='waitlist.submit']");
const error = form.querySelector("[data-testid='waitlist.error']");
const suggestion = form.querySelector("[data-testid='waitlist.suggestion']");
const suggestionFix = form.querySelector("[data-testid='waitlist.suggestion.fix']");
const joined = document.querySelector("[data-testid='waitlist.joined']");
const joinedBodyText = joined.querySelector(".joined-body");

const SUBMIT_LABEL = submit.textContent;

/** The address someone kept after we suggested another: Join then sends it as typed. */
let keptAsTyped = null;

function showError(field, message) {
  hideSuggestion();
  error.textContent = message;
  error.hidden = false;
  const input = field === "collects" ? collects : email;
  input.setAttribute("aria-invalid", "true");
  input.focus();
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
  email.removeAttribute("aria-invalid");
  collects.removeAttribute("aria-invalid");
}

function showSuggestion(address) {
  suggestionFix.textContent = address;
  suggestionFix.setAttribute("aria-label", `Use ${address}`);
  suggestion.hidden = false;
}

function hideSuggestion() {
  suggestion.hidden = true;
  suggestionFix.textContent = "";
}

/** "Did you mean …@gmail.com?" for a likely typo in a valid-looking address. */
function offerSuggestion() {
  const typed = normalizeEmail(email.value);
  const better = isValidEmail(typed) && error.hidden ? suggestEmail(typed) : null;
  if (better) showSuggestion(better);
  else hideSuggestion();
}

function showJoined(address) {
  // The card keeps the form's height, so the dial above it doesn't jump.
  const card = form.closest(".card");
  card.style.minHeight = `${card.getBoundingClientRect().height}px`;
  joinedBodyText.textContent = joinedBody(address, WELCOME_EMAIL_LIVE);
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
  setBusy(true);
  const result = await joinWaitlist(row, { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  setBusy(false);
  if (result.status === "joined") return showJoined(row.email);
  showError("email", MESSAGES.failed);
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

[email, collects].forEach((input) => input.addEventListener("input", () => input.removeAttribute("aria-invalid")));

keepFormAboveKeyboard({ page: document.querySelector(".page"), form, action: submit });
startStripes(document.querySelector("[data-testid='waitlist.stripes']"));
startDial(document.querySelector("[data-testid='waitlist.dial']"));
