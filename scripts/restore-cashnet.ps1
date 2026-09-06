[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $BackupPath,
  [Parameter(Mandatory = $true)] [string] $TargetDatabaseUrl,
  [Parameter(Mandatory = $true)] [string] $PrimaryDatabaseUrl,
  [string] $SupabaseCaCertPath = $env:CASHNET_SUPABASE_CA_CERT_PATH,
  [switch] $ConfirmIsolatedTarget,
  [string] $PgRestorePath
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmIsolatedTarget) { throw "Restore requires -ConfirmIsolatedTarget and must target a disposable isolated database." }
if ([string]::IsNullOrWhiteSpace($SupabaseCaCertPath) -or -not (Test-Path -LiteralPath $SupabaseCaCertPath -PathType Leaf)) { throw "CASHNET_SUPABASE_CA_CERT_PATH must identify the Supabase CA PEM. It is not printed." }
$env:PGSSLROOTCERT = [System.IO.Path]::GetFullPath($SupabaseCaCertPath)
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) { throw "Backup file was not found." }
$manifestPath = "$resolvedBackup.manifest.json"
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedBackup).Hash.ToLowerInvariant()
  if ($manifest.sha256 -ne $actual) { throw "Backup integrity verification failed." }
}
function Get-EndpointIdentity([string]$Url) {
  $uri = [uri]$Url
  return "{0}|{1}|{2}|{3}" -f $uri.Host.ToLowerInvariant(), $uri.Port, $uri.AbsolutePath.Trim('/').ToLowerInvariant(), $uri.UserInfo.Split(':')[0].ToLowerInvariant()
}

if ((Get-EndpointIdentity $TargetDatabaseUrl) -eq (Get-EndpointIdentity $PrimaryDatabaseUrl)) {
  throw "Refusing to restore into the primary database endpoint. Use a separate disposable Supabase project/endpoint."
}

function Resolve-PgRestore([string]$RequestedPath) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidate = [string]$RequestedPath
  } else {
    $command = Get-Command pg_restore -ErrorAction SilentlyContinue
    $candidate = if ($null -ne $command) { [string]$command.Source } else { $null }
  }
  if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "pg_restore client was not found. Supply -PgRestorePath or add a PostgreSQL client binary to PATH; a local PostgreSQL server is neither used nor required." }
  return [System.IO.Path]::GetFullPath($candidate)
}

$pgRestore = Resolve-PgRestore $PgRestorePath
& $pgRestore --clean --if-exists --no-owner --no-privileges "--dbname=$TargetDatabaseUrl" $resolvedBackup
if ($LASTEXITCODE -notin @(0, 1)) { throw "pg_restore failed." }
Write-Output "Restore completed. Next verify the migration ledger, foreign keys, record counts, and audit immutability before any controlled promotion."
