-- ============================================================
-- STEP A: Run this first to see your exact constraint names
-- ============================================================
SELECT conname AS constraint_name, conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype = 'c'
  AND (conname ILIKE '%block%' OR conname ILIKE '%type%')
ORDER BY table_name;
