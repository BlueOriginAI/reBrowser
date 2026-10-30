#!/usr/bin/env python3
"""GitHub Releases URL helpers.

Public downloads and update feeds are served from GitHub Releases instead of
the Cloudflare R2/CDN. A single repository hosts several products and feed
channels, so URLs are derived from explicit tags rather than GitHub's one
"latest" release per repository.
"""

import os
import re
import subprocess
from typing import Optional
from urllib.parse import quote

DEFAULT_REPO = "BlueOriginAI/reBrowser"

_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_GITHUB_REMOTE_RE = re.compile(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$")

PRODUCT_IDS = ("browseros", "browserclaw")
NO_PRODUCT_FEEDS = ("extensions",)


def github_repo() -> str:
    """Resolve the public release repository (CI env, then origin remote)."""
    env_repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if env_repo and _REPO_RE.fullmatch(env_repo):
        return env_repo
    try:
        remote = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except Exception:
        return DEFAULT_REPO
    match = _GITHUB_REMOTE_RE.search(remote)
    return match.group(1) if match else DEFAULT_REPO


def release_asset_url(
    tag: str, filename: str, repo: Optional[str] = None
) -> str:
    """Public URL of one asset on a GitHub release."""
    repo = repo or github_repo()
    return (
        f"https://github.com/{repo}/releases/download/"
        f"{quote(tag, safe='')}/{quote(filename)}"
    )


def release_tag(version: str, product_id: str) -> str:
    """Versioned tag for immutable browser release assets."""
    normalized = version
    parts = version.split(".")
    if len(parts) == 4 and parts[-1] == "0":
        normalized = ".".join(parts[:3])
    if product_id == "browseros":
        return f"v{normalized}"
    return f"{product_id}/v{normalized}"


def feed_tag(kind: str, product_id: str) -> str:
    """Stable tag whose assets hold the live update feed for one channel."""
    if kind == "macos":
        return f"feed-{product_id}"
    if kind == "win":
        return f"feed-win-{product_id}"
    if kind == "server":
        return f"feed-server-{product_id}"
    if kind == "extensions":
        return "feed-extensions"
    raise ValueError(f"Unknown feed kind: {kind}")


def feed_asset_url(
    kind: str, product_id: str, filename: str, repo: Optional[str] = None
) -> str:
    """Public URL of one live feed asset."""
    return release_asset_url(feed_tag(kind, product_id), filename, repo)


def alias_tag(product_id: str) -> str:
    """Stable tag whose assets hold the newest installers per product."""
    return f"latest-{product_id}"


def alias_asset_url(
    product_id: str, filename: str, repo: Optional[str] = None
) -> str:
    """Public URL of one latest-installer alias."""
    return release_asset_url(alias_tag(product_id), filename, repo)


def extension_tag(version: str) -> str:
    """Versioned tag for immutable extension CRX assets."""
    return f"extensions/v{version}"


def extension_asset_url(
    version: str, filename: str, repo: Optional[str] = None
) -> str:
    return release_asset_url(extension_tag(version), filename, repo)


def server_tag(version: str) -> str:
    """Versioned tag for immutable server OTA assets."""
    return f"server/v{version}"


def server_asset_url(
    version: str, filename: str, repo: Optional[str] = None
) -> str:
    return release_asset_url(server_tag(version), filename, repo)
