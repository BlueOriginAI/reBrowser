#!/usr/bin/env python3
"""Probe component versions for immutable GitHub release assets."""

from typing import Callable, Optional

from ..lib.github_assets import fetch_release_json
from ..lib.github_releases import (
    COMPONENT_MANIFEST_SCHEMA,
    extension_tag,
    github_repo,
    release_asset_url,
)
from .components import (
    AllocationRecord,
    component_by_id,
    normalize_component_version,
)
from .feeds.spec import extension_by_name


_RESOURCE_COMPONENTS = frozenset(
    {"server", "claw-server-rust", "claw-onboard", "app-onboard"}
)
_EXTENSION_COMPONENTS = frozenset({"agent", "browserclaw"})

ManifestFetcher = Callable[[str, Optional[str], Optional[str]], Optional[dict]]
UrlFetcher = Callable[[str], Optional[dict]]


def _manifest_fetcher(
    component: str, version: Optional[str], repo: Optional[str]
) -> Optional[dict]:
    from ..lib.github_assets import fetch_component_manifest

    return fetch_component_manifest(component, version, repo)


def _resource_allocation(
    component: str,
    version: str,
    source_sha: str,
    repo: str,
    fetch: ManifestFetcher,
) -> Optional[AllocationRecord]:
    document = fetch(component, version, repo)
    if document is None:
        return None
    if document.get("schema") != COMPONENT_MANIFEST_SCHEMA:
        raise RuntimeError(f"Component manifest for {component} {version} is invalid")
    manifest_sha = str(document.get("release_sha", ""))
    reusable = bool(source_sha) and manifest_sha == source_sha
    tag = component_by_id(component).tag_prefix + version
    return AllocationRecord(
        component=component,
        version=version,
        kind="resource",
        source_sha=source_sha if reusable else "",
        reference=tag if reusable else f"release://{repo}/{tag}",
        reusable=reusable,
    )


def _extension_allocation(
    component: str,
    version: str,
    source_sha: str,
    repo: str,
    fetch: UrlFetcher,
) -> Optional[AllocationRecord]:
    spec = extension_by_name(component)
    crx_name = f"{spec.name}-{version}.crx"
    sidecar = f"{crx_name}.json"
    document = fetch(release_asset_url(extension_tag(version), sidecar, repo))
    if document is None:
        return None
    expected = {
        "binding-schema": "browseros-extension-crx-v1",
        "extension": component,
        "version": version,
    }
    mismatches = {
        name: {"expected": value, "actual": document.get(name)}
        for name, value in expected.items()
        if document.get(name) != value
    }
    if mismatches:
        raise RuntimeError(
            f"Extension CRX binding for {component} {version} is invalid: {mismatches}"
        )
    crx_sha = str(document.get("source-sha", ""))
    reusable = bool(source_sha) and crx_sha == source_sha
    tag = extension_tag(version)
    return AllocationRecord(
        component=component,
        version=version,
        kind="resource",
        source_sha=source_sha if reusable else "",
        reference=tag if reusable else f"release://{repo}/{tag}",
        reusable=reusable,
    )


def discover_component_allocation(
    component: str,
    version: str,
    source_sha: str,
    *,
    repo: Optional[str] = None,
    fetch_manifest: ManifestFetcher = _manifest_fetcher,
    fetch_url: UrlFetcher = fetch_release_json,
) -> Optional[AllocationRecord]:
    """Probe one component version for an immutable release allocation."""
    normalized = normalize_component_version(component, version)
    repository = repo or github_repo()
    if component in _RESOURCE_COMPONENTS:
        return _resource_allocation(
            component, normalized, source_sha, repository, fetch_manifest
        )
    if component in _EXTENSION_COMPONENTS:
        return _extension_allocation(
            component, normalized, source_sha, repository, fetch_url
        )
    raise ValueError(f"Immutable allocations are not defined for {component}")
