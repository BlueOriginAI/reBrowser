#!/usr/bin/env python3
"""Immutable suite browser artifact publication tests."""

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from bos_build.release.github_store import ReleaseAssetError
from bos_build.release.suite_artifact import (
    GitHubImmutableObjectBackend,
    publish_suite_browser_artifact,
)
from bos_build.release.suite_test import suite_record, product_record


class _FakeGitHubStore:
    def __init__(self) -> None:
        self.assets: dict[str, dict[str, bytes]] = {}
        self.sidecars: dict[str, dict[str, dict]] = {}
        self.uploads: list[str] = []

    def release_assets(self, tag, repo):
        if tag not in self.assets:
            raise ReleaseAssetError(f"missing release {tag}")
        return {
            name: {
                "size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
            for name, data in self.assets[tag].items()
        }

    def upload_immutable_asset(
        self, tag, repo, path, *, name=None, expected_sha256="", title=""
    ):
        asset = name or path.name
        data = path.read_bytes()
        bucket = self.assets.setdefault(tag, {})
        if asset in bucket:
            digest = hashlib.sha256(bucket[asset]).hexdigest()
            if expected_sha256 and digest != expected_sha256:
                raise ReleaseAssetError("conflicts")
            return "reused"
        bucket[asset] = data
        self.uploads.append(asset)
        return "uploaded"

    def upload_json_asset(self, tag, repo, name, document, *, title=""):
        self.sidecars.setdefault(tag, {})[name] = document
        self.uploads.append(name)
        return "uploaded"

    def download_release_asset(self, tag, repo, name, destination):
        payload = json.dumps(self.sidecars[tag][name]).encode()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
        return destination


def _write_artifact(root: Path, *, product: str = "browseros") -> None:
    record = suite_record()
    filename = (
        f"BrowserOS_v{record.browser_version}_arm64.dmg"
        if product == "browseros"
        else f"BrowserOS_neo_v{record.browser_version}_arm64.dmg"
    )
    content = f"signed-{product}".encode()
    components = (
        {
            "server": record.component_versions["server"],
            "agent": record.component_versions["agent"],
            "app-onboard": record.component_versions["app-onboard"],
        }
        if product == "browseros"
        else {
            "claw-server-rust": record.component_versions["claw-server-rust"],
            "browserclaw": record.component_versions["browserclaw"],
            "claw-onboard": record.component_versions["claw-onboard"],
        }
    )
    (root / filename).write_bytes(content)
    (root / "release.json").write_text(
        json.dumps(
            {
                "product": product,
                "platform": "macos",
                "version": record.browser_version,
                "source_sha": record.source_sha,
                "reservation_sha": record.reservation_sha,
                "component_versions": components,
                "artifacts": {
                    "arm64": {
                        "filename": filename,
                        "size": len(content),
                        "sha256": hashlib.sha256(content).hexdigest(),
                        "sparkle_signature": "signature",
                        "sparkle_length": len(content),
                    }
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )


class _patched_store:
    def __init__(self, store: _FakeGitHubStore) -> None:
        self.store = store
        self.patches = []

    def __enter__(self):
        module = "bos_build.release.suite_artifact"
        for name in (
            "release_assets",
            "upload_immutable_asset",
            "upload_json_asset",
            "download_release_asset",
        ):
            patcher = patch(
                f"{module}.{name}", getattr(self.store, name)
            )
            self.patches.append(patcher)
            patcher.start()
        return self.store

    def __exit__(self, *exc):
        for patcher in reversed(self.patches):
            patcher.stop()


class SuiteArtifactPublicationTest(unittest.TestCase):
    def test_identical_retry_verifies_objects_without_overwriting(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_artifact(root)
            store = _FakeGitHubStore()
            backend = GitHubImmutableObjectBackend("owner/repo")
            record = replace(suite_record(state="merged"), draft=False)

            with _patched_store(store):
                first = publish_suite_browser_artifact(
                    record, "browseros", root, backend
                )
                second = publish_suite_browser_artifact(
                    record, "browseros", root, backend
                )

        self.assertEqual(first, second)
        self.assertEqual(
            store.uploads,
            [
                "BrowserOS_v0.50.1_arm64.dmg",
                "BrowserOS_v0.50.1_arm64.dmg.json",
                "release.json",
                "release.json.json",
                "BrowserOS_v0.50.1_arm64.dmg.json",
                "release.json.json",
            ],
        )

    def test_conflicting_versioned_bytes_fail_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_artifact(root)
            store = _FakeGitHubStore()
            backend = GitHubImmutableObjectBackend("owner/repo")
            record = replace(suite_record(state="merged"), draft=False)
            with _patched_store(store):
                publication = publish_suite_browser_artifact(
                    record, "browseros", root, backend
                )
                asset = publication.artifact_key.split("/")[-1]
                tag = next(iter(store.assets))
                store.assets[tag][asset] = b"conflicting-public-bytes"

                with self.assertRaisesRegex(RuntimeError, "conflicts"):
                    publish_suite_browser_artifact(
                        record, "browseros", root, backend
                    )

        self.assertEqual(
            store.uploads,
            [asset, f"{asset}.json", "release.json", "release.json.json"],
        )

    def test_receipt_must_match_merged_transaction(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            _write_artifact(root, product="browserclaw")
            record = replace(suite_record(state="merged"), draft=False)
            receipt_path = root / "release.json"
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            receipt["reservation_sha"] = "f" * 40
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "reservation_sha"):
                with _patched_store(_FakeGitHubStore()):
                    publish_suite_browser_artifact(
                        record,
                        "browserclaw",
                        root,
                        GitHubImmutableObjectBackend("owner/repo"),
                    )

    def test_product_transaction_cannot_publish_sibling_artifact(self):
        for product, sibling in (
            ("browseros", "browserclaw"),
            ("browserclaw", "browseros"),
        ):
            with (
                self.subTest(product=product),
                tempfile.TemporaryDirectory() as temp_dir,
            ):
                root = Path(temp_dir)
                _write_artifact(root, product=product)
                record = product_record(product, state="merged")
                store = _FakeGitHubStore()
                backend = GitHubImmutableObjectBackend("owner/repo")
                with _patched_store(store):
                    with self.assertRaisesRegex(ValueError, "Unknown suite product"):
                        publish_suite_browser_artifact(
                            record, sibling, root, backend
                        )
                    self.assertEqual(store.uploads, [])
                    publication = publish_suite_browser_artifact(
                        record, product, root, backend
                    )
                self.assertEqual(publication.product, product)


if __name__ == "__main__":
    unittest.main()
