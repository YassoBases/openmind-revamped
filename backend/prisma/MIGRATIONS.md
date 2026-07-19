# Applying migrations safely

## What's actually in the migration history (verified, read-only)

The only database this project's `.env` points at (the local `docker compose`
Postgres — no production credentials exist in this environment) was inspected
directly, read-only:

```
migration_name                         checksum
20260717080422_add_student_interests   9f470801762e378cc7f808d7aa30038b69e311d9b71ab323be11026ddb57190a
```

That's the **only** row in `_prisma_migrations`. Its migration file creates
the full schema (Student + Game + LearnProgress + LearnEvidence +
PlaySession + TutorMessage + XpEvent + StreakEvent + SpecCache, all indexes
and foreign keys, `interests` included) in one shot — it was applied via
`prisma migrate dev` when the file was first authored, straight against this
database, which is why its checksum is already load-bearing: **that
migration file is never rewritten by this change** — rewriting content that a
real database has already recorded a checksum for breaks `prisma migrate
deploy`/`status` for that database (checksum mismatch) and was a mistake in
an earlier draft of this fix, corrected here.

The database itself already had 13 real `Student` rows at inspection time —
confirming it's a genuine working dev database, not an empty scratch
instance, and reinforcing why its applied migration can't be edited after
the fact.

`backend/src/config.ts` / `.env` — the only place `DATABASE_URL` is
configured in this repo — has no production/Neon credentials. Production's
actual migration history was **not** inspected (no access) and is not
assumed here beyond what an earlier commit message already stated in
`backend/prisma/schema.prisma`'s git history: the `interests` field was
"prepared — not applied to production." The procedure below accounts for
that possibility without depending on it.

## The migrations

1. `20260717080422_add_student_interests` — full schema including
   `interests`. **Untouched** — matches the checksum above exactly.
2. `20260718090000_student_installation_id` — one additive, non-destructive
   change on top of the untouched history above:
   ```sql
   ALTER TABLE "Student" ADD COLUMN "installationId" TEXT;
   CREATE UNIQUE INDEX "Student_installationId_key" ON "Student"("installationId");
   ```
   Nullable column + unique index — safe under concurrent reads/writes,
   doesn't touch existing rows (`installationId` defaults to `NULL`, and
   Postgres unique indexes permit any number of `NULL`s). Generated via
   `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`
   (diffed from the actual applied history, not hand-typed) — see "What was
   tested" below for how it was verified against a real copy of the
   inspected database.

## Fresh database (new environment, CI, local dev, a new Neon branch)

Nothing already exists — both migrations apply in order:

```bash
cd backend
DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
```

## Existing database that already ran `prisma migrate` against migration 1

This is the state of the one real database inspected above. Nothing special
needed — `migrate deploy` recognizes migration 1's checksum, skips it, and
applies only the new `installationId` migration:

```bash
cd backend
DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
# → "Applying migration `20260718090000_student_installation_id`" only
```

## Existing database that never ran `prisma migrate` at all (e.g. built via `db push`)

This is the scenario the git history flags for production: tables already
exist (created outside Prisma's migration system) but *without* the
`interests` column, and with no `_prisma_migrations` table at all. Running
`migrate deploy` cold hits `P3005` ("the database schema is not empty") on
migration 1, because Prisma sees an unapplied `CREATE TABLE` migration
against a non-empty schema and refuses.

Because migration 1 is not allowed to be rewritten (its content is already
checksummed elsewhere), the fix is a one-time **manual reconciliation**
instead of a code change — bring the actual schema in line with what
migration 1 would have produced, then tell Prisma it's already done:

```bash
cd backend
# 1. Manually add exactly what migration 1 would have added beyond the
#    tables that already exist — idempotent, safe to run even if partially
#    applied already:
psql "$DATABASE_URL" -c 'ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];'

# 2. Tell Prisma migration 1 is satisfied (records it in _prisma_migrations
#    WITHOUT executing its SQL — nothing it creates is re-run):
DATABASE_URL=... DIRECT_URL=... npx prisma migrate resolve --applied 20260717080422_add_student_interests

# 3. Now a normal deploy applies only the new, actually-pending migration:
DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
```

Verify with `npx prisma migrate diff --from-url "$DATABASE_URL"
--to-schema-datamodel prisma/schema.prisma --exit-code` — "No difference
detected." confirms production now matches `schema.prisma` exactly.

## What was tested (disposable containers only — the real database was never written to)

- **Real-database copy**: `pg_dump` (read-only) of the actual inspected
  database, restored into a disposable container → `prisma migrate deploy`
  → only `20260718090000_student_installation_id` applies (migration 1's
  checksum matches, correctly skipped) → all 13 pre-existing `Student` rows
  intact → `migrate diff --exit-code` against `schema.prisma` reports no
  difference.
- **Fresh database**: empty disposable container → `migrate deploy` applies
  both migrations in order → `migrate diff --exit-code` reports no
  difference.
- The manual-reconciliation runbook above was **not** executed against any
  database (no never-migrated database exists in this environment to test
  against) — it follows Prisma's documented baselining procedure
  (https://pris.ly/d/migrate-baseline) applied to the migration that's
  actually on record, and is intentionally the only step in this document
  that wasn't exercised, since doing so would require fabricating a stand-in
  for production, which is exactly the kind of assumption this revision
  removed.
