#!/usr/bin/env python3
"""Server OTA module for BrowserOS Server binary updates"""

import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional

from ...core.step import Step, ValidationError
from ...core.context import Context
from ...lib.utils import (
    log_info,
    log_success,
    log_warning,
    IS_MACOS,
    IS_WINDOWS,
)

from .common import (
    SERVER_PLATFORMS,
    SignedArtifact,
    sparkle_sign_file,
    create_server_bundle_zip,
    get_appcast_path,
    find_server_resources_dir,
    merge_base_appcast,
)
from ..feeds.publisher import FeedPublisher
from .sign_binary import (
    notarize_macos_zip,
    sign_server_bundle_macos,
    sign_server_bundle_windows,
)
from ..feeds.render import parse_server_appcast_content, render_server_appcast
from ..feeds.spec import server_feed
from ...lib.github_assets import download_asset
from ...lib.github_releases import (
    component_resource_url,
    github_repo,
    server_asset_url,
    server_tag,
)
from ...products.server_binaries import ServerBundle, server_ota_bundles_for_product
from ...products.mcp_instance_policy import validate_mcp_instance_policy
from ...steps.storage.download import extract_artifact_zip
from ..github_store import (
    ReleaseAssetError,
    download_release_asset,
    release_assets,
    upload_immutable_asset,
    upload_json_asset,
)
from ..resource_pins import (
    COMPONENT_RESOURCE_FAMILY,
    RESOURCE_FAMILIES,
    ResourcePin,
    verify_prepared_resource_pin,
)


_SOURCE_SHA_RE = re.compile(r"[0-9a-f]{40}")
_PAYLOAD_BINDING_SCHEMA = "browseros-server-ota-v1"


def _family(name: str):
    return next(family for family in RESOURCE_FAMILIES if family.name == name)


class ServerOTAModule(Step):
    """Create signed server OTA payloads from immutable release resources."""

    produces = ["server_ota_artifacts", "server_appcast"]
    requires = []
    description = "Create and upload BrowserOS Server OTA update"

    def __init__(
        self,
        version: str = "",
        channel: str = "alpha",
        platform_filter: Optional[str] = None,
        product_id: str = "browseros",
        release_sha: str = "",
        allow_unbound: bool = False,
    ):
        self.version = version
        self.channel = channel
        self.platform_filter = platform_filter
        self.product_id = product_id
        self.release_sha = release_sha
        self.allow_unbound = allow_unbound
        self._download_dir: Optional[Path] = None

    @property
    def bundle(self) -> ServerBundle:
        bundles = server_ota_bundles_for_product(self.product_id)
        if not bundles:
            raise RuntimeError(f"Product '{self.product_id}' has no server bundle")
        return bundles[0]

    def artifact_filename(self, target: str) -> str:
        """Release asset name of the unsigned server resources zip."""
        family = _family(COMPONENT_RESOURCE_FAMILY[self.bundle.id])
        return family.filename(target)

    def zip_filename(self, platform_name: str) -> str:
        """Sparkle payload zip name (also the enclosure URL basename)."""
        prefix = self.bundle.id.replace("-", "_")
        return f"{prefix}_{self.version}_{platform_name}.zip"

    def validate(self, context: Context) -> None:
        if not self.version:
            raise ValidationError("Version is required")

        if self.channel not in ["alpha", "prod"]:
            raise ValidationError("Channel must be 'alpha' or 'prod'")

        if not server_ota_bundles_for_product(self.product_id):
            raise ValidationError(f"Product '{self.product_id}' has no server bundle")

        if not self.release_sha and not self.allow_unbound:
            raise ValidationError(
                "A full lowercase release SHA is required unless "
                "--allow-unbound is supplied"
            )
        if self.release_sha and _SOURCE_SHA_RE.fullmatch(self.release_sha) is None:
            raise ValidationError("Release SHA must be a full lowercase commit SHA")

        if IS_MACOS():
            if not context.env.macos_certificate_name:
                raise ValidationError("MACOS_CERTIFICATE_NAME required for signing")
        elif IS_WINDOWS():
            if not context.env.code_sign_tool_path:
                raise ValidationError("CODE_SIGN_TOOL_PATH required for signing")

    def _get_platforms(self) -> List[dict]:
        """Get platforms to process based on filter (supports comma-separated)"""
        if self.platform_filter:
            requested = [p.strip() for p in self.platform_filter.split(",")]
            return [p for p in SERVER_PLATFORMS if p["name"] in requested]
        return SERVER_PLATFORMS

    def _download_artifacts(
        self,
        download_dir: Path,
        source_pin: ResourcePin,
    ) -> None:
        """Download snapshot-pinned immutable server resources."""
        platforms = self._get_platforms()
        pinned = {item.target: item for item in source_pin.objects}
        family = _family(source_pin.name)
        repo = github_repo()

        log_info("📥 Downloading server artifacts from GitHub Releases...")

        for platform in platforms:
            target = platform["target"]
            resource = pinned.get(target)
            if resource is None:
                raise RuntimeError(f"Immutable source pin is missing {target}")
            zip_path = download_dir / f"{target}.zip"
            extract_dir = download_dir / target

            log_info(f"  Downloading {target}...")
            download_asset(
                component_resource_url(
                    family.component,
                    source_pin.version,
                    resource.filename,
                    repo,
                ),
                zip_path,
                expected_sha256=resource.sha256,
                expected_size=resource.size,
            )
            extract_artifact_zip(zip_path, extract_dir)
            zip_path.unlink()

        log_success(f"Downloaded {len(platforms)} artifact(s)")

    def execute(self, context: Context) -> None:
        ctx = context
        log_info(f"\n🚀 BrowserOS Server OTA v{self.version} ({self.channel})")
        log_info("=" * 70)

        family_name = COMPONENT_RESOURCE_FAMILY[self.bundle.id]
        source_pin = verify_prepared_resource_pin(
            family_name,
            self.version,
            self.release_sha,
        )
        if not self.release_sha:
            release_shas = {
                item.release_sha for item in source_pin.objects if item.release_sha
            }
            if release_shas:
                self.release_sha = release_shas.pop()
            else:
                log_warning(
                    f"{family_name} {self.version} has no source binding; "
                    "continuing with digest-pinned assets"
                )
        if self._reuse_live_release(ctx):
            return

        with (
            tempfile.TemporaryDirectory(prefix="ota_artifacts_") as dl,
            tempfile.TemporaryDirectory(prefix="ota_staging_") as st,
        ):
            binaries_dir = Path(dl)
            temp_dir = Path(st)
            log_info(f"Temp directory: {temp_dir}")

            self._download_artifacts(binaries_dir, source_pin)
            signed_artifacts = self._build_platform_artifacts(
                ctx, binaries_dir, temp_dir
            )
            self._finalize_release(ctx, signed_artifacts)

    def _reuse_live_release(self, ctx: Context) -> bool:
        """Stage an already-live same-version release without replacing payloads."""
        spec = server_feed(self.bundle.id, self.channel)
        live = FeedPublisher(env=ctx.env).fetch_live(spec.key)
        if live is None:
            return False
        existing = parse_server_appcast_content(live)
        if existing is None or existing.version != self.version:
            return False

        requested = {platform["name"] for platform in self._get_platforms()}
        missing = sorted(requested.difference(existing.artifacts))
        if missing:
            raise RuntimeError(
                f"Live {spec.key} is missing same-version payloads: "
                f"{', '.join(missing)}"
            )

        appcast_path = get_appcast_path(self.channel, self.bundle.id)
        appcast_path.parent.mkdir(parents=True, exist_ok=True)
        appcast_path.write_text(live)
        artifacts = [existing.artifacts[name] for name in sorted(requested)]
        ctx.artifact_registry.add("server_ota_artifacts", artifacts)
        ctx.artifact_registry.add("server_appcast", appcast_path)
        log_success(
            f"Reused live server OTA v{self.version} without replacing payloads"
        )
        return True

    def _build_platform_artifacts(
        self, ctx: Context, binaries_dir: Path, temp_dir: Path
    ) -> List[SignedArtifact]:
        """Sign, archive, and Sparkle-sign each selected platform."""
        signed_artifacts: List[SignedArtifact] = []

        for platform in self._get_platforms():
            log_info(f"\n📦 Processing {platform['name']}...")

            source_resources = find_server_resources_dir(binaries_dir, platform)
            if not source_resources:
                raise RuntimeError(f"Resources dir not found for {platform['name']}")

            staging_resources = temp_dir / platform["name"] / "resources"
            shutil.copytree(source_resources, staging_resources)

            if self.product_id == "browserclaw" and platform["os"] == "macos":
                validate_mcp_instance_policy(staging_resources / "bin/reBrowser-server")

            if not self._sign_bundle(staging_resources, platform, ctx):
                raise RuntimeError(f"Signing failed for {platform['name']}")

            zip_name = self.zip_filename(platform["name"])
            zip_path = temp_dir / zip_name

            if not create_server_bundle_zip(staging_resources, zip_path):
                raise RuntimeError(f"Failed to create bundle for {platform['name']}")

            if platform["os"] == "macos" and IS_MACOS():
                if not notarize_macos_zip(zip_path, ctx.env):
                    raise RuntimeError(f"Notarization failed for {platform['name']}")

            log_info(f"Signing {zip_name} with Sparkle...")
            signature, length = sparkle_sign_file(zip_path, ctx.env)
            if not signature:
                raise RuntimeError(f"Sparkle signing failed for {platform['name']}")

            log_success(f"  {platform['name']}: {length} bytes")
            signed_artifacts.append(
                SignedArtifact(
                    platform=platform["name"],
                    zip_path=zip_path,
                    signature=signature,
                    length=length,
                    os=platform["os"],
                    arch=platform["arch"],
                )
            )

        if not signed_artifacts:
            raise RuntimeError("OTA failed - no artifacts processed")
        return signed_artifacts

    def _finalize_release(
        self, ctx: Context, signed_artifacts: List[SignedArtifact]
    ) -> None:
        """Write the appcast, upload every signed zip, and surface URLs."""
        log_info("\n📤 Uploading signed payloads to GitHub Releases...")
        canonical_artifacts = [
            self._upload_bound_payload(artifact) for artifact in signed_artifacts
        ]

        log_info("\n📝 Generating appcast...")
        spec = server_feed(self.bundle.id, self.channel)
        appcast_path = get_appcast_path(self.channel, self.bundle.id)
        existing_appcast = merge_base_appcast(
            FeedPublisher(env=ctx.env), spec, appcast_path
        )

        appcast_content = render_server_appcast(
            spec,
            self.version,
            canonical_artifacts,
            existing=existing_appcast,
        )
        appcast_path.parent.mkdir(parents=True, exist_ok=True)
        appcast_path.write_text(appcast_content)
        log_success(f"Appcast saved to: {appcast_path}")

        ctx.artifact_registry.add("server_ota_artifacts", canonical_artifacts)
        ctx.artifact_registry.add("server_appcast", appcast_path)

        log_info("\n" + "=" * 70)
        log_success(f"✅ Server OTA v{self.version} ({self.channel}) artifacts ready!")
        log_info("=" * 70)

        log_info("\nArtifact URLs:")
        for artifact in canonical_artifacts:
            log_info(
                f"  {server_asset_url(self.version, artifact.zip_path.name)}"
            )

        log_info(f"\nAppcast saved to: {appcast_path}")
        log_info(
            "\n📋 Next step: Run 'browseros ota server release-appcast "
            f"--channel {self.channel} --publish' to make the release live"
        )

    def _payload_binding(self, artifact: SignedArtifact, sha256: str) -> dict:
        binding = {
            "binding-schema": _PAYLOAD_BINDING_SCHEMA,
            "bundle-id": self.bundle.id,
            "version": self.version,
            "platform": artifact.platform,
            "os": artifact.os,
            "arch": artifact.arch,
            "sha256": sha256,
            "sparkle-signature": artifact.signature,
            "length": artifact.length,
        }
        if self.release_sha:
            binding["release-sha"] = self.release_sha
        return binding

    def _verify_bound_payload(
        self,
        tag: str,
        repo: str,
        sidecar: str,
        binding: dict,
    ) -> None:
        with tempfile.TemporaryDirectory(prefix="ota_binding_") as temp_dir:
            path = download_release_asset(
                tag, repo, sidecar, Path(temp_dir) / sidecar
            )
            try:
                document = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(
                    f"Canonical server payload binding is unreadable: {sidecar}"
                ) from error
        if not isinstance(document, dict):
            raise RuntimeError(
                f"Canonical server payload binding is invalid: {sidecar}"
            )
        mismatches = {
            name: {"expected": value, "actual": document.get(name)}
            for name, value in binding.items()
            if document.get(name) != value
        }
        if mismatches:
            raise RuntimeError(
                f"Canonical server payload binding mismatch for {sidecar}: "
                f"{mismatches}"
            )

    def _upload_bound_payload(self, artifact: SignedArtifact) -> SignedArtifact:
        """Create one immutable signed payload or reuse its canonical asset."""
        data = artifact.zip_path.read_bytes()
        name = artifact.zip_path.name
        if artifact.length != len(data):
            raise RuntimeError(f"Signed payload length mismatch: {name}")
        sha256 = hashlib.sha256(data).hexdigest()
        binding = self._payload_binding(artifact, sha256)
        tag = server_tag(self.version)
        repo = github_repo()
        sidecar = f"{name}.json"

        try:
            existing = release_assets(tag, repo)
        except ReleaseAssetError:
            existing = {}

        if name in existing:
            digest = existing[name]["sha256"]
            if digest and digest != sha256:
                raise RuntimeError(
                    f"Canonical server payload conflicts with its digest: {name}"
                )
            self._verify_bound_payload(tag, repo, sidecar, binding)
            log_success(f"Reused source-bound server payload: {tag}/{name}")
            return artifact

        upload_immutable_asset(
            tag,
            repo,
            artifact.zip_path,
            expected_sha256=sha256,
            title=f"Server OTA v{self.version}",
        )
        upload_json_asset(
            tag,
            repo,
            sidecar,
            binding,
            title=f"Server OTA v{self.version}",
        )
        log_success(f"Uploaded source-bound server payload: {tag}/{name}")
        return artifact

    def _sign_bundle(
        self, staging_resources: Path, platform: dict, ctx: Context
    ) -> bool:
        """Codesign every binary in the staged resources tree."""
        os_type = platform["os"]

        if os_type == "macos":
            if not IS_MACOS():
                log_warning(
                    f"macOS signing requires macOS - leaving {platform['name']} unsigned"
                )
                return True
            return sign_server_bundle_macos(
                staging_resources, ctx.env, ctx.get_entitlements_dir()
            )

        if os_type == "windows":
            return sign_server_bundle_windows(staging_resources, ctx.env, self.bundle)

        log_info("No code signing for Linux binaries")
        return True
