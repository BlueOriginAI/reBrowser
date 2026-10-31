#!/usr/bin/env python3
"""Read component resource manifests and assets from GitHub Releases."""

import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

from .github_releases import (
    COMPONENT_MANIFEST_SCHEMA,
    component_manifest_url,
    github_repo,
)

_VERSION_RE = re.compile(r"[0-9]+(?:\.[0-9]+){2,3}")
_SHA_RE = re.compile(r"[0-9a-f]{40}")
_SHA256_RE = re.compile(r"[0-9a-f]{64}")
_FETCH_CHUNK = 1024 * 1024

JsonFetcher = Callable[[str], Optional[dict]]


class ManifestError(RuntimeError):
    """A component manifest is missing or inconsistent."""


def fetch_json(url: str, timeout: float = 30) -> Optional[dict]:
    """Fetch one public JSON document; 404 means the document is absent."""
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "rebrowser-release"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise RuntimeError(f"Failed to fetch {url}: HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Failed to fetch {url}: {error.reason}") from error
    try:
        document = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Invalid JSON at {url}") from error
    if not isinstance(document, dict):
        raise RuntimeError(f"JSON at {url} is not an object")
    return document


def _release_url_parts(url: str) -> Optional[tuple[str, str, str]]:
    parts = urllib.parse.urlsplit(url)
    if parts.netloc != "github.com":
        return None
    segments = parts.path.strip("/").split("/")
    if len(segments) != 6 or segments[2:4] != ["releases", "download"]:
        return None
    owner, name, _, _, tag, filename = segments
    return (
        f"{owner}/{name}",
        urllib.parse.unquote(tag),
        urllib.parse.unquote(filename),
    )


def _gh_token() -> bool:
    return bool(
        os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    )


def _download_release_json(
    repo: str, tag: str, filename: str
) -> Optional[dict]:
    if not _gh_token():
        return None
    with tempfile.TemporaryDirectory(prefix="release-asset-") as temp_dir:
        result = subprocess.run(
            [
                "gh",
                "release",
                "download",
                tag,
                "--repo",
                repo,
                "--pattern",
                filename,
                "--dir",
                temp_dir,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return None
        path = Path(temp_dir) / filename
        if not path.is_file():
            return None
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return None
    return document if isinstance(document, dict) else None


def fetch_release_json(
    url: str, timeout: float = 30
) -> Optional[dict]:
    """Read a release asset, falling back to authenticated gh for drafts."""
    document = fetch_json(url, timeout)
    if document is not None:
        return document
    parsed = _release_url_parts(url)
    if parsed is None:
        return None
    return _download_release_json(*parsed)


def validate_component_manifest(
    document: Any,
    component: str,
    version: Optional[str] = None,
) -> dict:
    """Validate a component resource manifest and return it unchanged."""
    if not isinstance(document, dict):
        raise ManifestError("component manifest is not an object")
    if document.get("schema") != COMPONENT_MANIFEST_SCHEMA:
        raise ManifestError("component manifest has an unsupported schema")
    if document.get("component") != component:
        raise ManifestError("component manifest names a different component")
    manifest_version = document.get("version")
    if not isinstance(manifest_version, str) or not _VERSION_RE.fullmatch(
        manifest_version
    ):
        raise ManifestError("component manifest has an invalid version")
    if version is not None and manifest_version != version:
        raise ManifestError("component manifest version does not match")
    release_sha = document.get("release_sha", "")
    if release_sha and (
        not isinstance(release_sha, str) or not _SHA_RE.fullmatch(release_sha)
    ):
        raise ManifestError("component manifest has an invalid release SHA")
    targets = document.get("targets")
    if not isinstance(targets, dict) or not targets:
        raise ManifestError("component manifest has no targets")
    for target, entry in targets.items():
        if not isinstance(target, str) or not target:
            raise ManifestError("component manifest has an invalid target")
        if not isinstance(entry, dict):
            raise ManifestError(f"component manifest target {target} is invalid")
        filename = entry.get("filename")
        sha256 = entry.get("sha256")
        size = entry.get("size")
        if (
            not isinstance(filename, str)
            or not filename
            or "/" in filename
            or "\\" in filename
        ):
            raise ManifestError(f"component manifest target {target} has no filename")
        if not isinstance(sha256, str) or not _SHA256_RE.fullmatch(sha256):
            raise ManifestError(f"component manifest target {target} has no sha256")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise ManifestError(f"component manifest target {target} has no size")
    return document


def fetch_component_manifest(
    component: str,
    version: Optional[str] = None,
    repo: Optional[str] = None,
    *,
    fetch: JsonFetcher = fetch_release_json,
) -> Optional[dict]:
    """Fetch and validate one component manifest, or None when absent."""
    url = component_manifest_url(component, version, repo or github_repo())
    document = fetch(url)
    if document is None:
        return None
    return validate_component_manifest(document, component, version)


def download_asset(
    url: str,
    destination: Path,
    *,
    expected_sha256: str = "",
    expected_size: Optional[int] = None,
    timeout: float = 120,
) -> None:
    """Download a release asset and verify its size and checksum."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    written = 0
    request = urllib.request.Request(
        url, headers={"User-Agent": "rebrowser-release"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            with destination.open("wb") as output:
                for chunk in iter(lambda: response.read(_FETCH_CHUNK), b""):
                    digest.update(chunk)
                    written += len(chunk)
                    output.write(chunk)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Failed to download {url}: HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Failed to download {url}: {error.reason}") from error
    if expected_size is not None and written != expected_size:
        raise RuntimeError(
            f"Downloaded size mismatch for {url}: "
            f"expected {expected_size}, got {written}"
        )
    if expected_sha256 and digest.hexdigest() != expected_sha256:
        raise RuntimeError(f"Downloaded checksum mismatch for {url}")
