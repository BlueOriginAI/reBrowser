#!/usr/bin/env python3
"""Fail if a formal release depends on unversioned native account modules."""
from pathlib import Path
import subprocess

repo = Path(__file__).resolve().parents[3]
paths = [
    "chrome/browser/browseros/account/remocode_account_service.cc",
    "chrome/browser/browseros/account/remocode_oauth.cc",
    "chrome/browser/browseros/account/remocode_callback_server.cc",
    "chrome/browser/browseros/account/remocode_account_service_unittest.cc",
    "chrome/browser/browseros/sync/remocode_sync_service.cc",
    "chrome/browser/browseros/sync/sync_protocol.cc",
    "chrome/browser/browseros/sync/sensitive_sync_path.h",
    "chrome/browser/browseros/sync/sync_protocol_unittest.cc",
    "chrome/browser/ui/webui/settings/remocode_account_handler.cc",
    "chrome/browser/ui/webui/settings/remocode_sync_handler.cc",
]
for path in paths:
    subprocess.run(["git", "-C", str(repo), "ls-files", "--error-unmatch", "--", "packages/reBrowser/chromium_patches/" + path], check=True, stdout=subprocess.DEVNULL)
print(f"Native account/sync source: {len(paths)} critical files versioned")
