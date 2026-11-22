# Сборка переносимого мастера Windows x64.
#Requires -Version 5.1
param([string] $ProjectRoot = (Join-Path $PSScriptRoot '..'))

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
$nodeExe = (Get-Command node.exe -CommandType Application).Source
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if ((& $nodeExe -p 'process.arch') -ne 'x64' -or !(Test-Path -LiteralPath $csc)) {
    throw 'Для сборки нужны Node.js x64 и компилятор .NET Framework для Windows x64.'
}

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

function Add-ArchiveFile([string] $File, [string] $Name) {
    $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $File, $Name.Replace('\', '/'), [IO.Compression.CompressionLevel]::Optimal
    )
}

function Add-ArchiveDirectory([string] $Directory, [string] $Prefix) {
    $folder = (Get-Item -LiteralPath $Directory).FullName
    foreach ($file in Get-ChildItem -LiteralPath $folder -Recurse -File) {
        if ($file.Name -eq 'DEPENDENCIES_VALIDATED' -or $file.Extension -eq '.log') { continue }
        $relative = $file.FullName.Substring($folder.Length + 1)
        Add-ArchiveFile $file.FullName "$Prefix/$relative"
    }
}

Push-Location -LiteralPath $project
try {
    $playwrightCore = 'node_modules/playwright-core'
    $browsers = (Get-Content -LiteralPath "$playwrightCore/browsers.json" -Raw -Encoding UTF8 | ConvertFrom-Json).browsers
    $browserCache = if ($env:PLAYWRIGHT_BROWSERS_PATH -eq '0') {
        Join-Path $playwrightCore '.local-browsers'
    } elseif ($env:PLAYWRIGHT_BROWSERS_PATH) {
        $env:PLAYWRIGHT_BROWSERS_PATH
    } else {
        Join-Path $env:LOCALAPPDATA 'ms-playwright'
    }
    $browserDirs = foreach ($browser in $browsers | Where-Object { $_.name -in 'chromium-headless-shell', 'winldd' }) {
        $name = ($browser.name -replace '-', '_') + '-' + $browser.revision
        Join-Path $browserCache $name
    }
    foreach ($directory in $browserDirs) {
        if (!(Test-Path -LiteralPath (Join-Path $directory 'INSTALLATION_COMPLETE'))) {
            throw 'Установите Chromium командой npm.cmd --prefix project run install:browser из корня репозитория.'
        }
    }

    $runtimePackages = @'
Object.entries(require("./package-lock.json").packages)
  .filter(([path, data]) => path && !data.dev && (!data.os || data.os.includes("win32")))
  .forEach(([path]) => console.log(path));
'@ | & $nodeExe '--input-type=commonjs'
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось прочитать список зависимостей.' }

    $buildDir = [IO.Path]::GetFullPath((Join-Path $project 'tmp/windows'))
    $staging = [IO.Path]::GetFullPath((Join-Path $buildDir ([Guid]::NewGuid().ToString('N'))))
    if ([IO.Path]::GetDirectoryName($staging) -ne $buildDir) { throw 'Некорректный путь временной папки.' }
    $null = New-Item -ItemType Directory -Path $staging -Force
    $dist = Join-Path $staging 'dist'
    $zipPath = Join-Path $staging 'runtime.zip'
    $stagedExe = Join-Path $staging 'BOTC-PDF-Generator.exe'
    $destination = Join-Path (Split-Path -Parent $project) 'BOTC-PDF-Generator.exe'

    try {
        & $nodeExe 'node_modules/typescript/bin/tsc' '-p' 'tsconfig.json' '--outDir' $dist
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось скомпилировать TypeScript.' }
        & $nodeExe 'scripts/copy-assets.mjs' $dist
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось скопировать ресурсы генератора.' }

        $archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
        try {
            Add-ArchiveFile $nodeExe 'node.exe'
            foreach ($library in Get-ChildItem -LiteralPath (Split-Path -Parent $nodeExe) -File -Filter '*.dll') {
                Add-ArchiveFile $library.FullName $library.Name
            }
            Add-ArchiveFile (Join-Path $project 'package.json') 'package.json'
            Add-ArchiveDirectory $dist 'dist'
            foreach ($directory in (@('assets', 'catalog') + $runtimePackages)) {
                Add-ArchiveDirectory $directory $directory
            }
            foreach ($directory in $browserDirs) {
                Add-ArchiveDirectory $directory ('browsers/' + (Split-Path -Leaf $directory))
            }
        } finally {
            $archive.Dispose()
        }

        $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.Substring(0, 20).ToLowerInvariant()
        $sources = @(Get-ChildItem -LiteralPath 'desktop/windows' -Filter '*.cs' -File | ForEach-Object FullName)
        $compilerArgs = @(
            '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
            '/reference:System.Windows.Forms.dll,System.Drawing.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll',
            "/resource:$zipPath,BotcRuntime.$hash.zip", "/out:$stagedExe"
        )
        & $csc @compilerArgs @sources
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось скомпилировать мастер Windows.' }
        Move-Item -LiteralPath $stagedExe -Destination $destination -Force
        Write-Host "Windows executable: $destination"
    } finally {
        if ((Resolve-Path -LiteralPath $staging).Path -eq $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
} finally {
    Pop-Location
}
