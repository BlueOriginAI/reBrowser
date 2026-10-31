#!/usr/bin/env python3
"""Immutable GitHub release asset storage used by release components."""

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional

from .github import ensure_published_release, inspect_github_release


class ReleaseAssetError(RuntimeError):
    """A release asset is missing or conflicts with an immutable binding."""


def release_assets(tag: str, repo: str) -> Dict[str, dict]:
    """Map asset name to its size and sha256 digest for one release."""
    try:
        release = inspect_github_release(tag, repo)
    except Exception as error:
        raise ReleaseAssetError(f"Release {tag} is not readable: {error}") from error
    assets = release.get("assets")
    if not isinstance(assets, list):
        raise ReleaseAssetError(f"Release {tag} returned no asset list")
    result: Dict[str, dict] = {}
    for asset in assets:
        if not isinstance(asset, dict):
            raise ReleaseAssetError(f"Release {tag} has an invalid asset entry")
        name = asset.get("name")
        if not isinstance(name, str) or not name:
            raise ReleaseAssetError(f"Release {tag} has an unnamed asset")
        digest = asset.get("digest") or ""
        result[name] = {
            "size": int(asset.get("size") or 0),
            "sha256": digest.removeprefix("sha256:") if isinstance(digest, str) else "",
        }
    return result


def download_release_asset(
    tag: str, repo: str, name: str, destination: Path
) -> Path:
    """Download one release asset or raise."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "gh",
            "release",
            "download",
            tag,
            "--repo",
            repo,
            "--pattern",
            name,
            "--dir",
            str(destination.parent),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ReleaseAssetError(
            f"Failed to download {tag}/{name}: {result.stderr.strip()}"
        )
    path = destination.parent / name
    if not path.is_file():
        raise ReleaseAssetError(f"Downloaded asset is missing: {tag}/{name}")
    if path != destination:
        path.replace(destination)
    return destination


def _upload(tag: str, repo: str, path: Path, name: str) -> None:
    result = subprocess.run(
        [
            "gh",
            "release",
            "upload",
            tag,
            str(path),
            "--repo",
            repo,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return
    existing = release_assets(tag, repo)
    if name in existing:
        return
    raise ReleaseAssetError(
        f"Failed to upload {tag}/{name}: {result.stderr.strip()}"
    )


def upload_immutable_asset(
    tag: str,
    repo: str,
    path: Path,
    *,
    name: Optional[str] = None,
    expected_sha256: str = "",
    title: str = "",
) -> str:
    """Upload an asset once, accepting only byte-identical retries."""
    asset_name = name or path.name
    ensure_published_release(tag, repo, title or f"Release assets {tag}")
    existing = release_assets(tag, repo)
    if asset_name in existing:
        digest = existing[asset_name]["sha256"]
        if expected_sha256 and digest and digest != expected_sha256:
            raise ReleaseAssetError(
                f"Release asset {tag}/{asset_name} conflicts with its binding"
            )
        return "reused"
    _upload(tag, repo, path, asset_name)
    verified = release_assets(tag, repo)
    entry = verified.get(asset_name)
    if entry is None:
        raise ReleaseAssetError(f"Uploaded asset did not appear: {tag}/{asset_name}")
    if expected_sha256 and entry["sha256"] and entry["sha256"] != expected_sha256:
        raise ReleaseAssetError(
            f"Uploaded asset digest mismatch: {tag}/{asset_name}"
        )
    return "uploaded"


def upload_json_asset(
    tag: str,
    repo: str,
    name: str,
    document: dict,
    *,
    title: str = "",
) -> str:
    """Write a JSON document to a temporary file and upload it immutably."""
    payload = (json.dumps(document, indent=2, sort_keys=True) + "\n").encode()
    with tempfile.TemporaryDirectory(prefix="release-asset-") as temp_dir:
        path = Path(temp_dir) / name
        path.write_bytes(payload)
        return upload_immutable_asset(tag, repo, path, name=name, title=title)
