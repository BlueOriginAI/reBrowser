#!/usr/bin/env python3
"""Compile the production path helper without needing a full Chromium checkout."""

import json
from pathlib import Path
import subprocess
import tempfile
import sys

root = Path(__file__).resolve().parents[1]
patch_root = root / "chromium_patches"
header = Path("chrome/browser/browseros/sync/sensitive_sync_path.h")
patch = (patch_root / header).read_text()
decoded = "\n".join(line[1:] for line in patch.splitlines() if line.startswith("+") and not line.startswith("+++")) + "\n"
protocol = (patch_root / "chrome/browser/browseros/sync/sync_protocol.cc").read_text()
assert 'internal::IsSensitiveOrAmbiguousSyncPath(url.path())' in protocol
assert '#include "chrome/browser/browseros/sync/sensitive_sync_path.h"' in protocol
cases = json.loads((root / "security/sync-url-policy-cases.json").read_text())["cases"]
rows = ",\n".join("{" + json.dumps(case["path"]) + ", " + str(case["blocked"]).lower() + "}" for case in cases)
source = '''#include <iostream>
#include "chrome/browser/browseros/sync/sensitive_sync_path.h"
int main() {
  struct Case { const char* path; bool blocked; };
  const Case cases[] = {''' + rows + '''};
  for (const auto& item : cases) {
    if (browseros::sync::internal::IsSensitiveOrAmbiguousSyncPath(item.path) != item.blocked) {
      std::cerr << "Unexpected result: " << item.path << "\\n";
      return 1;
    }
  }
  std::cout << "Native production path policy: " << std::size(cases) << " cases passed\\n";
}
'''
with tempfile.TemporaryDirectory(prefix="rebrowser-sync-path-policy-") as temporary:
    directory = Path(temporary)
    target = directory / header
    target.parent.mkdir(parents=True)
    target.write_text(decoded)
    cpp = directory / "policy_test.cc"
    cpp.write_text(source)
    binary = directory / "policy_test"
    compiler = ["xcrun", "clang++"] if sys.platform == "darwin" else ["c++"]
    subprocess.run([*compiler, "-std=c++20", "-O2", "-Wall", "-Wextra", "-Werror", "-I", str(directory), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
