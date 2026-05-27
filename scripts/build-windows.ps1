$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ClientDir = Join-Path $RootDir "client"
$ServerDir = Join-Path $RootDir "server"
$BundledServerDir = Join-Path $ClientDir "resources\server"
$BundledServerExe = Join-Path $BundledServerDir "bp-arena-server.exe"
$DefaultClientOutDir = Join-Path $ClientDir "out-release"
$ClientOutDir = $DefaultClientOutDir
$GameDir = Join-Path $RootDir "game"
$AoeSourceDir = Join-Path $GameDir "AOE-HD"
$CncDdrawDir = Join-Path $GameDir "cnc-ddraw-master"
$CncDdrawDll = Join-Path $CncDdrawDir "bin\Release\ddraw.dll"
$BundledCncDdrawDir = Join-Path $ClientDir "resources\patches\cnc-ddraw"
$BundledCncDdrawDll = Join-Path $BundledCncDdrawDir "ddraw.dll"
$ManifestDir = Join-Path $ClientDir "resources\manifests"
$AoeManifestPath = Join-Path $ManifestDir "aoe-hd.json"

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [ScriptBlock] $Command,
    [Parameter(Mandatory = $true)]
    [string] $FailureMessage
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage Exit code: $LASTEXITCODE"
  }
}

function Remove-DirectoryWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  if (!(Test-Path $Path)) {
    return
  }

  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force
      return $true
    } catch {
      Write-Host "Could not clean $Path on attempt ${attempt}: $($_.Exception.Message)"
      if ($attempt -eq 8) {
        return $false
      }

      [System.GC]::Collect()
      [System.GC]::WaitForPendingFinalizers()
      Start-Sleep -Seconds 3
    }
  }
}

function Stop-BuildOutputProcesses {
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like "BP-Arena*" -or
      $_.ProcessName -like "*electron*" -or
      $_.Path -like "*\BP-Arena\client\out-release\*" -or
      $_.Path -like "*\BP-Arena\client\out-release-*"
  }

  foreach ($process in $processes) {
    try {
      Write-Host "Stopping running app process $($process.ProcessName) ($($process.Id)) before cleaning output"
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
    } catch {
      Write-Host "Could not stop process $($process.Id): $($_.Exception.Message)"
    }
  }
}

function Set-ElectronBuilderOutputDir {
  param(
    [Parameter(Mandatory = $true)]
    [string] $OutputDir
  )

  $packageJsonPath = Join-Path $ClientDir "package.json"
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  $packageJson.build.directories.output = (Split-Path -Leaf $OutputDir)
  $json = $packageJson | ConvertTo-Json -Depth 20
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($packageJsonPath, "$json`n", $utf8NoBom)
}

function Get-GoExecutable {
  $goCommand = Get-Command go -ErrorAction SilentlyContinue
  if ($goCommand) {
    return $goCommand.Source
  }

  $knownPaths = @(
    "H:\Application\bin\go.exe",
    "C:\Program Files\Go\bin\go.exe",
    "C:\Program Files (x86)\Go\bin\go.exe"
  )

  foreach ($candidate in $knownPaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Go executable was not found. Add go.exe to PATH or update scripts\build-windows.ps1."
}

function Get-MSBuildExecutable {
  $msbuildCommand = Get-Command msbuild -ErrorAction SilentlyContinue
  if ($msbuildCommand) {
    return $msbuildCommand.Source
  }

  $vswherePaths = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe",
    "C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe"
  )

  foreach ($vswhere in $vswherePaths) {
    if (Test-Path $vswhere) {
      $result = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe"
      if ($result) {
        return ($result | Select-Object -First 1)
      }
    }
  }

  $knownPaths = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
  )

  foreach ($candidate in $knownPaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "MSBuild.exe was not found. Install Visual Studio Build Tools or update scripts\build-windows.ps1."
}

function New-AoeManifest {
  if (!(Test-Path $AoeSourceDir)) {
    throw "AOE source directory not found: $AoeSourceDir"
  }

  New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null

  $files = Get-ChildItem -LiteralPath $AoeSourceDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($AoeSourceDir.Length + 1).Replace("\", "/")
    $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256

    [PSCustomObject]@{
      path = $relativePath
      size = $_.Length
      sha256 = $hash.Hash.ToLowerInvariant()
    }
  }

  $manifest = [PSCustomObject]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    source = "game/AOE-HD"
    files = $files
  }

  $json = $manifest | ConvertTo-Json -Depth 5
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($AoeManifestPath, "$json`n", $utf8NoBom)
}

$GoExe = Get-GoExecutable
$MSBuildExe = Get-MSBuildExecutable
New-Item -ItemType Directory -Force -Path $BundledServerDir | Out-Null
New-Item -ItemType Directory -Force -Path $BundledCncDdrawDir | Out-Null

Write-Host "Building BP-Arena backend with $GoExe"
Push-Location $ServerDir
try {
  Invoke-NativeCommand -Command { & $GoExe build -trimpath -ldflags="-s -w" -o $BundledServerExe .\cmd } -FailureMessage "Backend build failed."
} finally {
  Pop-Location
}

Write-Host "Building cnc-ddraw with $MSBuildExe"
Push-Location $CncDdrawDir
try {
  Invoke-NativeCommand -Command { & $MSBuildExe ".\cnc-ddraw.sln" "/p:Configuration=Release" "/p:Platform=x86" "/m" } -FailureMessage "cnc-ddraw build failed."
} finally {
  Pop-Location
}

if (!(Test-Path $CncDdrawDll)) {
  throw "cnc-ddraw output was not found: $CncDdrawDll"
}

Copy-Item -LiteralPath $CncDdrawDll -Destination $BundledCncDdrawDll -Force
Write-Host "Copied cnc-ddraw patch to $BundledCncDdrawDll"

Write-Host "Generating AOE-HD manifest"
New-AoeManifest

Write-Host "Building BP-Arena Windows desktop app"
Write-Host "Cleaning previous Electron output"
Stop-BuildOutputProcesses
Set-ElectronBuilderOutputDir -OutputDir $DefaultClientOutDir

if (!(Remove-DirectoryWithRetry -Path $ClientOutDir)) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $ClientOutDir = Join-Path $ClientDir "out-release-$timestamp"
  Write-Host "Previous output is locked. Building into $ClientOutDir instead."
  Set-ElectronBuilderOutputDir -OutputDir $ClientOutDir
}

Push-Location $ClientDir
try {
  Invoke-NativeCommand -Command { npm run dist:win } -FailureMessage "Electron build failed."
} finally {
  Pop-Location
  Set-ElectronBuilderOutputDir -OutputDir $DefaultClientOutDir
}

Write-Host "Build artifacts are in: $ClientOutDir"
