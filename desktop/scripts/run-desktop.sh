#!/usr/bin/env bash
#
# Build and run the Axiomic desktop app (Tauri 2.0) on macOS or Linux.
#
# Verifies prerequisites, builds the Rust→WASM core, installs frontend + desktop
# dependencies, then runs the desktop app in dev mode or produces release
# bundles.
#
# Usage:
#   ./run-desktop.sh            # dev mode (default)
#   ./run-desktop.sh dev        # dev mode
#   ./run-desktop.sh build      # release bundles (.dmg / .deb / .AppImage)
#   SKIP_WASM=1 ./run-desktop.sh   # reuse existing web/src/wasm output
#
set -euo pipefail

MODE="${1:-dev}"

# Resolve repo paths relative to this script (desktop/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_DIR="$ROOT/web"
DESK_DIR="$ROOT/desktop"
CORE_DIR="$ROOT/core"
WASM_OUT="$WEB_DIR/src/wasm"

cyan()  { printf '\033[36m==> %s\033[0m\n' "$1"; }
green() { printf '\033[32m    %s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m    %s\033[0m\n' "$1"; }
fail()  { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || fail "'$1' not found. $2"
}

cyan "Checking prerequisites"
need cargo "Install Rust from https://rustup.rs/"
need node  "Install Node.js 18+ from https://nodejs.org/"
need pnpm  "Install pnpm: npm install -g pnpm"

# wasm32 target.
if ! rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown; then
  cyan "Adding wasm32-unknown-unknown target"
  rustup target add wasm32-unknown-unknown
fi

# wasm-pack.
if ! command -v wasm-pack >/dev/null 2>&1; then
  cyan "Installing wasm-pack (one-time)"
  cargo install wasm-pack
fi

# Platform-specific Tauri runtime deps (warn only).
case "$(uname -s)" in
  Linux)
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && \
       ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
      yellow "webkit2gtk not detected. Install Tauri's Linux deps, e.g. (Debian/Ubuntu):"
      yellow "  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \\"
      yellow "    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev"
      yellow "See https://v2.tauri.app/start/prerequisites/ for Fedora/Arch."
    fi
    ;;
  Darwin)
    if ! xcode-select -p >/dev/null 2>&1; then
      yellow "Xcode Command Line Tools missing. Install with: xcode-select --install"
    fi
    ;;
esac
green "Toolchain OK"

# 1. Build the WASM core.
if [[ "${SKIP_WASM:-0}" != "1" ]]; then
  cyan "Building Rust core to WASM"
  ( cd "$CORE_DIR" && wasm-pack build --release --target web --out-dir "$WASM_OUT" --features wasm )
  # wasm-pack drops a .gitignore that would hide the generated package.
  rm -f "$WASM_OUT/.gitignore"
  green "WASM core ready"
else
  green "Skipping WASM build (SKIP_WASM=1)"
fi

# 2. Install dependencies.
cyan "Installing web dependencies"
( cd "$WEB_DIR" && pnpm install )
cyan "Installing desktop dependencies"
( cd "$DESK_DIR" && pnpm install )
green "Dependencies installed"

# 3. Run or build.
cd "$DESK_DIR"
case "$MODE" in
  dev)
    cyan "Launching desktop app (dev)"
    pnpm dev
    ;;
  build)
    cyan "Building desktop release bundles"
    pnpm build
    green "Bundles in: desktop/src-tauri/target/release/bundle/"
    ;;
  *)
    fail "Unknown mode '$MODE'. Use 'dev' or 'build'."
    ;;
esac
