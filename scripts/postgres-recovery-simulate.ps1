$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-FixtureManifest([string]$Root) {
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $files = @(Get-ChildItem -LiteralPath $rootFull -File -Recurse -Force | Sort-Object FullName)
    foreach ($item in Get-ChildItem -LiteralPath $rootFull -Recurse -Force) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'La simulación no admite enlaces o puntos de reanálisis.'
        }
    }
    @($files | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($rootFull.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
}

function Assert-NoReparseTree([string]$Root) {
    $rootItem = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
    if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'La simulación detectó un enlace o punto de reanálisis.'
    }
    foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'La simulación detectó un enlace o punto de reanálisis.'
        }
    }
}

function Assert-Equal([string]$Name, [string]$Expected, [string]$Actual) {
    if ($Expected -cne $Actual) { throw "La simulación detectó una diferencia en $Name." }
}

$tempRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "beatvault-backup-sim-$([Guid]::NewGuid().ToString('N'))"))
$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$resolvedParent = [IO.Path]::GetDirectoryName($tempRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
if ($resolvedParent -ine $tempParent -or [IO.Path]::GetFileName($tempRoot) -notmatch '^beatvault-backup-sim-[a-f0-9]{32}$' -or (Test-Path -LiteralPath $tempRoot)) {
    throw 'La carpeta temporal no pasó las comprobaciones de seguridad; no se modificó ningún archivo.'
}

try {
    $sourceRoot = Join-Path $tempRoot 'source-volume'
    $sourceUploads = Join-Path $sourceRoot 'storage/uploads'
    $destinationRoot = Join-Path $tempRoot 'destination-volume/backups'
    $destinationBundle = Join-Path $destinationRoot 'beatvault-simulation'
    $destinationUploads = Join-Path $destinationBundle 'uploads'
    $restoreRoot = Join-Path $tempRoot 'restore-volume'
    $restoreBundle = Join-Path $restoreRoot 'restore-check'
    $restoreUploads = Join-Path $restoreBundle 'uploads'
    $syntheticDump = Join-Path $sourceRoot 'postgres/database.dump.synthetic'
    $copiedDump = Join-Path $destinationBundle 'database.dump.synthetic'
    $restoredDump = Join-Path $restoreBundle 'database.dump.synthetic'

    New-Item -ItemType Directory -Path $sourceUploads, (Join-Path $sourceUploads 'nested'), (Split-Path -Parent $syntheticDump), $destinationUploads, $restoreBundle -Force | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $sourceUploads 'synthetic-audio.bin'), [byte[]](0, 1, 2, 3, 255, 128))
    [IO.File]::WriteAllText((Join-Path $sourceUploads 'nested/synthetic-cover.txt'), 'synthetic fixture; not user media', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($syntheticDump, 'synthetic database fixture; not a PostgreSQL dump', [Text.UTF8Encoding]::new($false))

    $sourceInventory = Get-FixtureManifest $sourceUploads
    $sourceDumpHash = (Get-FileHash -LiteralPath $syntheticDump -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath $syntheticDump -Destination $copiedDump
    Get-ChildItem -LiteralPath $sourceUploads -Force | Copy-Item -Destination $destinationUploads -Recurse -Force

    $copiedInventory = Get-FixtureManifest $destinationUploads
    $copiedDumpHash = (Get-FileHash -LiteralPath $copiedDump -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Equal 'el inventario de medios' (ConvertTo-Json -InputObject $sourceInventory -Depth 4 -Compress) (ConvertTo-Json -InputObject $copiedInventory -Depth 4 -Compress)
    Assert-Equal 'el hash del volcado sintético' $sourceDumpHash $copiedDumpHash

    Get-ChildItem -LiteralPath $destinationBundle -Force | Copy-Item -Destination $restoreBundle -Recurse -Force
    Assert-NoReparseTree $tempRoot
    $restoredInventory = Get-FixtureManifest $restoreUploads
    $restoredDumpHash = (Get-FileHash -LiteralPath $restoredDump -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Equal 'el inventario de medios restaurado' (ConvertTo-Json -InputObject $sourceInventory -Depth 4 -Compress) (ConvertTo-Json -InputObject $restoredInventory -Depth 4 -Compress)
    Assert-Equal 'el hash del volcado sintético restaurado' $sourceDumpHash $restoredDumpHash

    $sourceInventoryAfter = Get-FixtureManifest $sourceUploads
    $sourceDumpHashAfter = (Get-FileHash -LiteralPath $syntheticDump -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Equal 'la fuente de medios' (ConvertTo-Json -InputObject $sourceInventory -Depth 4 -Compress) (ConvertTo-Json -InputObject $sourceInventoryAfter -Depth 4 -Compress)
    Assert-Equal 'la fuente sintética de base de datos' $sourceDumpHash $sourceDumpHashAfter

    Write-Output "Simulación correcta: bundle y restore verificados; $($sourceInventory.Count) archivos sintéticos; fuentes conservadas; sin enlaces/reparse points."
    Write-Output 'source-volume, destination-volume y restore-volume son carpetas temporales en el mismo disco físico.'
} finally {
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        $cleanupPath = [IO.Path]::GetFullPath($tempRoot)
        $cleanupParent = [IO.Path]::GetDirectoryName($cleanupPath).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
        if ($cleanupParent -ieq $tempParent -and [IO.Path]::GetFileName($cleanupPath) -match '^beatvault-backup-sim-[a-f0-9]{32}$') {
            try {
                Assert-NoReparseTree $cleanupPath
                Remove-Item -LiteralPath $cleanupPath -Recurse -Force
            } catch {
                Write-Warning "No se eliminó la carpeta temporal porque no pasó la validación del árbol: $cleanupPath"
            }
        } else {
            Write-Warning "No se eliminó una ruta temporal inesperada: $cleanupPath"
        }
    }
}
