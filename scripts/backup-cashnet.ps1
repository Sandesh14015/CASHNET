[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $OutputPath,
  [string] $DatabaseUrl = $env:CASHNET_MIGRATION_DATABASE_URL,
  [string] $SupabaseCaCertPath = $env:CASHNET_SUPABASE_CA_CERT_PATH,
  [string] $PgDumpPath
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "CASHNET_MIGRATION_DATABASE_URL is required for Supabase backup. It is never printed by this script." }
if ([string]::IsNullOrWhiteSpace($SupabaseCaCertPath) -or -not (Test-Path -LiteralPath $SupabaseCaCertPath -PathType Leaf)) { throw "CASHNET_SUPABASE_CA_CERT_PATH must identify the Supabase CA PEM. It is not printed." }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { throw "OutputPath is required." }
$env:PGSSLROOTCERT = [System.IO.Path]::GetFullPath($SupabaseCaCertPath)

function Resolve-PgDump([string]$RequestedPath) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidate = [string]$RequestedPath
  } else {
    $command = Get-Command pg_dump -ErrorAction SilentlyContinue
    $candidate = if ($null -ne $command) { [string]$command.Source } else { $null }
  }
  if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "pg_dump client was not found. Supply -PgDumpPath or add a PostgreSQL client binary to PATH; a local PostgreSQL server is neither used nor required." }
  return [System.IO.Path]::GetFullPath($candidate)
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if ([string]::IsNullOrWhiteSpace($outputDirectory)) { throw "OutputPath must include a directory." }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$pgDump = Resolve-PgDump $PgDumpPath
& $pgDump --format=custom --no-owner --no-privileges "--file=$resolvedOutput" $DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput).Hash.ToLowerInvariant()
$manifest = [ordered]@{ createdAt = (Get-Date).ToUniversalTime().ToString("o"); file = [System.IO.Path]::GetFileName($resolvedOutput); sha256 = $hash; format = "pg_dump custom" } | ConvertTo-Json
Set-Content -NoNewline -Encoding utf8 -LiteralPath "$resolvedOutput.manifest.json" -Value $manifest
Write-Output "Backup created and SHA-256 manifest written. Store both files in approved encrypted storage; apply retention under the case-data retention policy."
