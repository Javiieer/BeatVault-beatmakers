param([ValidateSet('api', 'web', 'diagnose')][string]$Service = 'web', [ValidateSet('auto', 'postgres', 'json')][string]$Backend = 'auto')
. (Join-Path $PSScriptRoot 'windows-env.ps1')
Push-Location $beatVaultRoot
try {
    switch ($Service) {
        'api' {
            $env:NODE_ENV = 'development'
            $env:BEATVAULT_HOST = '127.0.0.1'
            if (!$env:BEATVAULT_UPLOAD_DIR -or ![IO.Path]::IsPathRooted($env:BEATVAULT_UPLOAD_DIR)) {
                throw 'Configura una ruta absoluta para BEATVAULT_UPLOAD_DIR antes de iniciar la API.'
            }
            $uploadDriveRoot = [IO.Path]::GetPathRoot($env:BEATVAULT_UPLOAD_DIR)
            if (!(Test-Path -LiteralPath $uploadDriveRoot -PathType Container)) {
                throw "No está disponible el volumen de almacenamiento configurado: $uploadDriveRoot"
            }
            New-Item -ItemType Directory -Path $env:BEATVAULT_UPLOAD_DIR -Force | Out-Null
            $localPgPath = Join-Path $beatVaultRoot '.tools/postgresql/local-config.json'
            $localPg = if (Test-Path $localPgPath) { Get-Content -LiteralPath $localPgPath -Raw | ConvertFrom-Json } else { $null }
            $usePg = $Backend -eq 'postgres' -or ($Backend -eq 'auto' -and $localPg -and $localPg.active)
            if ($usePg) {
                if (!$localPg -or !$localPg.active) { throw 'PostgreSQL local debe migrarse y verificarse antes de activarlo.' }
                & (Join-Path $PSScriptRoot 'postgres-local.ps1') -Action start
                if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL local.' }
                $env:BEATVAULT_STORAGE_BACKEND = 'postgres'
                $env:DATABASE_URL = 'postgresql://{0}:{1}@{2}:{3}/{4}' -f [Uri]::EscapeDataString($localPg.appUser), [Uri]::EscapeDataString($localPg.appPassword), $localPg.host, $localPg.port, $localPg.database
            } else {
                $env:BEATVAULT_STORAGE_BACKEND = 'json'
                Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
            }
            & npm.cmd run server
        }
        'web' { & npm.cmd run dev -- --host 127.0.0.1 --port 5188 --strictPort }
        'diagnose' { & npm.cmd run diagnose }
    }
    $beatVaultExitCode = $LASTEXITCODE
} finally { Pop-Location }
exit $beatVaultExitCode
