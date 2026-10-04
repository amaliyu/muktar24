-- Add staff_id linkage and last_login tracking to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS staff_id   uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS last_login timestamptz;
