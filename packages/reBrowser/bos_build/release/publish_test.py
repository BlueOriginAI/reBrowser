#!/usr/bin/env python3
"""Tests for the GitHub-backed release publish helpers."""

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from ..core.products import get_product_descriptor
from .publish import PublishModule, publish_release


def _ctx(product: str = "browserclaw") -> SimpleNamespace:
    return SimpleNamespace(
        release_version="0.49.0",
        env=SimpleNamespace(),
        product=get_product_descriptor(product),
        github_repo="BlueOriginAI/reBrowser",
    )


def _metadata(**artifacts: dict) -> dict:
    return {
        "win": {
            "product": "browserclaw",
            "version": "0.49.0",
            "platform": "win",
            "artifacts": artifacts,
        }
    }


class PublishReleaseTest(unittest.TestCase):
    def test_flips_a_draft_release(self):
        with (
            mock.patch(
                "bos_build.release.publish.inspect_github_release",
                return_value={"isDraft": True},
            ),
            mock.patch(
                "bos_build.release.publish.edit_github_release"
            ) as edit,
        ):
            publish_release("v0.49.0", "BlueOriginAI/reBrowser")

        edit.assert_called_once_with(
            "v0.49.0", "BlueOriginAI/reBrowser", draft=False, latest=False
        )

    def test_leaves_a_published_release_untouched(self):
        with (
            mock.patch(
                "bos_build.release.publish.inspect_github_release",
                return_value={"isDraft": False},
            ),
            mock.patch(
                "bos_build.release.publish.edit_github_release"
            ) as edit,
        ):
            publish_release("v0.49.0", "BlueOriginAI/reBrowser")

        edit.assert_not_called()


class PublishModuleIntegrityTest(unittest.TestCase):
    def test_default_selection_skips_every_missing_platform(self):
        ctx = _ctx()

        with tempfile.TemporaryDirectory() as temporary:
            (Path(temporary) / "reBrowser-agent_v0.49.0_x64_installer.exe").write_bytes(
                b"installer"
            )
            module = PublishModule(artifacts_dir=Path(temporary))
            with (
                mock.patch(
                    "bos_build.release.publish.fetch_all_release_metadata",
                    return_value=_metadata(
                        x64_installer={
                            "filename": "reBrowser-agent_v0.49.0_x64_installer.exe"
                        }
                    ),
                ),
                mock.patch(
                    "bos_build.release.publish.inspect_github_release",
                    return_value={"isDraft": False},
                ),
                mock.patch(
                    "bos_build.release.publish.ensure_published_release"
                ),
                mock.patch(
                    "bos_build.release.publish.upload_to_github_release",
                    return_value=True,
                ) as upload,
                mock.patch("bos_build.release.publish.log_warning") as warning,
            ):
                module.execute(ctx)

        warning.assert_called_once_with(
            "Skipping platforms with no release metadata: macos, linux"
        )
        upload.assert_called_once()
        uploaded_name = upload.call_args.args[2].name
        self.assertEqual(uploaded_name, "reBrowser-agent_installer.exe")

    def test_explicit_missing_platform_raises_before_upload(self):
        module = PublishModule(platforms=["linux"])

        with (
            mock.patch(
                "bos_build.release.publish.fetch_all_release_metadata",
                return_value={"win": {"artifacts": {}}},
            ),
            mock.patch(
                "bos_build.release.publish.upload_to_github_release"
            ) as upload,
            self.assertRaisesRegex(RuntimeError, "requested platform.*linux"),
        ):
            module.execute(_ctx())

        upload.assert_not_called()

    def test_zero_mapped_artifacts_raises(self):
        module = PublishModule(platforms=["win"])

        with (
            mock.patch(
                "bos_build.release.publish.fetch_all_release_metadata",
                return_value=_metadata(unknown={"filename": "unknown.bin"}),
            ),
            self.assertRaisesRegex(RuntimeError, "No promotable artifacts"),
        ):
            module.execute(_ctx())

    def test_each_requested_platform_requires_a_promotable_artifact(self):
        module = PublishModule(platforms=["macos", "win"])
        metadata = {
            "macos": {
                "artifacts": {
                    "universal": {
                        "filename": "reBrowser-agent_v0.49.0_universal.dmg"
                    }
                }
            },
            "win": {"artifacts": {"unknown": {"filename": "unknown.bin"}}},
        }

        with (
            mock.patch(
                "bos_build.release.publish.fetch_all_release_metadata",
                return_value=metadata,
            ),
            self.assertRaisesRegex(RuntimeError, "requested platform win"),
        ):
            module.execute(_ctx())

    def test_aliases_are_uploaded_with_alias_names(self):
        module = PublishModule(platforms=["win"])

        with tempfile.TemporaryDirectory() as temporary:
            built = Path(temporary) / "reBrowser-agent_v0.49.0_x64_installer.exe"
            built.write_bytes(b"installer")
            module.artifacts_dir = Path(temporary)

            with (
                mock.patch(
                    "bos_build.release.publish.fetch_all_release_metadata",
                    return_value=_metadata(
                        x64_installer={
                            "filename": "reBrowser-agent_v0.49.0_x64_installer.exe"
                        }
                    ),
                ),
                mock.patch(
                    "bos_build.release.publish.inspect_github_release",
                    return_value={"isDraft": False},
                ),
                mock.patch(
                    "bos_build.release.publish.ensure_published_release"
                ) as ensure,
                mock.patch(
                    "bos_build.release.publish.upload_to_github_release",
                    return_value=True,
                ) as upload,
            ):
                module.execute(_ctx())

        ensure.assert_called_once()
        self.assertEqual(
            upload.call_args.args[0], "latest-browserclaw"
        )
        self.assertEqual(
            upload.call_args.args[2].name, "reBrowser-agent_installer.exe"
        )
        self.assertTrue(upload.call_args.kwargs["clobber"])

    def test_validate_rejects_unknown_platform(self):
        module = PublishModule(platforms=["windows"])

        with self.assertRaisesRegex(Exception, "Unknown platform"):
            module.validate(_ctx())

    def test_validate_requires_repo(self):
        module = PublishModule(platforms=["win"])
        ctx = _ctx()
        ctx.github_repo = ""

        with (
            mock.patch(
                "bos_build.release.publish.check_gh_cli", return_value=True
            ),
            mock.patch(
                "bos_build.release.publish.get_repo_from_git",
                return_value=None,
            ),
            self.assertRaisesRegex(Exception, "GitHub repo is required"),
        ):
            module.validate(ctx)


if __name__ == "__main__":
    unittest.main()
