# Supabase PostgreSQL operations

Supabase PostgreSQL is the single authoritative CASHNET database. CASHNET does
not use Supabase Auth: application authentication, roles, RBAC, case isolation,
provenance, and audit controls remain in CASHNET's PostgreSQL schema.

## Connection contract

Store these values only in the deployment secret manager or an ignored local
environment file. Never put them in source, Compose files, tickets, command
history, or logs.

| Variable | Consumer | Supabase connection mode |
| --- | --- | --- |
| `DATABASE_URL` | API and controlled non-empty validation | Least-privilege `cashnet` login. Prefer the direct connection for a persistent backend with IPv6 (or the IPv4 add-on); otherwise use the Supavisor session pooler. |
| `CASHNET_MIGRATION_DATABASE_URL` | Role bootstrap, migration ledger, backup, restore | Privileged direct connection. If the environment cannot reach the IPv6 direct endpoint, use Supavisor session mode as Supabase documents for migrations and backup/restore. |
| `CASHNET_SUPABASE_CA_CERT_PATH` | API, migrations, `psql`, backup and restore | Absolute path to the project CA PEM downloaded from **Database > SSL Configuration**. It is a certificate, not a credential, but must be supplied outside the repository and protected from replacement. |
| `CASHNET_VALIDATION_ADMIN_DATABASE_URL` | Immutable-audit trigger probe | Optional privileged validation URL; defaults operationally to the migration URL. |
| `CASHNET_RESTORE_VALIDATION_DATABASE_URL` | Restore drill only | A different, disposable Supabase project/endpoint. It must never identify the primary project. |

All URLs must use an official Supabase direct (`db.<project-ref>.supabase.co`)
or pooler host and `sslmode=verify-full`. Download the CA PEM from **Database
> SSL Configuration** and set `CASHNET_SUPABASE_CA_CERT_PATH` to its absolute
path. CASHNET passes that PEM explicitly to Node `pg` with
`rejectUnauthorized: true` and hostname verification. The PowerShell tooling
sets `PGSSLROOTCERT` only for its own process so `psql`, `pg_dump`, and
`pg_restore` enforce the same CA. Never use `NODE_TLS_REJECT_UNAUTHORIZED=0`,
`rejectUnauthorized: false`, or `sslmode=require` as a workaround for a
certificate-chain failure. No production,
Docker, migration, or normal-development path may point to `localhost`,
`127.0.0.1`, a Windows PostgreSQL service, or a local PostgreSQL container.

Supabase documents the direct connection as the preferred choice for migrations,
`pg_dump`, and persistent backends when IPv6 is available. On IPv4-only
networks, use Supavisor session mode for persistent application traffic and
migration/backup tooling; transaction pooling is reserved for short-lived
serverless/edge clients and does not support all session features. See
[Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

The GitHub Actions migration job uses a deliberately isolated, disposable
loopback PostgreSQL service only to replay the ledger. It must set all of
`CI=true`, `NODE_ENV=test`, and `CASHNET_DATABASE_TEST_MODE=disposable-postgres`.
The application rejects that mode outside CI test execution; it is not a
runtime, Docker, or normal-development fallback.

## Fresh project initialization

1. Create a Supabase project and retrieve its connection strings from **Connect**.
2. Configure the four variables above in the approved secret manager. The
   runtime URL must name `cashnet`; the migration URL must be able to create a
   role and apply schema changes.
3. Run `pnpm --filter @workspace/db run provision-application-role`. It creates
   the fixed least-privilege `cashnet` login only when it does not already
   exist. It never rotates an existing password or grants ownership.
4. Run `pnpm --filter @workspace/db run migrate` twice. The second run verifies
   the `cashnet_schema_migrations` ledger is idempotent.

The migration runner requires `CASHNET_MIGRATION_DATABASE_URL` explicitly and
will never fall back to the runtime `DATABASE_URL`. A PostgreSQL `28P01`
failure means the Supabase migration credential is invalid or stale; update it
in the approved secret manager (and rotate the Supabase password there if
necessary), then rerun the command. CASHNET emits only a redacted diagnostic
and never prints the URL or password.
5. Start the API with `DATABASE_URL`, `CASHNET_DATA_MODE=authorized`, and the
   appropriate authentication configuration. The API does not receive the
   migration URL.
6. Run `pwsh -File .\scripts\validate-phase6-postgres.ps1`, then the explicitly
   approved synthetic fixture validation: `pwsh -File
   .\scripts\validate-phase6-nonempty.ps1 -ConfirmCreateValidationFixture`.

The validator checks the migration ledger, catalog objects, RBAC-table reads,
least-privilege audit access, and a privileged immutable-trigger rejection. It
never prints a connection string.

## Least privilege and audit

The `20260906_phase6_application_role_privileges` migration grants only
repository-required operations to `cashnet`, including SELECT for the RBAC
identity tables. `audit_events` remains SELECT/INSERT only for that role; it
has no UPDATE or DELETE grant. Privileged UPDATE/DELETE attempts are rejected
by the immutable-audit trigger.

Production authentication rejects `demo.*` development fixtures before role
lookup. Do not use a demo identity as a production administrator.

## Existing local data and cleanup

Changing CASHNET configuration does not delete or inspect an existing local
PostgreSQL database. Before any operator deletes, uninstalls, drops, truncates,
or disables a local database, the operator must record database size, relevant
table counts, data classification, and a verified encrypted backup. If data
must be retained, use a reviewed `pg_dump`/`pg_restore` migration into Supabase
and re-run the ledger/validation gates. Windows PostgreSQL service changes are
outside this repository and are not required for CASHNET after Supabase cutover.

Phase 7 is not started by this infrastructure migration.
