#!/usr/bin/env bash
# ============================================================
#  sample_run.sh — Battery SoC Estimation Sample Run
# ============================================================
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "============================================================"
echo "  Battery SoC Estimation — Sample Run"
echo "  Working directory: $REPO_DIR"
echo "============================================================"

VENV_DIR=".venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "→ Creating isolated Python virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Ensure we use the venv's python/pip explicitly to avoid Arch PEP 668 errors
VENV_PYTHON="$REPO_DIR/$VENV_DIR/bin/python3"

echo "→ Updating pip and installing dependencies..."
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install -q numpy scipy matplotlib pandas

echo "→ Running pipeline..."
"$VENV_PYTHON" run_pipeline.py "$@"

echo ""
echo "→ Summary of generated files:"
ls -lh outputs/*.png outputs/*.csv 2>/dev/null || echo "  (check outputs/ directory)"

echo "============================================================"
echo "  Run Complete. All outputs saved to: outputs/"
echo "============================================================"