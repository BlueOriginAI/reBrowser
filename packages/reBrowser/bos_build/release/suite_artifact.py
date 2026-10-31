#!/usr/bin/env python3
"""Publish one signed suite browser artifact through immutable release assets.

Signing jobs persist a DMG and its complete release receipt in Actions. This
module validates that receipt against the family transaction, then creates each
versioned GitHub release asset once so retries accept identical bytes and
reject every conflicting identity or checksum without overwriting public state.
"""

from __future__ import annotations

import hashlib
import json
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Protocol

from ..lib.github_releases import github_repo, release_tag
from ..products.resource_sources import source_resources_for_product
from .github_store import (
    ReleaseAssetError,
    download_release_asset,
    release_assets,
    upload_immutable_asset,
    upload_json_asset,
)
from .suite import SuiteRecord


_SHA256_RE = re.compile(r"[0-9a-f]{64}")


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


@dataclass(frozen=True)
class SuiteArtifactPublication:
    """Auditable immutable effects for one product's signed suite artifact."""

    product: str
    version: str
    source_sha: str
    reservation_sha: str
    artifact_key: str
    artifact_sha256: str
    receipt_key: str
    receipt_sha256: str

    def to_json(self) -> str:
        return json.dumps(self.__dict__, indent=2, sort_keys=True) + "\n"


class ImmutableObjectBackend(Protocol):
    def ensure(
        self,
        key: str,
        content: bytes,
        *,
        content_type: str,
        binding: Mapping[str, str],
    ) -> None: ...


class GitHubImmutableObjectBackend:
    """Conditional-create adapter for the suite's versioned release assets."""

    def __init__(self, repo: str = "") -> None:
        self.repo = repo or github_repo()

    def _identity(self, key: str) -> tuple[str, str]:
        parts = key.split("/")
        if len(parts) != 5 or parts[0] != "releases":
            raise ValueError(f"Unsupported suite artifact key: {key}")
        _, product, version, platform, name = parts
        if Path(name).name != name:
            raise ValueError(f"Unsupported suite artifact key: {key}")
        tag = release_tag(version, product)
        asset = name if platform == "macos" else f"{platform}-{name}"
        if name == "release.json" and platform != "macos":
            asset = f"release-{platform}.json"
        return tag, asset

    def _verify(
        self,
        tag: str,
        asset: str,
        sha256: str,
        binding: Mapping[str, str],
    ) -> None:
        try:
            existing = release_assets(tag, self.repo)
        except ReleaseAssetError as error:
            raise RuntimeError(f"Failed to inspect {tag}: {error}") from error
        entry = existing.get(asset)
        if entry is None:
            raise RuntimeError(f"Immutable release asset is missing: {tag}/{asset}")
        if entry["sha256"] and entry["sha256"] != sha256:
            raise RuntimeError(
                f"Immutable release asset {tag}/{asset} conflicts with its checksum"
            )
        with tempfile.TemporaryDirectory(prefix="suite-binding-") as temp_dir:
            sidecar = download_release_asset(
                tag, self.repo, f"{asset}.json", Path(temp_dir) / f"{asset}.json"
            )
            try:
                document = json.loads(sidecar.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(
                    f"Immutable release asset {tag}/{asset} has no valid binding"
                ) from error
        if not isinstance(document, dict):
            raise RuntimeError(
                f"Immutable release asset {tag}/{asset} has no valid binding"
            )
        if document.get("sha256") != sha256 or document.get("binding") != binding:
            raise RuntimeError(
                f"Immutable release asset {tag}/{asset} binding conflicts"
            )

    def ensure(
        self,
        key: str,
        content: bytes,
        *,
        content_type: str,
        binding: Mapping[str, str],
    ) -> None:
        del content_type
        tag, asset = self._identity(key)
        sha256 = _sha256(content)
        expected_binding = dict(binding)
        with tempfile.TemporaryDirectory(prefix="suite-artifact-") as temp_dir:
            path = Path(temp_dir) / asset
            path.write_bytes(content)
            try:
                upload_immutable_asset(
                    tag,
                    self.repo,
                    path,
                    expected_sha256=sha256,
                    title=f"Suite browser artifact {tag}",
                )
                upload_json_asset(
                    tag,
                    self.repo,
                    f"{asset}.json",
                    {"sha256": sha256, "binding": expected_binding},
                    title=f"Suite browser artifact {tag}",
                )
            except ReleaseAssetError as error:
                raise RuntimeError(str(error)) from error
        # Verification is mandatory after both create and an existing asset:
        # the sidecar proves bytes and transaction binding rather than trusting
        # asset existence alone.
        self._verify(tag, asset, sha256, expected_binding)


def _string_map(value: object, name: str) -> dict[str, str]:
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise ValueError(f"Suite artifact receipt {name} must be a string map")
    return dict(value)


def publish_suite_browser_artifact(
    record: SuiteRecord,
    product: str,
    artifact_root: Path,
    backend: ImmutableObjectBackend,
) -> SuiteArtifactPublication:
    """Validate and conditionally publish one product's signed DMG and receipt."""
    if record.state != "merged":
        raise ValueError("Suite browser artifacts publish only after the state merge")
    if product not in record.products:
        raise ValueError(f"Unknown suite product: {product}")
    receipt_path = artifact_root / "release.json"
    document = json.loads(receipt_path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError("Suite browser release receipt must be an object")

    expected_identity: Mapping[str, object] = {
        "product": product,
        "platform": "macos",
        "version": record.browser_version,
        "source_sha": record.source_sha,
        "reservation_sha": record.reservation_sha,
    }
    for name, expected in expected_identity.items():
        if document.get(name) != expected:
            raise ValueError(
                f"Suite browser release receipt {name} does not match transaction"
            )
    resources = source_resources_for_product(product)
    expected_components = {
        resources.server_component: record.component_versions[
            resources.server_component
        ],
        resources.extension_component: record.component_versions[
            resources.extension_component
        ],
        resources.onboarding_component: record.component_versions[
            resources.onboarding_component
        ],
    }
    if (
        _string_map(document.get("component_versions"), "component_versions")
        != expected_components
    ):
        raise ValueError(
            "Suite browser release receipt component_versions do not match transaction"
        )

    artifacts = document.get("artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != {"arm64"}:
        raise ValueError("Suite browser release receipt must contain only arm64")
    artifact = artifacts["arm64"]
    if not isinstance(artifact, dict):
        raise ValueError("Suite browser release artifact metadata must be an object")
    filename = artifact.get("filename")
    checksum = artifact.get("sha256")
    size = artifact.get("size")
    if (
        not isinstance(filename, str)
        or Path(filename).name != filename
        or not isinstance(checksum, str)
        or not _SHA256_RE.fullmatch(checksum)
        or not isinstance(size, int)
        or size <= 0
        or not isinstance(artifact.get("sparkle_signature"), str)
        or not artifact.get("sparkle_signature")
        or artifact.get("sparkle_length") != size
    ):
        raise ValueError("Suite browser release artifact metadata is incomplete")
    artifact_path = artifact_root / filename
    content = artifact_path.read_bytes()
    if len(content) != size or _sha256(content) != checksum:
        raise ValueError("Suite browser release artifact bytes do not match receipt")

    prefix = f"releases/{product}/{record.browser_version}/macos"
    artifact_key = f"{prefix}/{filename}"
    receipt_key = f"{prefix}/release.json"
    binding = {
        "transaction": record.transaction_id,
        "product": product,
        "source-sha": record.source_sha,
        "reservation-sha": record.reservation_sha,
    }
    backend.ensure(
        artifact_key,
        content,
        content_type="application/x-apple-diskimage",
        binding=binding,
    )
    receipt_content = receipt_path.read_bytes()
    backend.ensure(
        receipt_key,
        receipt_content,
        content_type="application/json",
        binding=binding,
    )
    return SuiteArtifactPublication(
        product=product,
        version=record.browser_version,
        source_sha=record.source_sha,
        reservation_sha=record.reservation_sha,
        artifact_key=artifact_key,
        artifact_sha256=checksum,
        receipt_key=receipt_key,
        receipt_sha256=_sha256(receipt_content),
    )
