-- Add total_weeks to seasons (admin sets how many weeks the season has)
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS total_weeks INT;
