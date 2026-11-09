param(
  [string]$Repo = (Split-Path $PSScriptRoot -Parent),
  [ValidateSet('baseline','fixed','restored')][string]$Stage = 'fixed'
)
$ErrorActionPreference = 'Stop'
$project = "cms-remediation-$Stage-20261109"
$target = Join-Path $Repo ".local/$project"
if (Test-Path -LiteralPath $target) { throw 'Refusing to replace an existing installation' }
$source = Join-Path $Repo '.local/cms-clothing-qa-20261109'
$cfg = Get-Content -LiteralPath (Join-Path $source 'compose.qa.json') -Raw | ConvertFrom-Json
$cfg.name = $project
$offset = @{baseline=0;fixed=10;restored=20}[$Stage]
$backendPort = 19159 + $offset
$storefrontPort = 18159 + $offset
$hmrPort = 15159 + $offset
$hostName = "remediation-$Stage.localhost"
$dbName = "cms_remediation_$($Stage)_20261109"
$password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$cfg.services.db.environment.POSTGRES_DB = $dbName
$cfg.services.db.environment.POSTGRES_PASSWORD = $password
$cfg.services.backend.environment.DATABASE_URL = "postgresql://clothing_runner:$password@db:5432/$dbName"
$cfg.services.backend.environment.JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$cfg.services.backend.environment.COOKIE_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$cfg.services.backend.environment.STORE_CORS = "http://$($hostName):$storefrontPort,http://127.0.0.1:$storefrontPort"
$cfg.services.backend.environment.ADMIN_CORS = "http://$($hostName):$backendPort,http://$($hostName):$hmrPort,http://127.0.0.1:$backendPort"
$cfg.services.backend.environment.AUTH_CORS = "$($cfg.services.backend.environment.STORE_CORS),$($cfg.services.backend.environment.ADMIN_CORS)"
$cfg.services.backend.environment.MEDUSA_ADMIN_HMR_CLIENT_PORT = "$hmrPort"
$cfg.services.backend.environment.VITE_STOREFRONT_URL = "http://$($hostName):$storefrontPort"
$cfg.services.backend.environment.QA_MEDIA_PUBLIC_URL = "http://$($hostName):$backendPort/static"
$cfg.services.backend.environment | Add-Member -NotePropertyName FILE_PUBLIC_URL -NotePropertyValue "http://$($hostName):$backendPort/static" -Force
$cfg.services.backend.environment | Add-Member -NotePropertyName QA_PROJECT -NotePropertyValue $project -Force
$cfg.services.backend.environment | Add-Member -NotePropertyName QA_ADMIN_EMAIL -NotePropertyValue 'clothing-admin@example.test' -Force
$cfg.services.storefront.environment.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://$($hostName):$backendPort"
$cfg.services.storefront.environment.NEXT_PUBLIC_BASE_URL = "http://$($hostName):$storefrontPort"
$cfg.services.gateway.ports = @("127.0.0.1:$($backendPort):9000","127.0.0.1:$($storefrontPort):8000","127.0.0.1:$($hmrPort):5173")
$cfg.services.backend.image = if ($Stage -eq 'baseline') {'cms-clothing-qa-20261109:initial'} else {'cms-remediation-20261109:fixed'}
$cfg.services.storefront.image = $cfg.services.backend.image
$cfg.services.backend.command = @('pnpm','dev')
$cfg.services.storefront.command = @('pnpm','dev','--webpack','--hostname','0.0.0.0')
$cfg.services.backend.volumes = @('clothing_media:/server/apps/backend/static','./medusa-config.instance.ts:/server/apps/backend/medusa-config.ts:ro')
if ($Stage -ne 'baseline') {
  $cfg.volumes | Add-Member -NotePropertyName private_media -NotePropertyValue @{} -Force
  $cfg.services.backend.volumes += 'private_media:/server/apps/backend/private-files'
}
[void][IO.Directory]::CreateDirectory($target)
$cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $target 'compose.qa.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $source 'nginx-qa.conf') -Destination $target
# The source config supplies baseline's local-file URL. Fixed uses its own provider config.
$configSource = if ($Stage -eq 'baseline') { Join-Path $source 'medusa-config.instance.ts' } else { Join-Path $Repo 'apps/backend/medusa-config.ts' }
Copy-Item -LiteralPath $configSource -Destination (Join-Path $target 'medusa-config.instance.ts')
Set-Acl -LiteralPath $target -AclObject (Get-Acl -LiteralPath $source)
[pscustomobject]@{project=$project;database=$dbName;backend_port=$backendPort;storefront_port=$storefrontPort;private_directory=$target} | ConvertTo-Json
