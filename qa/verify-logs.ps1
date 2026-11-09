param(
  [Parameter(Mandatory=$true)][string]$Report,
  [Parameter(Mandatory=$true)][string]$Output,
  [string]$ExpectedProxyConfig = (Join-Path $PSScriptRoot 'nginx.conf'),
  [string]$DeployProxyConfig = (Join-Path $PSScriptRoot '../deploy/nginx.conf')
)
$ErrorActionPreference = 'Stop'
$proof = Get-Content -Raw -LiteralPath $Report | ConvertFrom-Json
$allowed = @{
  'cms-remediation-fixed-20261109'='cms_remediation_fixed_20261109'
  'cms-remediation-restored-20261109'='cms_remediation_restored_20261109'
}
$project = [string]$proof.target.project
if (!$allowed.ContainsKey($project) -or $allowed[$project] -ne $proof.target.database) { throw 'Only exact fixed/restored remediation project/database pairs are allowed' }
if (!$proof.log_probe -or $proof.summary.FAIL -or $proof.summary.BLOCKED) { throw 'Successful independent log probes are required' }
function Read-Docker([string[]]$Arguments) {
  $captured = & docker @Arguments 2>&1 | Out-String
  if ($LASTEXITCODE) { throw 'Docker log/config capture failed; raw output withheld' }
  return $captured
}
function Hash-Text([string]$Value) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLower() }
  finally { $algorithm.Dispose() }
}
$backend = "$project-backend-1"
$gateway = "$project-gateway-1"
foreach ($container in @($backend,$gateway)) {
  $owner = (Read-Docker @('inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',$container)).Trim()
  if ($owner -ne $project) { throw 'Container project-label verification failed' }
}
# PowerShell may deserialize ISO JSON timestamps as DateTime; explicit UTC
# formatting avoids passing locale-formatted dates to Docker.
$from = ([DateTimeOffset]$proof.log_probe.started_at).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$until = ([DateTimeOffset]$proof.log_probe.finished_at).ToUniversalTime().AddSeconds(1).ToString('yyyy-MM-ddTHH:mm:ssZ')
$backendLogs = Read-Docker @('logs','--since',$from,'--until',$until,$backend)
$proxyLogs = Read-Docker @('logs','--since',$from,'--until',$until,$gateway)
$config = Read-Docker @('exec',$gateway,'cat','/etc/nginx/nginx.conf')
$syntaxProof = Read-Docker @('exec',$gateway,'nginx','-t')
$deployPath = (Resolve-Path -LiteralPath $DeployProxyConfig).Path
$copied = Read-Docker @('cp',$deployPath,"${gateway}:/tmp/cms-deploy-nginx-qa.conf")
$deploySyntaxProof = Read-Docker @('exec',$gateway,'nginx','-t','-c','/tmp/cms-deploy-nginx-qa.conf')
$normalize = { param($value) $value.Replace("`r`n","`n").TrimEnd()+"`n" }
$expected = Get-Content -Raw -LiteralPath $ExpectedProxyConfig
$configHash = Hash-Text (& $normalize $config)
$expectedHash = Hash-Text (& $normalize $expected)
$marker = 'SYNTHETIC_SECRET_' + [string]$proof.runId
$count = { param($text,$value) ([regex]::Matches($text,[regex]::Escape($value))).Count }
$backendMatches = & $count $backendLogs $marker
$proxyMatches = & $count $proxyLogs $marker
$backendCorrelation = & $count $backendLogs ([string]$proof.log_probe.public_correlation)
$redactedPreview = & $count $backendLogs '/store/content/preview/[REDACTED]'
$records = foreach ($line in ($proxyLogs -split "`r?`n")) {
  if ($line.TrimStart().StartsWith('{')) { try { $line | ConvertFrom-Json } catch {} }
}
$ids = @($proof.log_probe.requests | ForEach-Object { $_.proxy_request_id })
$seen = @($records | Where-Object { $_.request_id -in $ids })
$allProxyRequests = $ids.Count -gt 0 -and @($ids | Where-Object { !$_ -or $_ -notin $seen.request_id }).Count -eq 0
$safeErrors = $config -match '(?m)^\s*error_log\s+/dev/null\s+crit\s*;' -and @($seen | Where-Object { $_.status -eq 502 -and $_.surface -eq 'qa-probe' }).Count -eq 1
$status = if ($backendMatches -or $proxyMatches) { 'FAIL' } elseif ($configHash -ne $expectedHash -or !$allProxyRequests -or !$safeErrors -or !$backendCorrelation -or !$redactedPreview) { 'BLOCKED' } else { 'PASS' }
$result = [ordered]@{
  finding='F6';status=$status;project=$project;run_id=$proof.runId
  source_manifest_sha256=$proof.runtime.source_manifest_sha256
  backend=@{captured=($backendLogs.Length -gt 0);marker_matches=$backendMatches;public_correlation_entries=$backendCorrelation;redacted_preview_entries=$redactedPreview;sha256=(Hash-Text $backendLogs)}
  proxy=@{captured=$allProxyRequests;marker_matches=$proxyMatches;matched_requests=$seen.Count;expected_requests=$ids.Count;sha256=(Hash-Text $proxyLogs)}
  error=@{raw_proxy_error_log_disabled=$safeErrors;upstream_failure_safely_recorded=$safeErrors;backend_error_probe_verified=($proof.log_probe.requests | Where-Object label -eq 'encoded-path-error').status -eq 400}
  proxy_config=@{matches_committed=($configHash -eq $expectedHash);runtime_sha256=$configHash;committed_sha256=$expectedHash;nginx_syntax_test='PASS';deploy_config_syntax_test='PASS';deploy_config_sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $deployPath).Hash.ToLower()}
  raw_logs_saved=$false
}
$parent = Split-Path -Parent ([IO.Path]::GetFullPath($Output))
[void][IO.Directory]::CreateDirectory($parent)
if (Test-Path -LiteralPath $Output) {
  $previousHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Output).Hash.ToLower().Substring(0,12)
  $archive = "$Output.previous-$previousHash.json"
  if (!(Test-Path -LiteralPath $archive)) { Copy-Item -LiteralPath $Output -Destination $archive }
}
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath $Output
$result | ConvertTo-Json -Depth 8
if ($status -ne 'PASS') { exit 1 }
