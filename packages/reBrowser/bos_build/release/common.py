#!/usr/bin/env python3
"""Common utilities for release modules"""

import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..lib.env import EnvConfig
from ..lib.github_releases import github_repo, release_asset_url, release_tag
from ..core.products import ProductDescriptor, default_product_descriptor

PLATFORMS = ["macos", "win", "linux"]
PLATFORM_DISPLAY_NAMES = {"macos": "macOS", "win": "Windows", "linux": "Linux"}
_PLATFORM_ALIASES = {
    "linux": "linux",
    "macos": "macos",
    "win": "win",
    "windows": "win",
}
_PROVENANCE_FIELDS = (
    "source_sha",
    "workflow_run_id",
    "workflow_run_attempt",
)


def selected_release_platforms(platforms: str) -> Tuple[str, ...]:
    """Map a workflow platform selection to release.json platform keys."""
    if platforms == "all":
        return tuple(PLATFORMS)
    try:
        return (_PLATFORM_ALIASES[platforms],)
    except KeyError as exc:
        valid = ", ".join(("all", *sorted(_PLATFORM_ALIASES)))
        raise ValueError(
            f"Unknown release platform selection '{platforms}'. Valid: {valid}"
        ) from exc


def expected_browser_artifact_keys(
    platforms: str,
    macos_arch: str,
) -> Dict[str, set[str]]:
    """Exact browser artifact keys selected by the top-level release inputs."""
    expected: Dict[str, set[str]] = {}
    for platform in selected_release_platforms(platforms):
        if platform == "linux":
            expected[platform] = {"x64_appimage", "x64_deb"}
        elif platform == "win":
            expected[platform] = {"x64_installer", "x64_zip"}
        elif macos_arch == "universal":
            expected[platform] = {"arm64", "x64", "universal"}
        elif macos_arch in ("arm64", "x64"):
            expected[platform] = {macos_arch}
        else:
            raise ValueError(
                f"Unknown macOS architecture '{macos_arch}'. "
                "Valid: arm64, x64, universal"
            )
    return expected


def validate_release_metadata(
    metadata: Dict[str, Dict],
    *,
    version: str,
    product_id: str,
    platforms: str,
    macos_arch: str,
    source_sha: str = "",
    workflow_run_id: str = "",
    workflow_run_attempt: str = "",
) -> Dict[str, Dict]:
    """Select and validate the exact release metadata for one invocation."""
    expected = expected_browser_artifact_keys(platforms, macos_arch)
    provenance = {
        "source_sha": source_sha,
        "workflow_run_id": workflow_run_id,
        "workflow_run_attempt": workflow_run_attempt,
    }
    selected: Dict[str, Dict] = {}

    for platform, expected_keys in expected.items():
        release = metadata.get(platform)
        if release is None:
            raise RuntimeError(
                f"Missing {platform} release metadata for {product_id} v{version}"
            )

        identity = {
            "product": product_id,
            "version": version,
            "platform": platform,
        }
        for field, expected_value in identity.items():
            if str(release.get(field, "")) != expected_value:
                raise RuntimeError(
                    f"{platform} release metadata {field} mismatch: "
                    f"expected {expected_value!r}, got {release.get(field)!r}"
                )

        for field in _PROVENANCE_FIELDS:
            expected_value = provenance[field]
            if expected_value and str(release.get(field, "")) != expected_value:
                raise RuntimeError(
                    f"{platform} release metadata {field} mismatch: "
                    f"expected {expected_value!r}, got {release.get(field)!r}"
                )

        artifacts = release.get("artifacts")
        if not isinstance(artifacts, dict):
            raise RuntimeError(
                f"{platform} release metadata artifacts is not an object"
            )
        actual_keys = set(artifacts)
        if actual_keys != expected_keys:
            raise RuntimeError(
                f"{platform} release metadata artifact keys mismatch: "
                f"expected {sorted(expected_keys)}, got {sorted(actual_keys)}"
            )
        for key, artifact in artifacts.items():
            if (
                not isinstance(artifact, dict)
                or not artifact.get("filename")
                or not artifact.get("url")
            ):
                raise RuntimeError(
                    f"{platform} release metadata artifact {key!r} "
                    "must include filename and url"
                )

        selected[platform] = release

    return selected


def get_download_path_mapping(
    product: ProductDescriptor | None = None,
) -> Dict[str, Dict[str, str]]:
    """Return product-specific latest-download aliases."""
    product = product or default_product_descriptor()
    prefix = product.artifact_prefix
    return {
        "macos": {
            "arm64": f"download/{prefix}-arm64.dmg",
            "x64": f"download/{prefix}-x86_64.dmg",
            "universal": f"download/{prefix}.dmg",
        },
        "win": {
            "x64_installer": f"download/{prefix}_installer.exe",
        },
        "linux": {
            "x64_appimage": f"download/{prefix}.AppImage",
            "x64_deb": f"download/{prefix}.deb",
            "arm64_appimage": f"download/{prefix}-arm64.AppImage",
            "arm64_deb": f"download/{prefix}-arm64.deb",
        },
    }


def release_metadata_path(artifacts_dir: Path, platform: str) -> Path:
    return artifacts_dir / f"release-{platform}.json"


def read_release_metadata(
    artifacts_dir: Optional[Path],
    tag: str,
    platform: str,
    repo: Optional[str] = None,
) -> Optional[Dict]:
    """Load one platform receipt from disk or from its GitHub release asset."""
    if artifacts_dir is not None:
        path = release_metadata_path(artifacts_dir, platform)
        if not path.is_file():
            return None
        return json.loads(path.read_text())
    url = release_asset_url(tag, f"release-{platform}.json", repo)
    try:
        response = subprocess.run(
            ["curl", "--fail", "--silent", "--show-error", "-L", url],
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return None
    return json.loads(response.stdout)


def fetch_all_release_metadata(
    version: str,
    env: Optional[EnvConfig] = None,
    product_id: str = "browseros",
    *,
    artifacts_dir: Optional[Path] = None,
    repo: Optional[str] = None,
) -> Dict[str, Dict]:
    """Collect every platform receipt for one version.

    Finalize passes the Actions-artifact directory; CLI users rely on the
    metadata assets attached to the published GitHub release.
    """
    del env  # Kept for call-site compatibility; metadata lives in GitHub Releases.
    tag = release_tag(version, product_id)
    resolved_repo = repo or github_repo()

    metadata = {}
    for platform in PLATFORMS:
        release_data = read_release_metadata(
            artifacts_dir, tag, platform, resolved_repo
        )
        if release_data:
            metadata[platform] = release_data

    return metadata


def version_sort_key(version: str) -> tuple:
    """Numeric tuple key for sorting versions; non-numeric parts count as 0."""
    parts = []
    for part in version.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def list_all_versions(
    product_id: str = "browseros",
    env: Optional[EnvConfig] = None,
    repo: Optional[str] = None,
) -> List[str]:
    """List versioned browser releases from GitHub, newest first."""
    del env
    resolved_repo = repo or github_repo()
    try:
        response = subprocess.run(
            [
                "gh",
                "api",
                "--paginate",
                f"repos/{resolved_repo}/releases?per_page=100",
                "--jq",
                ".[].tag_name",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return []

    versions = []
    for tag in response.stdout.splitlines():
        tag = tag.strip()
        prefix = "" if product_id == "browseros" else f"{product_id}/"
        match = re.fullmatch(rf"{re.escape(prefix)}v(\d+(?:\.\d+)*)", tag)
        if match:
            versions.append(match.group(1))
    versions.sort(key=version_sort_key, reverse=True)
    return versions


def format_size(size_bytes: int) -> str:
    """Format bytes as human-readable size"""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.0f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.0f} KB"
    return f"{size_bytes} B"


def generate_appcast_item(
    artifact: Dict,
    version: str,
    sparkle_version: str,
    build_date: str,
    platform: str = "macos",
) -> str:
    """Generate a Sparkle/WinSparkle <item> XML for an artifact

    macOS items carry a minimumSystemVersion; Windows items instead tag the
    enclosure with sparkle:os="windows" so WinSparkle accepts it.
    """
    try:
        dt = datetime.fromisoformat(build_date.replace("Z", "+00:00"))
        pub_date = dt.strftime("%a, %d %b %Y %H:%M:%S %z")
    except Exception:
        pub_date = build_date

    signature = artifact.get("sparkle_signature", "")
    length = artifact.get("sparkle_length", artifact.get("size", 0))

    os_attr = '\n    sparkle:os="windows"' if platform == "win" else ""
    footer = (
        ""
        if platform == "win"
        else "\n  <sparkle:minimumSystemVersion>10.15</sparkle:minimumSystemVersion>"
    )
    enclosure = f"""<enclosure
    url="{artifact['url']}"{os_attr}
    sparkle:edSignature="{signature}"
    length="{length}"
    type="application/octet-stream" />"""

    return f"""<item>
  <title>BrowserOS - {version}</title>
  <description sparkle:format="plain-text">
  </description>
  <sparkle:version>{sparkle_version}</sparkle:version>
  <sparkle:shortVersionString>{version}</sparkle:shortVersionString>
  <pubDate>{pub_date}</pubDate>
  <link>https://browseros.com</link>
  {enclosure}{footer}
</item>"""


def generate_release_notes(
    version: str,
    metadata: Dict[str, Dict],
    product: Optional[ProductDescriptor] = None,
) -> str:
    """Generate markdown release notes from metadata"""
    product = product or default_product_descriptor()
    chromium_version = "unknown"
    for platform in PLATFORMS:
        if platform in metadata:
            chromium_version = metadata[platform].get("chromium_version", "unknown")
            break

    notes = f"""## {product.display_name} v{version}

Chromium version: {chromium_version}

### Downloads

"""
    for platform in PLATFORMS:
        if platform not in metadata:
            continue

        platform_name = PLATFORM_DISPLAY_NAMES[platform]
        notes += f"**{platform_name}:**\n"

        for key, artifact in metadata[platform].get("artifacts", {}).items():
            notes += f"- [{artifact['filename']}]({artifact['url']})\n"
        notes += "\n"

    return notes


def get_repo_from_git() -> Optional[str]:
    """Get GitHub repo (owner/name) from git remote"""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=True,
        )
        remote_url = result.stdout.strip()

        if "github.com" not in remote_url:
            return None

        if remote_url.startswith("git@"):
            return remote_url.split(":")[-1].replace(".git", "")
        else:
            return "/".join(remote_url.split("/")[-2:]).replace(".git", "")
    except Exception:
        return None


def check_gh_cli() -> bool:
    """Check if gh CLI is available"""
    try:
        subprocess.run(["gh", "--version"], capture_output=True, check=True)
        return True
    except Exception:
        return False
