#!/usr/bin/env bash
#
# Rebuilds the Axiomic Rust core to WebAssembly and stages it for the web app.
#
# - Compiles `core/` with the `wasm` feature via wasm-pack (web target).
# - Outputs the generated package into `web/src/wasm/`.
# - Removes the auto-generated `.gitignore` that wasm-pack drops in the output
#   dir (it would otherwise ignore the whole generated package).
#
# Usage:
#   bash .github/skills/axiomic-dev/scripts/rebuild-wasm.sh
#
# Run from anywhere inside the repo; the script resolves the repo root itself.

set -euo pipefail

# Resolve the repository root (this script lives at
# <root>/.github/skills/axiomic-dev/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

CORE_DIR="$ROOT/core"
OUT_DIR="$ROOT/web/src/wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "error: wasm-pack not found. Install it with: cargo install wasm-pack" >&2
  exit 1
fi

echo "==> Building axiomic-core → WASM"
echo "    core: $CORE_DIR"
echo "    out:  $OUT_DIR"

cd "$CORE_DIR"
wasm-pack build --release --target web --out-dir "$OUT_DIR" --features wasm

# wasm-pack writes a .gitignore that ignores the generated package; drop it so
# the build artifact path is usable and predictable.
rm -f "$OUT_DIR/.gitignore"

echo "==> Done. Generated:"
ls -1 "$OUT_DIR"
