param([string]$Repo=(Split-Path $PSScriptRoot -Parent),[string]$OutputDirectory)
$ErrorActionPreference='Stop'
if (!$OutputDirectory) { $OutputDirectory=Join-Path $Repo '.local/cms-remediation-fixed-20261109/context' }
$resolved=[IO.Path]::GetFullPath($OutputDirectory)
$allowed=[IO.Path]::GetFullPath((Join-Path $Repo '.local/cms-remediation-'))
if (!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot must stay in remediation private directories' }
if (Test-Path -LiteralPath $resolved) { throw 'Use a new snapshot directory; do not overwrite evidence' }
[void][IO.Directory]::CreateDirectory($resolved)
$paths=@(git -C $Repo -c core.quotepath=false ls-files --cached --others --exclude-standard -- package.json pnpm-lock.yaml pnpm-workspace.yaml patches eslint.config.ts scripts qa apps/backend apps/storefront)
if ($LASTEXITCODE) { throw 'git inventory failed' }
# This curated JSON is a required runtime asset for InSales validation and is
# intentionally shipped with the source snapshot. Customer seed/import payloads
# remain excluded from release snapshots.
$paths += 'apps/backend/src/scripts/data/catalog-navigation.json'
$manifest=foreach($relative in ($paths|Sort-Object -Unique)) {
  if ($relative -match '(^|/)(node_modules|\.git|\.local|\.medusa|\.next|\.turbo|static|dist|output)/' -or $relative -match '^apps/backend/uploads/' -or $relative -match '(^|/)\.env' -or $relative -match '(tsbuildinfo|\.log|\.dump|\.zip|\.csv|\.xlsx|\.bak)$' -or ($relative -match '^apps/backend/src/scripts/data/' -and $relative -ne 'apps/backend/src/scripts/data/catalog-navigation.json')) { continue }
  $from=Join-Path $Repo $relative
  if (!(Test-Path -LiteralPath $from -PathType Leaf)) {continue}
  $to=Join-Path $resolved $relative
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to))
  Copy-Item -LiteralPath $from -Destination $to
  [pscustomobject]@{path=$relative;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $to).Hash.ToLower()}
}
$manifest|ConvertTo-Json -Depth 3|Set-Content -Encoding utf8 -LiteralPath (Join-Path $resolved 'qa-source-manifest.json')
git -C $Repo rev-parse HEAD|Set-Content -LiteralPath (Join-Path $resolved 'qa-source-head.txt')
@'
FROM cms-clothing-qa-20261109:initial
WORKDIR /server
RUN rm -rf apps/backend/src apps/backend/.medusa apps/backend/static apps/backend/uploads apps/storefront/src apps/storefront/public apps/storefront/.next
COPY . /server
RUN pnpm install --offline --frozen-lockfile --ignore-scripts
'@|Set-Content -Encoding ascii -LiteralPath (Join-Path $resolved 'Dockerfile')
"Snapshot files: $($manifest.Count)"
