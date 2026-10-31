#!/usr/bin/env python3
"""Tests for immutable and idempotent server OTA payload generation."""

import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest import mock

from ...core.context import Context
from ..feeds.render import ExistingAppcast, SignedArtifact, render_server_appcast
from ..feeds.spec import server_feed
from ..github_store import ReleaseAssetError
from ..resource_pins import ResourceObjectPin, ResourcePin
from . import server as ota_server
from .common import SERVER_PLATFORMS
from .server import ServerOTAModule


SOURCE_SHA = "a" * 40
OTHER_SHA = "b" * 40


def _complete_appcast(version: str = "0.0.9") -> str:
    artifacts = [
        SignedArtifact(
            platform=platform["name"],
            zip_path=Path(f"{platform['name']}.zip"),
            signature=f"signature-{platform['name']}",
            length=100,
            os=platform["os"],
            arch=platform["arch"],
        )
        for platform in SERVER_PLATFORMS
    ]
    return render_server_appcast(
        server_feed("browseros-server", "alpha"),
        version,
        artifacts,
        ExistingAppcast(
            version=version,
            pub_date="Wed, 05 Aug 2026 12:00:00 +0000",
            artifacts={},
        ),
    )


class LiveReleaseReuseTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.output = Path(self._tmp.name) / "appcast-server.alpha.xml"
        self.registry = SimpleNamespace(add=mock.Mock())
        self.ctx = cast(
            Context,
            SimpleNamespace(
                env=SimpleNamespace(),
                artifact_registry=self.registry,
            ),
        )

    def test_stages_same_version_live_feed_without_rebuilding_payloads(self):
        live = _complete_appcast()
        module = ServerOTAModule(
            version="0.0.9",
            channel="alpha",
            platform_filter="darwin_arm64",
            release_sha=SOURCE_SHA,
        )
        publisher = SimpleNamespace(fetch_live=lambda _: live)

        with (
            mock.patch.object(ota_server, "FeedPublisher", return_value=publisher),
            mock.patch.object(ota_server, "get_appcast_path", return_value=self.output),
        ):
            reused = module._reuse_live_release(self.ctx)

        self.assertTrue(reused)
        self.assertEqual(self.output.read_text(), live)
        payloads = self.registry.add.call_args_list[0].args[1]
        self.assertEqual([item.platform for item in payloads], ["darwin_arm64"])

    def test_refuses_to_replace_incomplete_same_version_live_payloads(self):
        live = render_server_appcast(
            server_feed("browseros-server", "alpha"),
            "0.0.9",
            [],
            ExistingAppcast(
                version="0.0.9",
                pub_date="Wed, 05 Aug 2026 12:00:00 +0000",
                artifacts={},
            ),
        )
        module = ServerOTAModule(
            version="0.0.9",
            platform_filter="darwin_arm64",
            release_sha=SOURCE_SHA,
        )
        publisher = SimpleNamespace(fetch_live=lambda _: live)

        with mock.patch.object(ota_server, "FeedPublisher", return_value=publisher):
            with self.assertRaisesRegex(RuntimeError, "missing same-version"):
                module._reuse_live_release(self.ctx)

    def test_execute_verifies_source_binding_before_live_reuse(self):
        module = ServerOTAModule(
            version="0.0.9",
            platform_filter="linux_x64",
            release_sha=SOURCE_SHA,
        )
        pin = ResourcePin("browseros_server", "0.0.9", ())

        with (
            mock.patch.object(
                ota_server,
                "verify_prepared_resource_pin",
                return_value=pin,
            ) as verify,
            mock.patch.object(
                module, "_reuse_live_release", return_value=True
            ) as reuse,
            mock.patch.object(module, "_download_artifacts") as download,
        ):
            module.execute(self.ctx)

        verify.assert_called_once_with("browseros_server", "0.0.9", SOURCE_SHA)
        reuse.assert_called_once_with(self.ctx)
        download.assert_not_called()


class ImmutableSourceDownloadTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.archive = self.root / "source.zip"
        server = b"server"
        metadata = {
            "files": [
                {
                    "path": "resources/bin/browseros-server",
                    "sha256": hashlib.sha256(server).hexdigest(),
                    "size": len(server),
                }
            ]
        }
        with zipfile.ZipFile(self.archive, "w") as output:
            output.writestr("artifact-metadata.json", json.dumps(metadata))
            output.writestr("resources/bin/browseros-server", server)
        self.data = self.archive.read_bytes()
        self.pin = ResourcePin(
            "browseros_server",
            "0.0.9",
            (
                ResourceObjectPin(
                    target="linux-x64",
                    filename="browseros-server-resources-linux-x64.zip",
                    size=len(self.data),
                    sha256=hashlib.sha256(self.data).hexdigest(),
                    release_sha=SOURCE_SHA,
                ),
            ),
        )
        self.module = ServerOTAModule(
            version="0.0.9",
            platform_filter="linux_x64",
            release_sha=SOURCE_SHA,
        )

    def test_downloads_the_pinned_versioned_asset_and_checks_checksum(self):
        calls = []

        def download(url, destination, **options):
            calls.append((url, options))
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(self.data)

        destination = self.root / "download"
        with mock.patch.object(ota_server, "download_asset", side_effect=download):
            self.module._download_artifacts(destination, self.pin)

        self.assertEqual(
            (destination / "linux-x64/resources/bin/browseros-server").read_bytes(),
            b"server",
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(
            calls[0][0],
            "https://github.com/BlueOriginAI/reBrowser/releases/download/"
            "agent-server%2Fv0.0.9/browseros-server-resources-linux-x64.zip",
        )
        self.assertEqual(calls[0][1]["expected_sha256"], self.pin.objects[0].sha256)
        self.assertEqual(calls[0][1]["expected_size"], len(self.data))

    def test_refuses_download_whose_bytes_do_not_match_the_binding(self):
        bad_pin = ResourcePin(
            self.pin.name,
            self.pin.version,
            (
                ResourceObjectPin(
                    target="linux-x64",
                    filename="browseros-server-resources-linux-x64.zip",
                    size=len(self.data),
                    sha256="0" * 64,
                    release_sha=SOURCE_SHA,
                ),
            ),
        )

        with mock.patch.object(
            ota_server,
            "download_asset",
            side_effect=RuntimeError("Downloaded checksum mismatch"),
        ):
            with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                self.module._download_artifacts(self.root / "bad", bad_pin)


def _write_sidecar(document: dict):
    def write(tag, repo, name, destination):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(document))
        return destination

    return write


class BoundPayloadUploadTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.path = self.root / "browseros_server_0.0.9_linux_x64.zip"
        self.path.write_bytes(b"signed-payload")
        self.artifact = SignedArtifact(
            platform="linux_x64",
            zip_path=self.path,
            signature="local-signature",
            length=self.path.stat().st_size,
            os="linux",
            arch="x86_64",
        )
        self.module = ServerOTAModule(
            version="0.0.9",
            release_sha=SOURCE_SHA,
        )
        self.sha256 = hashlib.sha256(b"signed-payload").hexdigest()
        self.binding = {
            "binding-schema": "browseros-server-ota-v1",
            "bundle-id": "browseros-server",
            "version": "0.0.9",
            "release-sha": SOURCE_SHA,
            "platform": "linux_x64",
            "os": "linux",
            "arch": "x86_64",
            "sha256": self.sha256,
            "sparkle-signature": "local-signature",
            "length": len(b"signed-payload"),
        }

    def test_creates_payload_and_binding_assets(self):
        uploaded = []

        def upload(tag, repo, path, **options):
            uploaded.append((tag, path.name, options))
            return "uploaded"

        def upload_json(tag, repo, name, document, **options):
            uploaded.append((tag, name, document))
            return "uploaded"

        with (
            mock.patch.object(
                ota_server,
                "release_assets",
                side_effect=ReleaseAssetError("missing"),
            ),
            mock.patch.object(
                ota_server, "upload_immutable_asset", side_effect=upload
            ),
            mock.patch.object(
                ota_server, "upload_json_asset", side_effect=upload_json
            ),
        ):
            result = self.module._upload_bound_payload(self.artifact)

        self.assertEqual(result, self.artifact)
        self.assertEqual(uploaded[0][0], "server/v0.0.9")
        self.assertEqual(uploaded[0][1], self.path.name)
        self.assertEqual(uploaded[0][2]["expected_sha256"], self.sha256)
        self.assertEqual(uploaded[1][1], f"{self.path.name}.json")
        self.assertEqual(uploaded[1][2], self.binding)

    def test_reuses_a_matching_canonical_payload(self):
        with (
            mock.patch.object(
                ota_server,
                "release_assets",
                return_value={self.path.name: {"size": 1, "sha256": self.sha256}},
            ),
            mock.patch.object(ota_server, "upload_immutable_asset") as upload,
            mock.patch.object(ota_server, "upload_json_asset") as upload_json,
            mock.patch.object(
                ota_server, "download_release_asset"
            ) as download,
        ):
            def write_sidecar(tag, repo, name, destination):
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(json.dumps(self.binding))
                return destination

            download.side_effect = write_sidecar
            result = self.module._upload_bound_payload(self.artifact)

        self.assertEqual(result, self.artifact)
        upload.assert_not_called()
        upload_json.assert_not_called()

    def test_rejects_a_colliding_payload_with_another_binding(self):
        sidecar = dict(self.binding)
        sidecar["release-sha"] = OTHER_SHA
        with (
            mock.patch.object(
                ota_server,
                "release_assets",
                return_value={self.path.name: {"size": 1, "sha256": self.sha256}},
            ),
            mock.patch.object(
                ota_server,
                "download_release_asset",
                side_effect=_write_sidecar(sidecar),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "binding mismatch"):
                self.module._upload_bound_payload(self.artifact)

    def test_rejects_a_colliding_payload_with_another_digest(self):
        with mock.patch.object(
            ota_server,
            "release_assets",
            return_value={self.path.name: {"size": 1, "sha256": "0" * 64}},
        ):
            with self.assertRaisesRegex(RuntimeError, "conflicts"):
                self.module._upload_bound_payload(self.artifact)

    def test_appcast_uses_the_canonical_payload_after_collision(self):
        canonical = SignedArtifact(
            platform="linux_x64",
            zip_path=Path(self.path.name),
            signature="canonical-signature",
            length=999,
            os="linux",
            arch="x86_64",
        )
        output = self.root / "appcast-server.alpha.xml"
        publisher = SimpleNamespace(fetch_live=lambda _: None)
        ctx = cast(
            Context,
            SimpleNamespace(
                env=SimpleNamespace(),
                artifact_registry=SimpleNamespace(add=mock.Mock()),
            ),
        )

        with (
            mock.patch.object(
                self.module,
                "_upload_bound_payload",
                return_value=canonical,
            ),
            mock.patch.object(ota_server, "FeedPublisher", return_value=publisher),
            mock.patch.object(ota_server, "get_appcast_path", return_value=output),
        ):
            self.module._finalize_release(ctx, [self.artifact])

        content = output.read_text()
        self.assertIn('sparkle:edSignature="canonical-signature"', content)
        self.assertIn('length="999"', content)
        self.assertNotIn("local-signature", content)


if __name__ == "__main__":
    unittest.main()
