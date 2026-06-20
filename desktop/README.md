# Running Axiomic on the Desktop

Axiomic ships a **Tauri 2.0** desktop shell that reuses the exact same web
frontend (`web/dist`) and the shared Rust `core` crate natively. These scripts
build everything and launch the desktop app in one command, per OS.

## TL;DR

| OS | Dev (hot reload) | Release installers |
|----|------------------|--------------------|
| **Windows** | `desktop\scripts\run-desktop.ps1` | `desktop\scripts\run-desktop.ps1 -Mode build` |
| **macOS / Linux** | `desktop/scripts/run-desktop.sh` | `desktop/scripts/run-desktop.sh build` |

The scripts check prerequisites, add the `wasm32` target + `wasm-pack` if
missing, build the Rust→WASM core, install dependencies, then run or build.

---

## Prerequisites

Installed automatically by the scripts when missing: the `wasm32-unknown-unknown`
Rust target and `wasm-pack`. You must install these yourself first:

| Tool | Install |
|------|---------|
| Rust + Cargo | https://rustup.rs/ |
| Node.js 18+ | https://nodejs.org/ |
| pnpm 9+ | `npm install -g pnpm` |

**Platform runtime for Tauri** (the scripts warn if missing):

- **Windows** — WebView2 runtime. Ships with Windows 11; on Windows 10 install
  from https://developer.microsoft.com/microsoft-edge/webview2/.
- **macOS** — Xcode Command Line Tools: `xcode-select --install`.
- **Linux** — WebKitGTK + build deps. Debian/Ubuntu:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  For Fedora/Arch see https://v2.tauri.app/start/prerequisites/.

---

## Windows (PowerShell)

```powershell
# From the repo root or anywhere:
cd desktop\scripts

# Dev mode (hot-reloading desktop window):
.\run-desktop.ps1

# Release installers (.msi / .exe):
.\run-desktop.ps1 -Mode build

# Reuse an existing WASM build (skip rebuilding the core):
.\run-desktop.ps1 -SkipWasm
```

If script execution is blocked, allow it for the current session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Release output: `desktop\src-tauri\target\release\bundle\`.

---

## macOS / Linux (bash)

```bash
cd desktop/scripts
chmod +x run-desktop.sh   # first time only

# Dev mode (default):
./run-desktop.sh

# Release bundles (.dmg on macOS; .deb / .AppImage on Linux):
./run-desktop.sh build

# Reuse an existing WASM build:
SKIP_WASM=1 ./run-desktop.sh
```

Release output: `desktop/src-tauri/target/release/bundle/`.

---

## What the scripts do

1. **Verify prerequisites** — `cargo`, `node`, `pnpm`; warn on missing platform
   WebView runtime.
2. **Ensure WASM toolchain** — add `wasm32-unknown-unknown` and install
   `wasm-pack` if absent.
3. **Build the core to WASM** — `wasm-pack build --release --target web` into
   `web/src/wasm/`, then remove the stray generated `.gitignore`.
4. **Install dependencies** — `pnpm install` in both `web/` and `desktop/`.
5. **Run or build** — `pnpm dev` (Tauri dev window) or `pnpm build` (installers).

> First run compiles the Rust backend and downloads crates — give it a few
> minutes. Subsequent runs are fast.

---

## Manual equivalent (no scripts)

```bash
# 1. Build the WASM core
cd core
wasm-pack build --release --target web --out-dir ../web/src/wasm --features wasm
rm -f ../web/src/wasm/.gitignore   # (PowerShell: Remove-Item ..\web\src\wasm\.gitignore)

# 2. Install deps
cd ../web && pnpm install
cd ../desktop && pnpm install

# 3. Run (dev) or build (release)
pnpm dev      # or: pnpm build
```

`desktop/package.json` exposes `pnpm dev` (`tauri dev`) and `pnpm build`
(`tauri build`). The `beforeDevCommand` / `beforeBuildCommand` in
`desktop/src-tauri/tauri.conf.json` automatically run the web dev server / web
build, so the frontend is always in sync.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `'cargo' not found` | Install Rust via rustup, reopen the terminal. |
| `'pnpm' not found` | `npm install -g pnpm`. |
| Blank/white desktop window on Windows | Install the WebView2 runtime (see above). |
| Linux build fails on `webkit2gtk` | Install the Tauri Linux deps listed above. |
| Frontend changes not reflected | In dev, Tauri hot-reloads; for a release, rerun `build`. |
| Indicator/backtest math unchanged after editing Rust | Rebuild WASM (omit `-SkipWasm` / `SKIP_WASM`). |
| Port 5173 already in use | Stop other Vite servers, or change the web dev port. |

---

## Notes

- The desktop backend also exposes the shared engine over IPC
  (`run_backtest`, `engine_version`) — see `desktop/src-tauri/src/lib.rs` — as a
  demonstration of reusing `core` natively (no WASM) inside the desktop process.
- Code-signing/notarization for distribution is out of scope here; see the
  [Tauri distribution guide](https://v2.tauri.app/distribute/).
