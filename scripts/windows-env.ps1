$ErrorActionPreference = 'Stop'
$beatVaultRoot = Split-Path $PSScriptRoot -Parent
$beatVaultBin = Join-Path $beatVaultRoot '.tools/bin'
$beatVaultStorageConfigPath = Join-Path $beatVaultRoot '.tools/local-storage.json'
if (!$env:BEATVAULT_UPLOAD_DIR -and (Test-Path -LiteralPath $beatVaultStorageConfigPath -PathType Leaf)) {
    $beatVaultStorageConfig = Get-Content -LiteralPath $beatVaultStorageConfigPath -Raw | ConvertFrom-Json
    if ($beatVaultStorageConfig.uploadDirectory -isnot [string] -or !$beatVaultStorageConfig.uploadDirectory.Trim() -or ![IO.Path]::IsPathRooted($beatVaultStorageConfig.uploadDirectory)) {
        throw 'La configuración local de almacenamiento debe indicar una ruta absoluta en uploadDirectory.'
    }
    $env:BEATVAULT_UPLOAD_DIR = [IO.Path]::GetFullPath($beatVaultStorageConfig.uploadDirectory)
}
if (!(Test-Path (Join-Path $beatVaultBin 'node.exe')) -or !(Test-Path (Join-Path $beatVaultBin 'npm.cmd'))) {
    throw 'Falta el runtime local en .tools/bin. Consulta docs/WINDOWS_LOCAL.md.'
}
$env:PATH = "$beatVaultBin;$env:PATH"
$beatVaultFfmpeg = Get-ChildItem (Join-Path $beatVaultRoot '.tools/ffmpeg') -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($beatVaultFfmpeg) {
    $env:BEATVAULT_FFMPEG_PATH = $beatVaultFfmpeg.FullName
    $env:BEATVAULT_FFPROBE_PATH = Join-Path $beatVaultFfmpeg.DirectoryName 'ffprobe.exe'
    $env:PATH = "$($beatVaultFfmpeg.DirectoryName);$env:PATH"
}
