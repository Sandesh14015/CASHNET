[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$ApiBaseUrl = "http://127.0.0.1:5000",
  [string]$Actor = "demo.admin",
  [string]$SupabaseCaCertPath = $env:CASHNET_SUPABASE_CA_CERT_PATH,
  [string]$PsqlPath,
  [switch]$ConfirmCreateValidationFixture
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $ConfirmCreateValidationFixture) {
  throw "Refusing to create persistent validation data. Re-run with -ConfirmCreateValidationFixture after confirming the target is the authorised development database."
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required. It is intentionally not printed."
}
if ([string]::IsNullOrWhiteSpace($SupabaseCaCertPath) -or -not (Test-Path -LiteralPath $SupabaseCaCertPath -PathType Leaf)) {
  throw "CASHNET_SUPABASE_CA_CERT_PATH must identify the Supabase CA PEM. It is not printed."
}
$env:PGSSLROOTCERT = [System.IO.Path]::GetFullPath($SupabaseCaCertPath)
try { $databaseUri = [uri]$DatabaseUrl } catch { throw "DATABASE_URL must be a valid PostgreSQL URL." }
$databaseHost = $databaseUri.Host.ToLowerInvariant()
if ($databaseHost -in @("localhost", "127.0.0.1", "::1") -or $databaseHost.EndsWith(".local")) {
  throw "DATABASE_URL must target Supabase, not a local PostgreSQL service."
}
if (-not ($databaseHost.EndsWith(".supabase.co") -or $databaseHost.EndsWith(".pooler.supabase.com"))) {
  throw "DATABASE_URL must use an official Supabase direct or pooler hostname."
}
if ($databaseUri.Query -notmatch "(?i)(^|[?&])sslmode=verify-full(&|$)") {
  throw "DATABASE_URL must require certificate and hostname verification using sslmode=verify-full."
}
if ([uri]$ApiBaseUrl -isnot [uri]) {
  throw "ApiBaseUrl must be an absolute HTTP(S) URL."
}

function Resolve-Psql([string]$RequestedPath) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    $candidate = [string]$RequestedPath
  } else {
    $command = Get-Command psql -ErrorAction SilentlyContinue
    $candidate = if ($null -ne $command) { [string]$command.Source } else { $null }
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "psql client was not found. Supply -PsqlPath or add a PostgreSQL client binary to PATH; a local PostgreSQL server is neither used nor required."
  }
  return [System.IO.Path]::GetFullPath($candidate)
}

$psql = Resolve-Psql $PsqlPath

function Invoke-CashnetPsql([string]$Sql, [switch]$Quiet) {
  # Keep the complete SQL command and the executable path as distinct scalar
  # arguments on Windows PowerShell 5.1 and PowerShell 7.
  if ($Quiet) {
    & $psql --no-psqlrc --tuples-only --no-align --set "ON_ERROR_STOP=1" --dbname "$DatabaseUrl" --command "$Sql"
  } else {
    & $psql --no-psqlrc --set "ON_ERROR_STOP=1" --dbname "$DatabaseUrl" --command "$Sql"
  }
  if ($LASTEXITCODE -ne 0) { throw "psql command failed." }
}

function Invoke-CashnetApi([string]$Method, [string]$Path, [object]$Body = $null) {
  $headers = @{ "X-Cashnet-Dev-Actor" = $Actor; Accept = "application/json" }
  $params = @{ Method = $Method; Uri = "$($ApiBaseUrl.TrimEnd('/'))$Path"; Headers = $headers; ContentType = "application/json"; ErrorAction = "Stop" }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress) }
  return Invoke-RestMethod @params
}

function Assert-Value([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
$target = "0x0000000000000000000000000000000000000a11"
$router = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d"
$attacker = "0x0000000000000000000000000000000000000a77"
$pool = "0x0000000000000000000000000000000000000c0f"
$token = "0x0000000000000000000000000000000000000e20"

Write-Host "Creating clearly marked, controlled Phase 6 validation case through the API."
$case = Invoke-CashnetApi "POST" "/api/v1/cases" @{ caseNumber = "PHASE6-VALIDATION-$suffix"; title = "Phase 6 controlled validation fixture"; description = "Synthetic, non-criminal validation data. Not investigative intelligence or an attribution."; fraudType = "VALIDATION_FIXTURE"; reportedAmount = "0"; priority = "LOW" }
Assert-Value ($null -ne $case.id) "Case creation did not return an id."

$case = Invoke-CashnetApi "PATCH" "/api/v1/cases/$($case.id)" @{ investigationAuthorizationStatus = "APPROVED" }
Assert-Value ($case.investigationAuthorizationStatus -eq "APPROVED") "Case authorisation was not approved."

$investigation = Invoke-CashnetApi "POST" "/api/v1/investigations" @{ caseId = $case.id; chain = "ETHEREUM"; walletAddress = $target; investigationDepth = 2 }
Assert-Value ($null -ne $investigation.id) "Investigation creation did not return an id."
$investigation = Invoke-CashnetApi "PATCH" "/api/v1/investigations/$($investigation.id)" @{ status = "AUTHORIZED" }
Assert-Value ($investigation.status -eq "AUTHORIZED") "Investigation transition was not authorised."

$caseId = [string]$case.id
$investigationId = [string]$investigation.id
Assert-Value ($caseId -match '^[0-9a-fA-F-]{36}$' -and $investigationId -match '^[0-9a-fA-F-]{36}$') "API returned a non-UUID identifier."

$rows = @()
for ($i = 1; $i -le 5; $i++) {
  $sender = "0x{0:x40}" -f $i
  $rows += "('$caseId'::uuid, 'ETHEREUM', 'phase6-validation-in-$suffix-$i', '$sender', '$target', 'TRANSFER', 'ETH', $i, NULL, 900001, now() - interval '5 minutes' + interval '$i minutes', 'SUCCESS', 'INFERENCE', 'CONTROLLED_VALIDATION_FIXTURE', 'controlled-fixture-not-live', 'phase6-validation-$suffix', now(), 'cashnet-phase6-validation-fixture')"
}
for ($i = 1; $i -le 5; $i++) {
  $recipient = if ($i -eq 1) { $router } else { "0x{0:x40}" -f (100 + $i) }
  $relationship = if ($i -eq 1) { "CONTRACT_INTERACTION" } else { "TRANSFER" }
  $rows += "('$caseId'::uuid, 'ETHEREUM', 'phase6-validation-out-$suffix-$i', '$target', '$recipient', '$relationship', 'ETH', $i, NULL, 900001, now() - interval '4 minutes' + interval '$i minutes', 'SUCCESS', 'INFERENCE', 'CONTROLLED_VALIDATION_FIXTURE', 'controlled-fixture-not-live', 'phase6-validation-$suffix', now(), 'cashnet-phase6-validation-fixture')"
}
$rows += "('$caseId'::uuid, 'ETHEREUM', 'phase6-validation-mev-front-$suffix', '$pool', '$attacker', 'TOKEN_TRANSFER', 'TOKEN', 10, '$token', 900002, now(), 'SUCCESS', 'INFERENCE', 'CONTROLLED_VALIDATION_FIXTURE', 'controlled-fixture-not-live', 'phase6-validation-$suffix', now(), 'cashnet-phase6-validation-fixture')"
$rows += "('$caseId'::uuid, 'ETHEREUM', 'phase6-validation-mev-victim-$suffix', '0x0000000000000000000000000000000000000b00', '$pool', 'TOKEN_TRANSFER', 'TOKEN', 5, '$token', 900002, now(), 'SUCCESS', 'INFERENCE', 'CONTROLLED_VALIDATION_FIXTURE', 'controlled-fixture-not-live', 'phase6-validation-$suffix', now(), 'cashnet-phase6-validation-fixture')"
$rows += "('$caseId'::uuid, 'ETHEREUM', 'phase6-validation-mev-back-$suffix', '$attacker', '$pool', 'TOKEN_TRANSFER', 'TOKEN', 11, '$token', 900002, now(), 'SUCCESS', 'INFERENCE', 'CONTROLLED_VALIDATION_FIXTURE', 'controlled-fixture-not-live', 'phase6-validation-$suffix', now(), 'cashnet-phase6-validation-fixture')"

$insert = @"
INSERT INTO investigation_graph_relationships
  (case_id, chain, transaction_hash, from_address, to_address, relationship_type, asset, amount_numeric, token_contract, block_number, block_timestamp, execution_status, derivation_source_type, provider, source_reference, raw_reference, retrieved_at, method)
VALUES
$($rows -join ",`n")
ON CONFLICT DO NOTHING;
"@
Invoke-CashnetPsql $insert

Write-Host "Executing bounded, persistent Phase 6 analyses through the authorised HTTP API."
$risk = Invoke-CashnetApi "POST" "/api/v1/investigations/$investigationId/risk-analysis"
Assert-Value ($risk.indicators.Count -gt 0) "Controlled fixture did not produce a non-empty AML result."
$features = Invoke-CashnetApi "POST" "/api/v1/investigations/$investigationId/graph-features" @{ max_edges = 100 }
Assert-Value ($features.features.Count -gt 0) "Controlled fixture did not produce graph features."
$communities = Invoke-CashnetApi "POST" "/api/v1/investigations/$investigationId/communities" @{ max_nodes = 100; max_edges = 100; max_runtime_ms = 1000; max_communities = 10 }
Assert-Value ($communities.communities.Count -gt 0) "Controlled fixture did not produce a community."
$defi = Invoke-CashnetApi "POST" "/api/v1/investigations/$investigationId/defi-mev-analysis"
Assert-Value ($defi.interactions.Count -gt 0 -and $defi.mev.candidates.Count -gt 0) "Controlled fixture did not produce both DeFi and historical MEV candidates."
$report = Invoke-CashnetApi "POST" "/api/v1/investigations/$investigationId/reports" @{ report_type = "FULL_FORENSIC" }
Assert-Value ($null -ne $report.id) "Privileged report generation did not return a persisted report id."
$storedReport = Invoke-CashnetApi "GET" "/api/v1/investigations/$investigationId/reports/$($report.id)"
$sectionTypes = @($storedReport.content.sections | ForEach-Object { [string]$_.type })
foreach ($requiredSection in @("FACTS", "OBSERVATIONS", "INFERENCES", "ASSESSMENTS", "CONTRADICTIONS", "REVIEW_DECISIONS", "PROVENANCE", "AUDIT")) {
  Assert-Value ($sectionTypes -contains $requiredSection) "Persisted report is missing required $requiredSection section."
}
Assert-Value ([string]$storedReport.content.disclaimer -match "NOT probabilities") "Persisted report is missing the heuristic-score disclaimer."

$verificationSql = @"
SELECT json_build_object(
  'risk_runs', (SELECT count(*) FROM risk_analysis_runs WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'risk_indicators', (SELECT count(*) FROM risk_indicators WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'risk_evidence', (SELECT count(*) FROM risk_indicator_evidence rie JOIN risk_indicators ri ON ri.id = rie.indicator_id WHERE ri.case_id = '$caseId'::uuid AND ri.investigation_id = '$investigationId'::uuid),
  'graph_features', (SELECT count(*) FROM graph_features WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'community_runs', (SELECT count(*) FROM community_analysis_runs WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'defi_interactions', (SELECT count(*) FROM defi_protocol_interactions WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'mev_candidates', (SELECT count(*) FROM mev_candidates WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'reports', (SELECT count(*) FROM forensic_reports WHERE case_id = '$caseId'::uuid AND investigation_id = '$investigationId'::uuid),
  'audit_events', (SELECT count(*) FROM audit_events WHERE case_id = '$caseId'::uuid)
);
"@
$verification = Invoke-CashnetPsql $verificationSql -Quiet
$verificationObject = (($verification -join "`n") | ConvertFrom-Json)
foreach ($requiredCount in @("risk_runs", "risk_indicators", "risk_evidence", "graph_features", "community_runs", "defi_interactions", "mev_candidates", "reports", "audit_events")) {
  Assert-Value ([int]$verificationObject.$requiredCount -gt 0) "Persistence verification found no $requiredCount row for the controlled fixture."
}
Write-Host "Persistence verification: $($verificationObject | ConvertTo-Json -Compress)"
Write-Host "PASS: controlled fixture IDs (safe to retain for auditability): case=$caseId investigation=$investigationId report=$($report.id)"
Write-Host "This output is a controlled validation result, not live provider intelligence or an attribution."
