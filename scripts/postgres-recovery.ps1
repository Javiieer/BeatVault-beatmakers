param(
    [Parameter(Mandatory = $true)][ValidateSet('backup', 'verify')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$ApiPort = 4174,
    [UInt64]$MaxMediaBytes = 25GB,
    [int]$MaxMediaEntries = 100000
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')

function Get-UploadFileManifest([string]$Root) {
    $files = @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force)
    foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'El respaldo de medios no admite enlaces o puntos de reanálisis dentro de la carpeta de cargas.'
        }
    }
    @($files | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($Root.TrimEnd('\').Length).TrimStart('\').Replace('\', '/')
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
}

function Assert-NoReparsePath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($fullPath)
    $cursor = $root
    $relative = $fullPath.Substring($root.Length)
    foreach ($segment in $relative.Split([IO.Path]::DirectorySeparatorChar, [StringSplitOptions]::RemoveEmptyEntries)) {
        $cursor = Join-Path $cursor $segment
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "No se permiten rutas con junctions/enlaces: $cursor"
        }
    }
}

function Assert-LocalApiStopped([int]$Port) {
    $probe = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $probe.BeginConnect('127.0.0.1', $Port, $null, $null)
        if ($connect.AsyncWaitHandle.WaitOne(250) -and $probe.Connected) {
            throw "Detén primero la API local en 127.0.0.1:$Port y mantenla detenida durante el respaldo."
        }
    } finally { $probe.Dispose() }
}

function Get-PhysicalDiskNumber([string]$DriveLetter) {
    $letter = $DriveLetter.TrimEnd(':').ToUpperInvariant()
    if ($letter -notmatch '^[A-Z]$') { throw "No es una letra de unidad local válida: $DriveLetter" }
    $logicalDisk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$letter`:'" -ErrorAction Stop
    if (!$logicalDisk -or $logicalDisk.DriveType -ne 3) { throw "La unidad $letter`: debe ser un disco local fijo." }

    try {
        $partitions = @(Get-Partition -DriveLetter $letter -ErrorAction Stop)
        $diskNumbers = @($partitions | Select-Object -ExpandProperty DiskNumber -Unique)
        if ($diskNumbers.Count -eq 1) { return [int]$diskNumbers[0] }
    } catch { }

    $logicalPattern = 'DeviceID\s*=\s*"' + [regex]::Escape("${letter}:") + '"'
    $mappings = @(Get-CimInstance Win32_LogicalDiskToPartition -ErrorAction Stop | Where-Object { $_.Dependent -match $logicalPattern })
    $mappedDiskNumbers = @($mappings | ForEach-Object {
        if ($_.Antecedent -notmatch 'Disk #(\d+), Partition #\d+') { throw "No se pudo identificar el disco físico de $letter`:" }
        [int]$Matches[1]
    } | Select-Object -Unique)
    if ($mappedDiskNumbers.Count -ne 1) { throw "No se pudo resolver a un único disco físico la unidad $letter`:" }
    return [int]$mappedDiskNumbers[0]
}

Push-Location $beatVaultRoot
try {
    $configPath = Join-Path $beatVaultRoot '.tools/postgresql/local-config.json'
    $pgTools = Join-Path $beatVaultRoot '.tools/postgresql/pgsql/bin'
    $pgConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($pgConfig.host -ne '127.0.0.1' -or $pgConfig.database -ne 'beatvault_local' -or $pgConfig.port -ne 55432 -or !$pgConfig.active) {
        throw 'La recuperación externa requiere la configuración PostgreSQL local verificada y activa.'
    }
    if ($MaxMediaBytes -eq 0 -or $MaxMediaEntries -lt 1 -or $MaxMediaEntries -gt 1000000) { throw 'Los límites de verificación deben ser positivos y no exceder un millón de entradas.' }
    & (Join-Path $pgTools 'pg_ctl.exe') -D (Join-Path $beatVaultRoot 'data/postgres-local') status *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Inicia primero el clúster PostgreSQL local verificado.' }
    if ($ApiPort -lt 1 -or $ApiPort -gt 65535) { throw 'ApiPort debe estar entre 1 y 65535.' }

    $workspaceDrive = [IO.Path]::GetPathRoot($beatVaultRoot).TrimEnd('\').TrimEnd(':')
    $uploads = Join-Path $beatVaultRoot 'data/uploads'
    if ($env:BEATVAULT_UPLOAD_DIR) {
        $uploads = if ([IO.Path]::IsPathRooted($env:BEATVAULT_UPLOAD_DIR)) { $env:BEATVAULT_UPLOAD_DIR } else { Join-Path $beatVaultRoot $env:BEATVAULT_UPLOAD_DIR }
    }
    $uploads = [IO.Path]::GetFullPath($uploads)

    if ($Action -eq 'backup') {
        Assert-LocalApiStopped $ApiPort
        $destinationRoot = (Resolve-Path -LiteralPath $Path).Path
        if (!(Test-Path -LiteralPath $destinationRoot -PathType Container)) { throw 'El destino debe ser una carpeta existente en otro disco local.' }
        Assert-NoReparsePath $destinationRoot
        if (!(Test-Path -LiteralPath $uploads -PathType Container)) { throw "No existe la carpeta de archivos que respalda el catálogo: $uploads" }
        Assert-NoReparsePath $uploads
        $destinationDrive = [IO.Path]::GetPathRoot($destinationRoot).TrimEnd('\').TrimEnd(':')
        $uploadsDrive = [IO.Path]::GetPathRoot($uploads).TrimEnd('\').TrimEnd(':')
        if (!$destinationDrive) { throw 'El destino del respaldo debe estar en un disco local fijo.' }
        $workspaceDiskNumber = Get-PhysicalDiskNumber $workspaceDrive
        $uploadsDiskNumber = Get-PhysicalDiskNumber $uploadsDrive
        $destinationDiskNumber = Get-PhysicalDiskNumber $destinationDrive
        if ($destinationDiskNumber -eq $workspaceDiskNumber -or $destinationDiskNumber -eq $uploadsDiskNumber) {
            throw 'El respaldo completo debe guardarse en un disco físico distinto del clúster PostgreSQL y de la carpeta de cargas.'
        }

        $stamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
        $bundle = Join-Path $destinationRoot "beatvault-$stamp"
        New-Item -ItemType Directory -Path $bundle -ErrorAction Stop | Out-Null
        $dump = Join-Path $bundle 'database.dump'
        $archive = Join-Path $bundle 'uploads.tar.gz'
        $uploadsManifestPath = Join-Path $bundle 'uploads-manifest.json'
        $manifestPath = Join-Path $bundle 'manifest.json'

        $env:PGPASSWORD = $pgConfig.appPassword
        try {
            & (Join-Path $pgTools 'pg_dump.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.appUser -d $pgConfig.database -Fc -f $dump
            if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló; el paquete incompleto se conserva para inspección y no se considera válido.' }
            $countQuery = "SELECT format('%I.%I:%s', schemaname, tablename, ((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text)) FROM pg_tables WHERE schemaname='public' ORDER BY 1"
            $tableRows = @(& (Join-Path $pgTools 'psql.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.appUser -d $pgConfig.database -Atqc $countQuery)
            if ($LASTEXITCODE -ne 0 -or $tableRows.Count -eq 0) { throw 'No se pudo registrar el inventario de filas del respaldo.' }
        } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        Assert-LocalApiStopped $ApiPort
        & tar.exe -czf $archive -C $uploads .
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo archivar la carpeta de archivos; el paquete incompleto se conserva y no se considera válido.' }
        Assert-LocalApiStopped $ApiPort
        $uploadFiles = @(Get-UploadFileManifest $uploads)
        ConvertTo-Json -InputObject $uploadFiles -Depth 5 | Set-Content -LiteralPath $uploadsManifestPath -Encoding UTF8

        $manifest = [ordered]@{
            format = 1
            createdAt = [DateTime]::UtcNow.ToString('o')
            database = $pgConfig.database
            uploadDirectory = $uploads
            files = [ordered]@{
                'database.dump' = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
                'uploads.tar.gz' = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
                'uploads-manifest.json' = (Get-FileHash -LiteralPath $uploadsManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
            }
            publicTableRows = $tableRows
            containsAccountAuthHashes = $true
            omitsLocalConfig = $true
            appendOnly = $true
        }
        $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
        Write-Output "Respaldo versionado creado en otro disco: $bundle"
    } else {
        $bundle = (Resolve-Path -LiteralPath $Path).Path
        $manifestPath = Join-Path $bundle 'manifest.json'
        if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'No se encontró manifest.json; no se restaurará un paquete sin procedencia comprobable.' }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.format -ne 1 -or $manifest.database -ne 'beatvault_local' -or !$manifest.appendOnly -or $manifest.containsAccountAuthHashes -ne $true -or $manifest.omitsLocalConfig -ne $true) {
            throw 'El manifiesto no corresponde a un paquete local compatible.'
        }
        foreach ($name in @('database.dump', 'uploads.tar.gz', 'uploads-manifest.json')) {
            $file = Join-Path $bundle $name
            if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Falta el archivo requerido: $name" }
            $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne $manifest.files.$name) { throw "SHA-256 no coincide para $name; se abortó antes de restaurar." }
        }
        $sourceFiles = @(Get-Content -LiteralPath (Join-Path $bundle 'uploads-manifest.json') -Raw | ConvertFrom-Json)
        if ($sourceFiles.Count -gt $MaxMediaEntries) { throw "El paquete excede el límite de $MaxMediaEntries archivos antes de restaurar." }
        $declaredPaths = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        [UInt64]$declaredBytes = 0
        foreach ($record in $sourceFiles) {
            if (!$record.path -or $record.path -match '(^/|^[A-Za-z]:|\\|(^|/)\.\.?(/|$))' -or $record.path.Length -gt 512) {
                throw 'El manifiesto de medios contiene una ruta insegura.'
            }
            if ($record.bytes -isnot [int] -and $record.bytes -isnot [long] -and $record.bytes -isnot [uint64]) {
                throw 'El manifiesto de medios contiene un tamaño no entero.'
            }
            if ($record.bytes -lt 0 -or $record.bytes -gt $MaxMediaBytes - $declaredBytes) {
                throw "El paquete excede el límite de $MaxMediaBytes bytes antes de restaurar."
            }
            if ($record.sha256 -notmatch '^[a-f0-9]{64}$' -or !$declaredPaths.Add([string]$record.path)) {
                throw 'El manifiesto de medios contiene un hash inválido o rutas duplicadas.'
            }
            $declaredBytes += [UInt64]$record.bytes
        }
        if ($declaredBytes -gt $MaxMediaBytes) { throw "El paquete excede el límite de $MaxMediaBytes bytes antes de restaurar." }

        $checkId = [Guid]::NewGuid().ToString('N')
        $databaseName = "beatvault_restore_check_$checkId"
        $scratch = Join-Path ([IO.Path]::GetTempPath()) "beatvault-restore-check-$checkId"
        if (Test-Path -LiteralPath $scratch) { throw 'Colisión inesperada de ruta temporal; no se modificó el contenido existente.' }
        New-Item -ItemType Directory -Path $scratch -ErrorAction Stop | Out-Null
        $createdDatabase = $false
        $env:PGPASSWORD = $pgConfig.adminPassword
        try {
            & (Join-Path $pgTools 'createdb.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.adminUser -O $pgConfig.adminUser $databaseName
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base temporal aislada.' }
            $createdDatabase = $true
            & (Join-Path $pgTools 'pg_restore.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.adminUser -d $databaseName --exit-on-error --no-owner --no-acl (Join-Path $bundle 'database.dump')
            if ($LASTEXITCODE -ne 0) { throw 'pg_restore falló en la base temporal; la base original no se modificó.' }
            $countQuery = "SELECT format('%I.%I:%s', schemaname, tablename, ((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text)) FROM pg_tables WHERE schemaname='public' ORDER BY 1"
            $restoredRows = @(& (Join-Path $pgTools 'psql.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.adminUser -d $databaseName -Atqc $countQuery)
            if ($LASTEXITCODE -ne 0 -or ($restoredRows -join [Environment]::NewLine) -cne (@($manifest.publicTableRows) -join [Environment]::NewLine)) {
                throw 'El inventario de filas restaurado no coincide con el manifiesto.'
            }
            $archive = Join-Path $bundle 'uploads.tar.gz'
            $archiveEntries = @(& tar.exe -tzf $archive)
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar el archivo de medios.' }
            if ($archiveEntries.Count -gt $MaxMediaEntries + 1) { throw "El archivo excede el límite de $MaxMediaEntries entradas antes de extraer." }
            foreach ($entry in $archiveEntries) {
                $normalized = ([string]$entry).Replace('\', '/')
                if ($normalized.StartsWith('/') -or $normalized -match '^[A-Za-z]:' -or @($normalized.Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) {
                    throw 'El archivo contiene una ruta absoluta o traversal; se canceló antes de extraer.'
                }
            }
            $verboseEntries = @(& tar.exe -tvzf $archive)
            if ($LASTEXITCODE -ne 0 -or $verboseEntries.Count -ne $archiveEntries.Count -or @($verboseEntries | Where-Object { $_ -notmatch '^[-d]' }).Count -gt 0) {
                throw 'El archivo incluye un enlace, tipo de entrada desconocido o índice inconsistente; no se extrajo.'
            }
            $archiveFiles = @($archiveEntries | ForEach-Object { ([string]$_).Replace('\', '/') } | Where-Object { !$_.EndsWith('/') -and $_ -ne '.' })
            if ($archiveFiles.Count -ne $sourceFiles.Count) { throw 'La lista de archivos del tar no coincide con el manifiesto; no se extrajo.' }
            $sourceFilesByPath = @{}
            foreach ($record in $sourceFiles) {
                $sourceFilesByPath["./$($record.path)"] = $record
            }
            [UInt64]$actualArchiveBytes = 0
            $listingPattern = '^(?<type>[-d])\S*\s+\d+\s+\d+\s+\d+\s+(?<size>\d+)\s+\S+\s+\d+\s+\d{2}:\d{2}\s+(?<path>.*)$'
            foreach ($line in $verboseEntries) {
                $match = [regex]::Match([string]$line, $listingPattern)
                if (!$match.Success) { throw 'No se pudo validar el tamaño real de una entrada tar; no se extrajo.' }
                if ($match.Groups['type'].Value -eq '-') {
                    $archivePath = $match.Groups['path'].Value.Replace('\', '/')
                    if (!$sourceFilesByPath.ContainsKey($archivePath)) { throw 'El tar contiene un archivo ausente del manifiesto; no se extrajo.' }
                    [UInt64]$entryBytes = $match.Groups['size'].Value
                    [UInt64]$expectedBytes = $sourceFilesByPath[$archivePath].bytes
                    if ($entryBytes -ne $expectedBytes -or $entryBytes -gt $MaxMediaBytes - $actualArchiveBytes) {
                        throw 'El tamaño real del tar excede los límites o no coincide con el manifiesto; no se extrajo.'
                    }
                    $actualArchiveBytes += $entryBytes
                } elseif ([UInt64]$match.Groups['size'].Value -ne 0) {
                    throw 'El tar declara un directorio con datos; no se extrajo.'
                }
            }
            if ($actualArchiveBytes -ne $declaredBytes) { throw 'El total de bytes sin comprimir no coincide; no se extrajo.' }
            foreach ($record in $sourceFiles) {
                if ($archiveFiles -notcontains "./$($record.path)") { throw 'La lista de archivos del tar no coincide con el manifiesto; no se extrajo.' }
            }
            & tar.exe -xzf $archive -C $scratch
            if ($LASTEXITCODE -ne 0) { throw 'La extracción del archivo de medios falló.' }
            $restoredFiles = @(Get-UploadFileManifest $scratch)
            if ((ConvertTo-Json -InputObject $restoredFiles -Depth 5 -Compress) -cne (ConvertTo-Json -InputObject $sourceFiles -Depth 5 -Compress)) {
                throw 'Los archivos extraídos no coinciden con el inventario de nombres, tamaños y SHA-256.'
            }
            $mediaCount = $restoredFiles.Count
            Write-Output "Restauración aislada correcta: tablas y conteos coinciden; archivos extraídos: $mediaCount"
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
            if ($createdDatabase) {
                & (Join-Path $pgTools 'dropdb.exe') -h $pgConfig.host -p $pgConfig.port -U $pgConfig.adminUser --if-exists --force $databaseName
                if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo retirar la base temporal $databaseName; no se tocó beatvault_local." }
            }
            if (Test-Path -LiteralPath $scratch -PathType Container) { Remove-Item -LiteralPath $scratch -Recurse -Force }
        }
    }
} finally { Pop-Location }
