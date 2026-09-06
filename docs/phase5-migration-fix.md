# Phase 5 migration repair

## Root cause

PostgreSQL error position `6578` maps to this statement in
`20260831_phase5_intelligence.sql`:

```sql
create unique index if not exists vasp_candidate_identity_unique on vasp_candidates
  (case_id, investigation_id, chain, lower(address), coalesce(entity_name, ''), method, method_version);
```

Phase 1 already creates the legacy `vasp_candidates` relation with `case_id`,
`entity_id`, `chain`, attribution metadata, and provenance fields, but without
an `address` or `investigation_id`. Phase 5 originally used `create table if not
exists vasp_candidates (...)`; PostgreSQL correctly retained the Phase 1 table
and then rejected `lower(address)` with SQLSTATE `42703`.

## Corrected Phase 5 strategy

The Phase 5 migration is not in the migration ledger, so it is corrected in
place without modifying Phase 1–4. It now evolves the Phase 1 relation with
`add column if not exists` statements. Existing rows are preserved untouched.
A check constraint requires every row that has a Phase 5 `investigation_id` to
also have the complete Phase 5 candidate fields. The candidate identity index
is partial and applies only to rows with both `investigation_id` and `address`.
The repository upsert has the matching conflict predicate.

This is deliberately a corrected unapplied-migration strategy rather than a
later migration: a later migration cannot run while the earlier Phase 5 entry
always fails before the migration ledger can record it.

## Validation status

- Static migration regression: passed.
- Typecheck, workspace tests (31/31), OpenAPI code generation, API production
  build (673 ms), and diff check: passed on 2026-08-30.
- Current `cashnet` database inspection, clean-database replay, and existing
  database repair: pending a supplied nonsecret local `DATABASE_URL` or
  passwordless PostgreSQL role. The installed PostgreSQL 18.6 service requires
  password authentication and no project connection configuration is present.
- API bundle: passed in 608 ms after approved access to the existing local
  dependency worker files.

No existing database objects, rows, Phase 1–4 migrations, Git history, or
Phase 3/4 tags were modified during this diagnosis.
