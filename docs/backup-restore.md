# Backup and restore procedure

This procedure protects investigative data and the append-only audit trail in
Supabase PostgreSQL. It is for an authorised operator with PostgreSQL client
tooling. The scripts resolve `pg_dump.exe` and `pg_restore.exe` safely on
Windows. Provide standalone client binaries through `PATH` or the explicit
script parameter; a local PostgreSQL server, local PostgreSQL installation, or
pgAdmin is not required.

## Backup

1. Supply `CASHNET_MIGRATION_DATABASE_URL` only through the operator's secure environment; never place it in a command history, script, ticket, or repository. Use the Supabase direct connection when reachable, otherwise its documented session pooler fallback.
2. Run `pwsh -File .\scripts\backup-cashnet.ps1 -OutputPath <approved-encrypted-location>\cashnet-<utc>.dump`.
3. Retain the generated `.manifest.json` beside the dump. It contains the SHA-256 integrity value, not credentials.
4. Encrypt stored backups, restrict access to the authorised evidence/operations group, and record custody according to the organisation's approved retention schedule.

## Restore drill

1. Provision a separate disposable Supabase project and set its privileged URL
   only as `CASHNET_RESTORE_VALIDATION_DATABASE_URL`. The guarded drill refuses
   to use the same endpoint as the primary project, verifies the manifest,
   restores, checks data-family counts, and proves audit immutability on the
   restored database:

   ```powershell
   pwsh -File .\scripts\validate-phase6-backup-restore.ps1 -ConfirmCreateIsolatedRestoreDatabase
   ```

2. The script retains the isolated restore project for inspection; do not reuse
   it or restore over the primary Supabase project.
3. Verify the migration ledger, foreign keys, selected counts for cases/investigations/facts/relationships/evidence/intelligence/risk/audit, and audit `UPDATE`/`DELETE` rejection.
4. Record the UTC time, operator, backup manifest hash, target, validation result, and any discrepancies in the controlled operations record. Destroy the temporary database under the approved test-data procedure when the drill is complete.

## Recovery objectives

RPO and RTO are organisational policy decisions, not properties demonstrated by source code. Before production, the accountable operator must define and test an approved backup cadence, encryption/key-management policy, off-site replication, retention/deletion schedule, recovery ownership, RPO, and RTO. A successful restore drill is required before claiming restore readiness.

## Safety boundaries

The restore script verifies the manifest and rejects a target whose
host/port/database/user endpoint matches the primary URL. This is a guardrail,
not a substitute for peer review of the target or least-privilege database
credentials.
