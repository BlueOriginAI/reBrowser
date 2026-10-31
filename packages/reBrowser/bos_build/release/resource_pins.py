#!/usr/bin/env python3
"""Resolve immutable component resource versions for a browser release.

Component releases publish their resource zips plus a
``component-manifest.json`` binding (version, source SHA, size, sha256) on
GitHub Releases. A stable ``feed-resources-<component>`` tag mirrors the
newest manifest so builds can resolve the live component without a mutable
object store.
"""

import time
from dataclasses import asdict, dataclass
from typing import Callable, Optional

from ..lib.github_assets import ManifestError, fetch_component_manifest
from ..lib.github_releases import component_tag


@dataclass(frozen=True)
class ResourceFamily:
    """GitHub release layout for one browser resource family."""

    name: str
    component: str
    archive_base: str
    targets: tuple[str, ...]

    def filename(self, target: str) -> str:
        suffix = "" if target == "universal" else f"-{target}"
        return f"{self.archive_base}{suffix}.zip"

    def tag(self, version: str) -> str:
        return component_tag(self.component, version)


@dataclass(frozen=True)
class ResourceObjectPin:
    """Identity of one immutable platform object."""

    target: str
    filename: str
    size: int
    sha256: str
    release_sha: str


@dataclass(frozen=True)
class ResourcePin:
    """One coherent version spanning every target in a resource family."""

    name: str
    version: str
    objects: tuple[ResourceObjectPin, ...]

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "objects": [asdict(item) for item in self.objects],
        }


RESOURCE_FAMILIES = (
    ResourceFamily(
        name="browseros_server",
        component="server",
        archive_base="browseros-server-resources",
        targets=(
            "darwin-arm64",
            "darwin-x64",
            "linux-arm64",
            "linux-x64",
            "windows-x64",
        ),
    ),
    ResourceFamily(
        name="browserclaw_server",
        component="claw-server-rust",
        archive_base="browseros-claw-server-rust-resources",
        targets=(
            "darwin-arm64",
            "darwin-x64",
            "linux-arm64",
            "linux-x64",
            "windows-x64",
        ),
    ),
    ResourceFamily(
        name="browserclaw_onboard",
        component="claw-onboard",
        archive_base="browseros-claw-onboard-resources",
        targets=("universal",),
    ),
    ResourceFamily(
        name="browseros_onboard",
        component="app-onboard",
        archive_base="browseros-app-onboard-resources",
        targets=("universal",),
    ),
)

COMPONENT_RESOURCE_FAMILY = {
    "browseros-server": "browseros_server",
    "browserclaw-server": "browserclaw_server",
    "browserclaw-onboard": "browserclaw_onboard",
    "browseros-onboard": "browseros_onboard",
}

ManifestFetcher = Callable[[str, Optional[str], Optional[str]], Optional[dict]]


def _default_manifest_fetcher(
    component: str, version: Optional[str], repo: Optional[str]
) -> Optional[dict]:
    return fetch_component_manifest(component, version, repo)


def _family_by_name(name: str) -> ResourceFamily:
    family = next((item for item in RESOURCE_FAMILIES if item.name == name), None)
    if family is None:
        raise ValueError(f"unknown prepared resource family: {name}")
    return family


def _pin_from_manifest(family: ResourceFamily, document: dict) -> ResourcePin:
    version = str(document["version"])
    release_sha = str(document.get("release_sha", ""))
    targets = document["targets"]
    if set(targets) != set(family.targets):
        raise ManifestError(
            f"{family.name} manifest targets do not match its resource family"
        )
    objects = []
    for target in family.targets:
        entry = targets[target]
        expected = family.filename(target)
        if entry["filename"] != expected:
            raise ManifestError(
                f"{family.name}/{target} manifest names an unexpected asset"
            )
        objects.append(
            ResourceObjectPin(
                target=target,
                filename=expected,
                size=int(entry["size"]),
                sha256=str(entry["sha256"]),
                release_sha=release_sha,
            )
        )
    return ResourcePin(family.name, version, tuple(objects))


def _fetch_pin(
    family: ResourceFamily,
    version: Optional[str],
    repo: Optional[str],
    fetch: ManifestFetcher,
) -> ResourcePin:
    document = fetch(family.component, version, repo)
    if document is None:
        channel = version or "live"
        raise ManifestError(f"{family.name} has no {channel} component manifest")
    return _pin_from_manifest(family, document)


def verify_prepared_resource_pin(
    family_name: str,
    version: str,
    release_sha: str = "",
    *,
    repo: Optional[str] = None,
    fetch: ManifestFetcher = _default_manifest_fetcher,
) -> ResourcePin:
    """Verify one exact prepared resource family."""
    family = _family_by_name(family_name)
    try:
        pin = _fetch_pin(family, version, repo, fetch)
    except ManifestError as error:
        raise RuntimeError(
            f"Could not verify prepared {family_name} {version}: {error}"
        ) from error
    if release_sha and any(
        item.release_sha != release_sha for item in pin.objects
    ):
        raise RuntimeError(
            f"Could not verify prepared {family_name} {version}: "
            "source binding mismatch"
        )
    return pin


def resolve_resource_pins(
    prepared: dict[str, tuple[str, str]],
    *,
    repo: Optional[str] = None,
    fetch: ManifestFetcher = _default_manifest_fetcher,
    attempts: int = 5,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, ResourcePin]:
    """Resolve prepared versions and coherent live manifests for other families."""
    known = {family.name for family in RESOURCE_FAMILIES}
    unknown = sorted(set(prepared).difference(known))
    if unknown:
        raise ValueError(f"unknown prepared resource families: {', '.join(unknown)}")
    if attempts < 1:
        raise ValueError("attempts must be positive")

    pins = {}
    for family in RESOURCE_FAMILIES:
        override = prepared.get(family.name)
        if override is not None:
            pins[family.name] = verify_prepared_resource_pin(
                family.name,
                override[0],
                override[1],
                repo=repo,
                fetch=fetch,
            )
            continue

        last_error: Optional[Exception] = None
        for attempt in range(attempts):
            try:
                pins[family.name] = _fetch_pin(family, None, repo, fetch)
                break
            except (ManifestError, RuntimeError) as error:
                last_error = error
                if attempt + 1 < attempts:
                    sleep(2**attempt)
        else:
            raise RuntimeError(
                f"Could not resolve a coherent {family.name} resource manifest: "
                f"{last_error}"
            ) from last_error
    return pins
