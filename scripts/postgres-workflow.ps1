param([ValidateSet('migrate', 'qa', 'qa-browser', 'backup')][string]$Task = 'migrate')
. (Join-Path $PSScriptRoot 'windows-env.ps1')
Push-Location $beatVaultRoot
try {
    & (Join-Path $PSScriptRoot 'postgres-local.ps1') -Action start
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL.' }
    & (Join-Path $beatVaultRoot '.tools/bin/node.exe') --import tsx scripts/postgres-tasks.ts $Task
    $pgTaskExit = $LASTEXITCODE
} finally { Pop-Location }
exit $pgTaskExit
