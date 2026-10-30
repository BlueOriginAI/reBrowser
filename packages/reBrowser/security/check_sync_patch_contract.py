#!/usr/bin/env python3
"""Run the versioned native account/sync source contracts on patch payloads."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
patch_root = root / "chromium_patches"
patch = patch_root / "chrome/browser/browseros/sync/patch_contract_test.py"
payload = "\n".join(line[1:] for line in patch.read_text().splitlines() if line.startswith("+") and not line.startswith("+++")) + "\n"
with tempfile.TemporaryDirectory(prefix="rebrowser-sync-contract-") as temporary:
    runner = Path(temporary) / "contract.py"
    runner.write_text(payload)
    subprocess.run([sys.executable, str(runner), "--patch-root", str(patch_root)], check=True)
