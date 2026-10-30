#!/usr/bin/env python3
"""Publish a versioned GitHub release and its latest-installer aliases."""

import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..core.context import Context
from ..core.step import Step, ValidationError
from ..lib.github_releases import alias_tag
from ..lib.utils import log_error, log_info, log_success, log_warning
from .common import (
    PLATFORMS,
    PLATFORM_DISPLAY_NAMES,
    fetch_all_release_metadata,
    get_download_path_mapping,
    get_repo_from_git,
    validate_release_metadata,
)
from .github import (
    check_gh_cli,
    download_release_asset,
    edit_github_release,
    ensure_published_release,
    github_release_tag,
    inspect_github_release,
    upload_to_github_release,
)


def publish_release(tag: str, repo: str) -> None:
    """Flip a draft product release to published."""
    release = inspect_github_release(tag, repo)
    if release.get("isDraft") is True:
        edit_github_release(tag, repo, draft=False, latest=False)
        log_success(f"Published release {tag}")


class PublishModule(Step):
    """Publish a versioned release and refresh its latest-installer aliases."""

    produces = []
    requires = []
    description = "Publish a GitHub release and refresh latest-installer aliases"

    def __init__(
        self,
        platforms: Optional[List[str]] = None,
        macos_arch: str = "universal",
        source_sha: str = "",
        workflow_run_id: str = "",
        workflow_run_attempt: str = "",
        artifacts_dir: Optional[Path] = None,
    ):
        self.selected_platforms = platforms or PLATFORMS
        self.allow_missing_platforms = platforms is None
        self.macos_arch = macos_arch
        self.source_sha = source_sha
        self.workflow_run_id = workflow_run_id
        self.workflow_run_attempt = workflow_run_attempt
        self.artifacts_dir = artifacts_dir

    def validate(self, context: Context) -> None:
        if not context.release_version:
            raise ValidationError("--version is required")
        invalid = sorted(set(self.selected_platforms) - set(PLATFORMS))
        if invalid:
            raise ValidationError(
                f"Unknown platform(s): {', '.join(invalid)}. "
                f"Valid: {', '.join(PLATFORMS)}"
            )
        if not check_gh_cli():
            raise ValidationError(
                "gh CLI not found. Install from: https://cli.github.com"
            )
        if not context.github_repo:
            context.github_repo = get_repo_from_git()
        if not context.github_repo:
            raise ValidationError("GitHub repo is required (--repo owner/name)")

    def execute(self, context: Context) -> None:
        version = context.release_version
        repo = context.github_repo or ""

        metadata = fetch_all_release_metadata(
            version,
            context.env,
            context.product.id,
            artifacts_dir=self.artifacts_dir,
            repo=repo,
        )
        if not metadata:
            raise RuntimeError(f"No release metadata found for version {version}")
        missing_platforms = [
            platform for platform in self.selected_platforms if platform not in metadata
        ]
        if missing_platforms and not self.allow_missing_platforms:
            raise RuntimeError(
                "Missing release metadata for requested platform(s): "
                f"{', '.join(missing_platforms)}"
            )
        if missing_platforms:
            log_warning(
                "Skipping platforms with no release metadata: "
                f"{', '.join(missing_platforms)}"
            )
        loaded_platforms = [
            platform for platform in self.selected_platforms if platform in metadata
        ]
        if any(
            (
                self.source_sha,
                self.workflow_run_id,
                self.workflow_run_attempt,
            )
        ):
            validated: Dict[str, dict] = {}
            for platform in loaded_platforms:
                selection = "windows" if platform == "win" else platform
                validated.update(
                    validate_release_metadata(
                        metadata,
                        version=version,
                        product_id=context.product.id,
                        platforms=selection,
                        macos_arch=self.macos_arch,
                        source_sha=self.source_sha,
                        workflow_run_id=self.workflow_run_id,
                        workflow_run_attempt=self.workflow_run_attempt,
                    )
                )
            metadata = validated

        candidates: Dict[str, List[Tuple[str, str]]] = {}
        for platform in loaded_platforms:
            artifacts = metadata[platform].get("artifacts", {})
            platform_mapping = get_download_path_mapping(context.product).get(
                platform, {}
            )
            platform_candidates: List[Tuple[str, str]] = []
            for artifact_key, artifact in artifacts.items():
                alias_path = platform_mapping.get(artifact_key)
                if alias_path is None:
                    continue
                platform_candidates.append(
                    (artifact["filename"], Path(alias_path).name)
                )
            if not platform_candidates:
                raise RuntimeError(
                    f"No promotable artifacts found for requested platform {platform}"
                )
            candidates[platform] = platform_candidates

        tag = github_release_tag(version, context.product.id)
        log_info(f"\n{'=' * 60}")
        log_info(f"Publishing {context.product.display_name} v{version}")
        log_info(f"{'=' * 60}")

        # A feed or alias must never point at a draft asset, so publish first.
        publish_release(tag, repo)

        alias = alias_tag(context.product.id)
        ensure_published_release(
            alias, repo, f"{context.product.display_name} latest installers"
        )

        results: List[Tuple[str, str, bool]] = []
        with tempfile.TemporaryDirectory(prefix="rebrowser-aliases-") as temporary:
            staging = Path(temporary)
            for platform, platform_candidates in candidates.items():
                log_info(f"\n{PLATFORM_DISPLAY_NAMES[platform]}:")
                for filename, alias_name in platform_candidates:
                    local = (
                        self.artifacts_dir / filename
                        if self.artifacts_dir is not None
                        else None
                    )
                    if local is None or not local.is_file():
                        local = download_release_asset(tag, repo, filename, staging)
                    if local is None:
                        log_error(f"  Missing {filename}")
                        results.append((filename, alias_name, False))
                        continue

                    target = staging / alias_name
                    if local != target:
                        target.write_bytes(local.read_bytes())
                    log_info(f"  {filename} → {alias}/{alias_name}")
                    ok = upload_to_github_release(alias, repo, target, clobber=True)
                    results.append((filename, alias_name, ok))
                    if ok:
                        log_success(f"    ✓ {alias_name}")

        log_info(f"\n{'=' * 60}")
        succeeded = sum(1 for _, _, ok in results if ok)
        failed = sum(1 for _, _, ok in results if not ok)
        if not results:
            raise RuntimeError("No promotable artifacts found in release metadata")
        if failed:
            for filename, alias_name, ok in results:
                if not ok:
                    log_error(f"  Failed: {filename} → {alias_name}")
            raise RuntimeError(
                f"Failed to publish {failed}/{succeeded + failed} artifact(s)"
            )
        log_success(f"Published {succeeded} alias asset(s) to {alias}")
