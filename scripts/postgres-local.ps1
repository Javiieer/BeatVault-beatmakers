param([ValidateSet('start', 'stop', 'status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$pgWorkspace = Split-Path $PSScriptRoot -Parent
$pgTools = Join-Path $pgWorkspace '.tools/postgresql'
$pgBin = Join-Path $pgTools 'pgsql/bin'
$pgConfigPath = Join-Path $pgTools 'local-config.json'
$pgCluster = Join-Path $pgWorkspace 'data/postgres-local'
if (!(Test-Path (Join-Path $pgBin 'pg_ctl.exe'))) { throw 'Faltan los binarios PostgreSQL en .tools/postgresql/pgsql/bin.' }
if ($Action -ne 'start' -and !(Test-Path (Join-Path $pgCluster 'PG_VERSION'))) { throw 'El clúster local todavía no fue inicializado.' }
if (!(Test-Path $pgConfigPath)) {
    if (Test-Path (Join-Path $pgCluster 'PG_VERSION')) { throw 'Existe un clúster sin su configuración privada. Recupera local-config.json; no se generaron credenciales nuevas.' }
    function New-LocalPassword { $bytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }; [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
    @{ host='127.0.0.1'; port=55432; adminUser='beatvault_admin'; adminPassword=(New-LocalPassword); appUser='beatvault_app'; appPassword=(New-LocalPassword); database='beatvault_local'; active=$false } | ConvertTo-Json | Set-Content -LiteralPath $pgConfigPath
}
$pgLocal = Get-Content -LiteralPath $pgConfigPath -Raw | ConvertFrom-Json
if ($pgLocal.host -ne '127.0.0.1' -or $pgLocal.port -ne 55432 -or $pgLocal.database -ne 'beatvault_local') { throw 'La configuración no corresponde al clúster local esperado.' }
if ($Action -eq 'stop') { & "$pgBin/pg_ctl.exe" -D $pgCluster -m fast -w stop; exit $LASTEXITCODE }
if ($Action -eq 'status') { & "$pgBin/pg_ctl.exe" -D $pgCluster status; exit $LASTEXITCODE }
if (!(Test-Path (Join-Path $pgCluster 'PG_VERSION'))) {
    if ((Test-Path $pgCluster) -and (Get-ChildItem -LiteralPath $pgCluster -Force | Select-Object -First 1)) { throw 'El directorio del clúster ya contiene archivos; no se reemplazó.' }
    $pgPasswordFile = Join-Path $pgTools 'init-password.tmp'
    try {
        [IO.File]::WriteAllText($pgPasswordFile, $pgLocal.adminPassword)
        & "$pgBin/initdb.exe" -D $pgCluster -U $pgLocal.adminUser --pwfile=$pgPasswordFile --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar PostgreSQL.' }
        Add-Content -LiteralPath (Join-Path $pgCluster 'postgresql.conf') -Value "`nlisten_addresses = '127.0.0.1'`nport = 55432`nmax_connections = 40`ntimezone = 'UTC'"
    } finally { if (Test-Path $pgPasswordFile) { Remove-Item -LiteralPath $pgPasswordFile } }
}
& "$pgBin/pg_ctl.exe" -D $pgCluster status *> $null
if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL local ya está iniciado en 127.0.0.1:55432.'; exit 0 }
if (Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue) { throw 'El puerto 55432 está ocupado por otro proceso.' }
New-Item -ItemType Directory -Force (Join-Path $pgWorkspace 'artifacts/runtime') | Out-Null
& "$pgBin/pg_ctl.exe" -D $pgCluster -l (Join-Path $pgWorkspace 'artifacts/runtime/postgres.log') -w -t 60 start
exit $LASTEXITCODE
