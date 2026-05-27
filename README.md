# BP-Arena

BP-Arena is a Windows desktop launcher for AOE Rise of Rome. The app packages:

- Electron + React client UI.
- Go backend server.
- Bundled `game/AOE-HD` runtime.
- `cnc-ddraw` patch built from `game/cnc-ddraw-master`.

## Requirements

Install these tools on the build machine:

- Windows 10/11.
- Node.js and npm.
- Go.
- Visual Studio Build Tools with MSBuild and C++ build tools.
- PowerShell.

The build script auto-detects common paths for Go and MSBuild. It currently knows these fallback paths:

- `H:\Application\bin\go.exe`
- `C:\Program Files\Go\bin\go.exe`
- `C:\Program Files (x86)\Go\bin\go.exe`
- Visual Studio Build Tools via `vswhere.exe`

## Required Project Assets

Before building, these directories must exist:

```text
game/
  AOE-HD/
  cnc-ddraw-master/
  UPatch_HD_1.2-R4.1/
```

Important files:

- `game/AOE-HD/Empiresxhd.exe`
- `game/cnc-ddraw-master/cnc-ddraw.sln`
- `game/UPatch_HD_1.2-R4.1/UPatch HD 1.2-R4 Setup.exe`

`UPatch_HD_1.2-R4.1` is kept as a source asset. The current build uses `game/AOE-HD` as the already-patched runtime source.

## Install Dependencies

From the repository root:

```powershell
cd H:\BP-Arena
cd client
npm install
```

Go dependencies are resolved by the Go toolchain during build:

```powershell
cd H:\BP-Arena\server
go mod download
```

If `go` is not in `PATH`, the build script can still use `H:\Application\bin\go.exe`.

## Build Windows App

Run this from the repository root:

```powershell
cd H:\BP-Arena
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

The script performs these steps:

1. Builds the Go backend into `client/resources/server/bp-arena-server.exe`.
2. Builds `cnc-ddraw` with MSBuild using `Release|x86`.
3. Copies `ddraw.dll` into `client/resources/patches/cnc-ddraw/ddraw.dll`.
4. Generates `client/resources/manifests/aoe-hd.json`.
5. Runs `npm run dist:win`.
6. Produces Windows installer and portable app.

## Build Output

Successful builds are written to:

```text
client/out-release/
```

If Windows keeps a previous build locked, the build script automatically falls back to a timestamped output folder:

```text
client/out-release-YYYYMMDD-HHMMSS/
```

Expected artifacts:

```text
client/out-release/BP-Arena-0.0.1-x64-setup.exe
client/out-release/BP-Arena-0.0.1-x64-portable.exe
client/out-release/win-unpacked/BP-Arena.exe
```

The packaged resources should include:

```text
client/out-release/win-unpacked/resources/server/bp-arena-server.exe
client/out-release/win-unpacked/resources/game/AOE-HD/Empiresxhd.exe
client/out-release/win-unpacked/resources/patches/cnc-ddraw/ddraw.dll
client/out-release/win-unpacked/resources/manifests/aoe-hd.json
```

## Development Run

To run the desktop app in development mode:

```powershell
cd H:\BP-Arena\client
npm run app
```

This starts Vite and Electron together. The packaged backend is only started automatically when `client/resources/server/bp-arena-server.exe` exists.

To build only the frontend:

```powershell
cd H:\BP-Arena\client
npm run build
```

To test the Go backend:

```powershell
cd H:\BP-Arena\server
go test ./...
```

## Runtime Behavior

On first run, the launcher copies the bundled game from app resources into:

```text
%AppData%\BP-Arena\games\AOE-HD
```

Then it applies:

- `ddraw.dll`
- generated `ddraw.ini`
- registry settings for player name and game setup path

Launcher settings are saved in:

```text
%AppData%\BP-Arena\settings.json
```

Launcher logs are saved in:

```text
%AppData%\BP-Arena\logs\launcher.log
```

## Troubleshooting

If the build cannot remove `client/out-release`, close any running `BP-Arena.exe` or Electron process and run the build again. The script also attempts to stop `BP-Arena*` processes before packaging. If `app.asar` is still locked by Windows, the script will build into a timestamped `client/out-release-*` folder instead.

If MSBuild is not found, install Visual Studio Build Tools with C++ tooling, or update `Get-MSBuildExecutable` in `scripts/build-windows.ps1`.

If Go is not found, add `go.exe` to `PATH`, install Go, or update `Get-GoExecutable` in `scripts/build-windows.ps1`.

If DirectPlay multiplayer fails, enable DirectPlay in Windows Features:

```powershell
dism /Online /enable-feature /FeatureName:"DirectPlay" /All
```

If Electron uses the default icon, add a Windows icon later and configure `build.win.icon` in `client/package.json`.
