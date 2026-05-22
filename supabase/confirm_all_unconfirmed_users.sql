-- Confirm all unconfirmed auth users so they can log in immediately.
-- Run this once in Supabase SQL Editor.
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;
