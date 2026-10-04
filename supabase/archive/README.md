HISTORICAL — DO NOT RUN. These files do not match the live database. Several
of them disable RLS or GRANT ALL to anon and would reopen the database to the
public. New schema changes go in supabase/migrations/ only.

These are kept for historical reference only — they document how the schema
evolved before this repo adopted tracked migrations (`supabase/migrations/`).
None of them should ever be pasted into the Supabase SQL editor or run
against any project, including a fresh one: several predate RLS being
enabled at all, grant broad access that has since been revoked, or reference
tables/columns that have since changed shape.

If you need to recreate schema from scratch, use `supabase/migrations/` in
order — that's the only directory that reflects what's actually been applied
to the live database.
