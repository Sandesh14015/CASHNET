[CmdletBinding()]
param(
  [string] $DatabaseUrl = $env:DATABASE_URL,
  [string] $MigrationDatabaseUrl = $env:CASHNET_MIGRATION_DATABASE_URL,
  [string] $ValidationAdminDatabaseUrl = $env:CASHNET_VALIDATION_ADMIN_DATABASE_URL,
  [string] $SupabaseCaCertPath = $env:CASHNET_SUPABASE_CA_CERT_PATH,
  [switch] $SkipMigrations,
  [string] $PsqlPath
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required. It is read only from the launching environment and is never printed."
}

if ([string]::IsNullOrWhiteSpace($MigrationDatabaseUrl)) {
  throw "CASHNET_MIGRATION_DATABASE_URL is required for the Supabase migration connection and is never printed."
}

if (
  [string]::IsNullOrWhiteSpace($SupabaseCaCertPath) -or
  -not (Test-Path -LiteralPath $SupabaseCaCertPath -PathType Leaf)
) {
  throw "CASHNET_SUPABASE_CA_CERT_PATH must identify the Supabase CA PEM. It is not printed."
}

$env:PGSSLROOTCERT = [System.IO.Path]::GetFullPath($SupabaseCaCertPath)

if ([string]::IsNullOrWhiteSpace($ValidationAdminDatabaseUrl)) {
  $ValidationAdminDatabaseUrl = $MigrationDatabaseUrl
}

function Assert-SupabasePostgresUrl([string] $Url, [string] $Name) {
  try {
    $uri = [uri]$Url
  }
  catch {
    throw "$Name must be a valid PostgreSQL URL."
  }

  if ($uri.Scheme -notin @("postgres", "postgresql")) {
    throw "$Name must use a PostgreSQL URL."
  }

  # IMPORTANT:
  # Do not use $Host or $host here. PowerShell reserves $Host.
  $dbHost = $uri.Host.ToLowerInvariant()

  if (
    $dbHost -in @("localhost", "127.0.0.1", "::1") -or
    $dbHost.EndsWith(".local")
  ) {
    throw "$Name must target Supabase, not a local PostgreSQL service."
  }

  if (
    -not (
      $dbHost.EndsWith(".supabase.co") -or
      $dbHost.EndsWith(".pooler.supabase.com")
    )
  ) {
    throw "$Name must use an official Supabase direct or pooler hostname."
  }

  if (
    $uri.Query -notmatch "(?i)(^|[?&])sslmode=verify-full(&|$)"
  ) {
    throw "$Name must require certificate and hostname verification using sslmode=verify-full."
  }
}

Assert-SupabasePostgresUrl $DatabaseUrl "DATABASE_URL"
Assert-SupabasePostgresUrl $MigrationDatabaseUrl "CASHNET_MIGRATION_DATABASE_URL"
Assert-SupabasePostgresUrl $ValidationAdminDatabaseUrl "CASHNET_VALIDATION_ADMIN_DATABASE_URL"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($PsqlPath)) {
  $psqlCommand = Get-Command psql -ErrorAction SilentlyContinue

  if ($psqlCommand) {
    $PsqlPath = [string]$psqlCommand.Source
  }
}

if (
  [string]::IsNullOrWhiteSpace($PsqlPath) -or
  -not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)
) {
  throw "psql client was not found. Supply -PsqlPath or add a PostgreSQL client binary to PATH; a local PostgreSQL server is neither used nor required."
}

# A scalar full path is mandatory: PowerShell 5.1 can mis-handle a native
# command discovered through an array/pipeline when its path contains spaces.
$psql = [System.IO.Path]::GetFullPath([string]$PsqlPath)

function Invoke-CashnetPsql {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Sql,

    [Parameter(Mandatory = $true)]
    [string] $ConnectionString,

    [Parameter(Mandatory = $true)]
    [string] $ConnectionLabel
  )

  # Do not construct a shell command string or use argument-array splatting.
  # Each quoted expansion remains exactly one native argument on Windows
  # PowerShell 5.1 and PowerShell 7, including the spaced executable path and
  # the multi-line SQL argument.
  & $psql `
    --no-psqlrc `
    --set "ON_ERROR_STOP=1" `
    --dbname "$ConnectionString" `
    --command "$Sql"

  if ($LASTEXITCODE -ne 0) {
    throw "psql $ConnectionLabel validation command failed."
  }
}

if (-not $SkipMigrations) {
  Push-Location $projectRoot

  try {
    Write-Output "Running CASHNET migrations (first pass)."

    & pnpm --filter @workspace/db run migrate

    if ($LASTEXITCODE -ne 0) {
      throw "First migration pass failed."
    }

    Write-Output "Running CASHNET migrations (idempotency pass)."

    & pnpm --filter @workspace/db run migrate

    if ($LASTEXITCODE -ne 0) {
      throw "Second migration pass failed."
    }
  }
  finally {
    Pop-Location
  }
}

Write-Output "Migration ledger:"

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
SELECT id, applied_at
FROM cashnet_schema_migrations
ORDER BY applied_at, id;
'@

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
DO $validation$
BEGIN
  IF NOT has_table_privilege(
    current_user,
    'public.cashnet_schema_migrations',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'CASHNET application role lacks SELECT on the migration ledger.';
  END IF;

  RAISE NOTICE
    'CASHNET application role has migration-ledger SELECT privilege.';
END $validation$;
'@

Write-Output "Application-role RBAC read privileges:"

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
DO $validation$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'users',
    'user_roles',
    'roles',
    'role_permissions',
    'permissions'
  ] LOOP

    IF NOT has_table_privilege(
      current_user,
      format('public.%I', required_table),
      'SELECT'
    ) THEN
      RAISE EXCEPTION
        'CASHNET application role lacks SELECT on public.%',
        required_table;
    END IF;

  END LOOP;

  RAISE NOTICE
    'CASHNET application role has required RBAC SELECT privileges.';
END $validation$;
'@

Write-Output "Phase 6 tables:"

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
WITH expected(table_name) AS (
  VALUES
    ('risk_analysis_runs'),
    ('risk_indicator_evidence'),
    ('risk_typologies'),
    ('graph_features'),
    ('community_analysis_runs'),
    ('graph_communities'),
    ('defi_protocol_interactions'),
    ('mev_candidates'),
    ('forensic_reports'),
    ('evaluation_runs')
)
SELECT
  expected.table_name,
  CASE
    WHEN relation.oid IS NULL THEN 'MISSING'
    ELSE 'PRESENT'
  END AS catalog_status,
  namespace.nspname AS schema_name
FROM expected
LEFT JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = expected.table_name
 AND relation.relkind IN ('r', 'p')
ORDER BY expected.table_name;

DO $validation$
DECLARE
  missing_tables text;
BEGIN

  WITH expected(table_name) AS (
    VALUES
      ('risk_analysis_runs'),
      ('risk_indicator_evidence'),
      ('risk_typologies'),
      ('graph_features'),
      ('community_analysis_runs'),
      ('graph_communities'),
      ('defi_protocol_interactions'),
      ('mev_candidates'),
      ('forensic_reports'),
      ('evaluation_runs')
  )
  SELECT
    string_agg(
      expected.table_name,
      ', '
      ORDER BY expected.table_name
    )
  INTO missing_tables
  FROM expected
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.table_name
   AND relation.relkind IN ('r', 'p')
  WHERE relation.oid IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Missing expected Phase 6 tables: %',
      missing_tables;
  END IF;

  RAISE NOTICE
    'All ten expected Phase 6 tables are present in pg_catalog.';
END $validation$;
'@

Write-Output "Phase 6 indexes, constraints, and foreign keys:"

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename IN (
      'risk_indicators',
      'risk_analysis_runs',
      'graph_features',
      'community_analysis_runs',
      'graph_communities',
      'defi_protocol_interactions',
      'mev_candidates',
      'forensic_reports'
    )
    OR indexname IN (
      'graph_features_case_insensitive_unique',
      'idx_risk_indicators_run'
    )
  )
ORDER BY tablename, indexname;

SELECT
  conrelid::regclass AS table_name,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'risk_indicators'::regclass,
  'graph_features'::regclass,
  'risk_analysis_runs'::regclass,
  'risk_indicator_evidence'::regclass,
  'community_analysis_runs'::regclass,
  'graph_communities'::regclass,
  'defi_protocol_interactions'::regclass,
  'mev_candidates'::regclass,
  'forensic_reports'::regclass
)
ORDER BY table_name, conname;

SELECT
  tgname,
  tgenabled,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'audit_events'::regclass
  AND NOT tgisinternal;
'@

Write-Output "Testing CASHNET least-privilege audit protections. No data is committed."

Invoke-CashnetPsql `
  -ConnectionString $DatabaseUrl `
  -ConnectionLabel "CASHNET application" `
  -Sql @'
DO $validation$
DECLARE
  target_id uuid;
BEGIN

  SELECT id
  INTO target_id
  FROM audit_events
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot validate audit immutability: audit_events is empty.';
  END IF;

  RAISE NOTICE
    'CASHNET audit SELECT allowed.';

  BEGIN

    UPDATE audit_events
    SET action = action
    WHERE id = target_id;

    RAISE EXCEPTION
      'CASHNET audit UPDATE unexpectedly succeeded.';

  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE
        'CASHNET audit UPDATE denied by table privileges.';

    WHEN raise_exception THEN

      IF SQLERRM =
        'Audit events are immutable. UPDATE and DELETE are not permitted.'
      THEN
        RAISE EXCEPTION
          'CASHNET audit UPDATE reached the trigger; expected table privilege denial.';
      ELSE
        RAISE;
      END IF;

  END;

  BEGIN

    DELETE FROM audit_events
    WHERE id = target_id;

    RAISE EXCEPTION
      'CASHNET audit DELETE unexpectedly succeeded.';

  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE
        'CASHNET audit DELETE denied by table privileges.';

    WHEN raise_exception THEN

      IF SQLERRM =
        'Audit events are immutable. UPDATE and DELETE are not permitted.'
      THEN
        RAISE EXCEPTION
          'CASHNET audit DELETE reached the trigger; expected table privilege denial.';
      ELSE
        RAISE;
      END IF;

  END;

END $validation$;
'@

Write-Output "Testing immutable audit trigger using the administrator-only validation connection. No data is committed."

Invoke-CashnetPsql `
  -ConnectionString $ValidationAdminDatabaseUrl `
  -ConnectionLabel "administrator audit-trigger" `
  -Sql @'
DO $validation$
DECLARE
  target_id uuid;
BEGIN

  SELECT id
  INTO target_id
  FROM audit_events
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot validate audit immutability: audit_events is empty.';
  END IF;

  BEGIN

    UPDATE audit_events
    SET action = action
    WHERE id = target_id;

    RAISE EXCEPTION
      'Administrator audit UPDATE unexpectedly succeeded.';

  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION
        'Administrator audit UPDATE was denied before the immutable trigger.';

    WHEN raise_exception THEN

      IF SQLERRM =
        'Audit events are immutable. UPDATE and DELETE are not permitted.'
      THEN
        RAISE NOTICE
          'Administrator audit UPDATE rejected by immutable-audit trigger.';
      ELSE
        RAISE;
      END IF;

  END;

  BEGIN

    DELETE FROM audit_events
    WHERE id = target_id;

    RAISE EXCEPTION
      'Administrator audit DELETE unexpectedly succeeded.';

  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION
        'Administrator audit DELETE was denied before the immutable trigger.';

    WHEN raise_exception THEN

      IF SQLERRM =
        'Audit events are immutable. UPDATE and DELETE are not permitted.'
      THEN
        RAISE NOTICE
          'Administrator audit DELETE rejected by immutable-audit trigger.';
      ELSE
        RAISE;
      END IF;

  END;

END $validation$;
'@

Write-Output "Phase 6 PostgreSQL validation completed. Review the ledger and catalog output before marking a release gate passed."