<#
.SYNOPSIS
  Build and run the Axiomic desktop app (Tauri 2.0) on Windows.

.DESCRIPTION
  One-command launcher that verifies prerequisites, builds the Rust→WASM core,
  installs frontend + desktop dependencies, and then either runs the desktop app
  in dev mode or produces release installers.

.PARAMETER Mode
  'dev'   (default) — hot-reloading desktop dev window.
  'build'           — release bundles (.msi / .exe) under
                      desktop/src-tauri/target/release/bundle/.

.PARAMETER SkipWasm
  Skip rebuilding the WASM core (use the existing web/src/wasm output).

.EXAMPLE
  .\run-desktop.ps1
  .\run-desktop.ps1 -Mode build
  .\run-desktop.ps1 -SkipWasm
#>
[CmdletBinding()]
param(
  [ValidateSet('dev', 'build')]
  [string]$Mode = 'dev',
  [switch]$SkipWasm
)

$ErrorActionPreference = 'Stop'

# Resolve repo paths relative to this script (desktop/scripts/).
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Resolve-Path (Join-Path $ScriptDir '..\..')
$WebDir    = Join-Path $Root 'web'
$DeskDir   = Join-Path $Root 'desktop'
$CoreDir   = Join-Path $Root 'core'
$WasmOut   = Join-Path $WebDir 'src\wasm'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Fail($msg)       { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Fail "'$cmd' not found. $hint"
  }
}

Write-Step "Checking prerequisites"
Need 'cargo' 'Install Rust from https://rustup.rs/'
Need 'node'  'Install Node.js 18+ from https://nodejs.org/'
Need 'pnpm'  'Install pnpm: npm install -g pnpm'

# wasm32 target.
$targets = & rustup target list --installed 2>$null
if ($targets -notmatch 'wasm32-unknown-unknown') {
  Write-Step "Adding wasm32-unknown-unknown target"
  rustup target add wasm32-unknown-unknown
}

# wasm-pack.
if (-not (Get-Command 'wasm-pack' -ErrorAction SilentlyContinue)) {
  Write-Step "Installing wasm-pack (one-time)"
  cargo install wasm-pack
}

# WebView2 runtime (required by Tauri on Windows). Warn only.
$wv = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
if (-not $wv) {
  Write-Host "    WebView2 runtime not detected. Windows 11 ships it by default." -ForegroundColor Yellow
  Write-Host "    If the app fails to open, install it from:" -ForegroundColor Yellow
  Write-Host "    https://developer.microsoft.com/microsoft-edge/webview2/" -ForegroundColor Yellow
}
Write-Ok "Toolchain OK"

# 1. Build the WASM core.
if (-not $SkipWasm) {
  Write-Step "Building Rust core to WASM"
  Push-Location $CoreDir
  try {
    wasm-pack build --release --target web --out-dir $WasmOut --features wasm
  } finally { Pop-Location }
  # wasm-pack drops a .gitignore that would hide the generated package.
  $gi = Join-Path $WasmOut '.gitignore'
  if (Test-Path $gi) { Remove-Item $gi -Force }
  Write-Ok "WASM core ready"
} else {
  Write-Ok "Skipping WASM build (-SkipWasm)"
}

# 2. Install dependencies.
Write-Step "Installing web dependencies"
Push-Location $WebDir
try { pnpm install } finally { Pop-Location }

Write-Step "Installing desktop dependencies"
Push-Location $DeskDir
try { pnpm install } finally { Pop-Location }
Write-Ok "Dependencies installed"

# 3. Run or build.
Push-Location $DeskDir
try {
  if ($Mode -eq 'dev') {
    # Tauri's devUrl is fixed to http://localhost:5173 and Vite now uses
    # strictPort, so a stale listener on 5173 would make the dev server fail to
    # start (leaving the desktop window blank). Detect and report it early.
    $busy = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($busy) {
      $procId = ($busy | Select-Object -First 1).OwningProcess
      $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
      Fail ("Port 5173 is already in use by PID $procId ($name). " +
            "Close that process (e.g. a standalone 'pnpm dev') and re-run, " +
            "since the desktop app loads the frontend from http://localhost:5173.")
    }
    Write-Step "Launching desktop app (dev)"
    pnpm dev
  } else {
    Write-Step "Building desktop release bundles"
    pnpm build
    Write-Ok "Bundles in: desktop\src-tauri\target\release\bundle\"
  }
} finally { Pop-Location }
