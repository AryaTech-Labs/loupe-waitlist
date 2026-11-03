import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { buildRow, joinWaitlist, MESSAGES, validate } from "./waitlist.js";
import { startDial, startStripes } from "./dial.js";

const form = document.querySelector("[data-testid='waitlist.form']");
const email = form.querySelector("#email");
const collects = form.querySelector("#collects");
const honeypot = form.querySelector("#website");
const submit = form.querySelector("[data-testid='waitlist.submit']");
const error = form.querySelector("[data-testid='waitlist.error']");
const joined = document.querySelector("[data-testid='waitlist.joined']");

const SUBMIT_LABEL = submit.textContent;

function showError(field, message) {
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

function showJoined() {
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
  // Bots fill every field; people never see this one. Look like it worked.
  if (honeypot.value) return showJoined();
  const row = buildRow({ email: email.value, collects: collects.value });
  const problem = validate(row);
  if (problem) return showError(problem.field, problem.message);
  setBusy(true);
  const result = await joinWaitlist(row, { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  setBusy(false);
  if (result.status === "joined") return showJoined();
  showError("email", MESSAGES.failed);
});

[email, collects].forEach((input) => input.addEventListener("input", () => input.removeAttribute("aria-invalid")));

startStripes(document.querySelector("[data-testid='waitlist.stripes']"));
startDial(document.querySelector("[data-testid='waitlist.dial']"));
