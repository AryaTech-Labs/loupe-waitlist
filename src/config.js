// The shared Loupe Supabase project (the same one the apps use). The anon key
// is public by design: Row Level Security decides what it can do, and on
// `waitlist` that is INSERT only. Never put the service role key here.
export const SUPABASE_URL = "https://dxrmrfaptbhzyegbbmnz.supabase.co";
// Loops (the waitlist's email platform). After the Supabase insert, the page
// adds the person to the "Loupe Beta" list through Loops' public form endpoint,
// and Loops sends the welcome email. The form ID is not a secret: all it can do
// is add someone to that list. (The server sync, LOU-96, backfills earlier
// signups and catches any this misses.)
// WELCOME_EMAIL_LIVE is the off switch: false skips Loops and keeps the
// "We'll email you when your invite is ready" line.
export const WELCOME_EMAIL_LIVE = true;
export const LOOPS_FORM_URL = "https://app.loops.so/api/newsletter-form/cmwb6vqci006n0j0d9fl670vn";
export const LOOPS_LIST_ID = "cmwb7tp127bfc0jzggi1gb7kp";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cm1yZmFwdGJoenllZ2JibW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTI5ODgsImV4cCI6MjA4ODY4ODk4OH0.AuNqCZjKOZolwlokdJn9D5O-9HhJa6xYtyahBdMjk9I";
