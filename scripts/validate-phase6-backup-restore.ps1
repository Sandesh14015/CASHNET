[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:CASHNET_MIGRATION_DATABASE_URL,
  [string]$RestoreValidationDatabaseUrl = $env:CASHNET_RESTORE_VALIDATION_DATABASE_URL,
  [string]$SupabaseCaCertPath = $env:CASHNET_SUPABASE_CA_CERT_PATH,
  [string]$OutputDirectory = (Join-Path $env:TEMP "cashnet-phase6-backup-validation"),
  [switch]$ConfirmCreateIsolatedRestoreDatabase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $ConfirmCreateIsolatedRestoreDatabase) {
  throw "Refusing to create an isolated restore database. Re-run with -ConfirmCreateIsolatedRestoreDatabase after confirming this is the authorised PostgreSQL environment."
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "CASHNET_MIGRATION_DATABASE_URL is required and is never printed." }
if ([string]::IsNullOrWhiteSpace($RestoreValidationDatabaseUrl)) { throw "CASHNET_RESTORE_VALIDATION_DATABASE_URL for a separately provisioned disposable Supabase project is required and is never printed." }
if ([string]::IsNullOrWhiteSpace($SupabaseCaCertPath) -or -not (Test-Path -LiteralPath $SupabaseCaCertPath -PathType Leaf)) { throw "CASHNET_SUPABASE_CA_CERT_PATH must identify the Supabase CA PEM. It is not printed." }
$env:PGSSLROOTCERT = [System.IO.Path]::GetFullPath($SupabaseCaCertPath)

function Resolve-PostgresExecutable([string]$CommandName) {
  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  $candidate = if ($null -ne $command) { [string]$command.Source } else { $null }
  if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "$CommandName client was not found. Add a PostgreSQL client binary to PATH; a local PostgreSQL server is neither used nor required." }
  return [System.IO.Path]::GetFullPath($candidate)
}

function Invoke-CashnetPsql([string]$Psql, [string]$Url, [string]$Sql, [switch]$Quiet) {
  if ($Quiet) {
    & $Psql --no-psqlrc --tuples-only --no-align --set "ON_ERROR_STOP=1" --dbname "$Url" --command "$Sql"
  } else {
    & $Psql --no-psqlrc --set "ON_ERROR_STOP=1" --dbname "$Url" --command "$Sql"
  }
  if ($LASTEXITCODE -ne 0) { throw "psql command failed." }
}

$psql = Resolve-PostgresExecutable "psql"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-EndpointIdentity([string]$Url) {
  $uri = [uri]$Url
  return "{0}|{1}|{2}|{3}" -f $uri.Host.ToLowerInvariant(), $uri.Port, $uri.AbsolutePath.Trim('/').ToLowerInvariant(), $uri.UserInfo.Split(':')[0].ToLowerInvariant()
}

if ((Get-EndpointIdentity $DatabaseUrl) -eq (Get-EndpointIdentity $RestoreValidationDatabaseUrl)) {
  throw "Restore validation must use a separately provisioned disposable Supabase project/endpoint, never the primary endpoint."
}
$targetDatabaseUrl = $RestoreValidationDatabaseUrl

Write-Host "Using separately provisioned disposable Supabase restore endpoint (primary is not modified)."

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$backupPath = Join-Path $OutputDirectory "cashnet-phase6-$timestamp.backup"
& (Join-Path $PSScriptRoot "backup-cashnet.ps1") -OutputPath $backupPath -DatabaseUrl $DatabaseUrl -SupabaseCaCertPath $SupabaseCaCertPath
& (Join-Path $PSScriptRoot "restore-cashnet.ps1") -BackupPath $backupPath -TargetDatabaseUrl $targetDatabaseUrl -PrimaryDatabaseUrl $DatabaseUrl -SupabaseCaCertPath $SupabaseCaCertPath -ConfirmIsolatedTarget

Write-Host "Verifying restored ledger, required data families, and audit immutability."
Invoke-CashnetPsql $psql $targetDatabaseUrl @'
SELECT 'migration_ledger' AS check, count(*)::text AS value FROM cashnet_schema_migrations
UNION ALL SELECT 'cases', count(*)::text FROM cases
UNION ALL SELECT 'investigations', count(*)::text FROM investigations
UNION ALL SELECT 'wallets', count(*)::text FROM wallets
UNION ALL SELECT 'transactions', count(*)::text FROM blockchain_transactions
UNION ALL SELECT 'graph_relationships', count(*)::text FROM investigation_graph_relationships
UNION ALL SELECT 'risk_runs', count(*)::text FROM risk_analysis_runs
UNION ALL SELECT 'risk_indicators', count(*)::text FROM risk_indicators
UNION ALL SELECT 'defi_interactions', count(*)::text FROM defi_protocol_interactions
UNION ALL SELECT 'mev_candidates', count(*)::text FROM mev_candidates
UNION ALL SELECT 'reports', count(*)::text FROM forensic_reports
UNION ALL SELECT 'audit_events', count(*)::text FROM audit_events
ORDER BY 1;
'@

Invoke-CashnetPsql $psql $targetDatabaseUrl @'
DO $validation$
DECLARE target_id uuid;
BEGIN
  SELECT id INTO target_id FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 1;
  IF target_id IS NULL THEN RAISE EXCEPTION 'Restored audit_events is empty.'; END IF;
  BEGIN
    UPDATE audit_events SET action = action WHERE id = target_id;
    RAISE EXCEPTION 'Restored audit UPDATE was not rejected.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Audit events are immutable. UPDATE and DELETE are not permitted.' THEN
      RAISE NOTICE 'Restored audit UPDATE rejected by immutable-audit trigger.';
    ELSE RAISE;
    END IF;
  END;
  BEGIN
    DELETE FROM audit_events WHERE id = target_id;
    RAISE EXCEPTION 'Restored audit DELETE was not rejected.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Audit events are immutable. UPDATE and DELETE are not permitted.' THEN
      RAISE NOTICE 'Restored audit DELETE rejected by immutable-audit trigger.';
    ELSE RAISE;
    END IF;
  END;
END $validation$;
'@

$manifestHash = (Get-Content -Raw -LiteralPath "$backupPath.manifest.json" | ConvertFrom-Json).sha256
Write-Host "PASS: backup=$backupPath manifest_sha256=$manifestHash restore_target=separate-supabase-project"
Write-Host "The disposable restore project is intentionally retained for inspection. Delete it only under an approved cleanup procedure."
