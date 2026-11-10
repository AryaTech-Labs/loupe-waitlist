// The shared Loupe Supabase project (the same one the apps use). The anon key
// is public by design: Row Level Security decides what it can do, and on
// `waitlist` that is INSERT only. Never put the service role key here.
export const SUPABASE_URL = "https://dxrmrfaptbhzyegbbmnz.supabase.co";
// Turn on once the server sends the welcome email (the Loops sync): the card
// after joining then says "We've sent a welcome email to …".
export const WELCOME_EMAIL_LIVE = false;
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cm1yZmFwdGJoenllZ2JibW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTI5ODgsImV4cCI6MjA4ODY4ODk4OH0.AuNqCZjKOZolwlokdJn9D5O-9HhJa6xYtyahBdMjk9I";
