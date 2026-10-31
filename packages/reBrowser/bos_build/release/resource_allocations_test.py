#!/usr/bin/env python3
"""Tests for immutable component allocation probes on GitHub Releases."""

import unittest

from bos_build.release.resource_allocations import discover_component_allocation


SOURCE_SHA = "1" * 40
OTHER_SHA = "2" * 40
SHA256 = "a" * 64


def manifest(component: str, version: str, release_sha: str) -> dict:
    return {
        "schema": "browseros-component-manifest-v1",
        "component": component,
        "version": version,
        "release_tag": f"tag/{version}",
        "release_sha": release_sha,
        "targets": {
            "universal": {
                "filename": "archive.zip",
                "sha256": SHA256,
                "size": 1,
            }
        },
    }


class ComponentAllocationDiscoveryTest(unittest.TestCase):
    def test_absent_manifest_returns_none_for_every_component(self) -> None:
        for component, version in (
            ("server", "0.0.130"),
            ("claw-server-rust", "0.0.30"),
            ("claw-onboard", "0.0.20"),
            ("agent", "0.0.42.0"),
            ("browserclaw", "0.0.9.0"),
        ):
            with self.subTest(component=component):
                allocation = discover_component_allocation(
                    component,
                    version,
                    SOURCE_SHA,
                    repo="owner/repo",
                    fetch_manifest=lambda *args: None,
                    fetch_url=lambda url: None,
                )
                self.assertIsNone(allocation)

    def test_resource_manifest_bound_to_the_source_is_reusable(self) -> None:
        calls = []

        def fetch(component, version, repo):
            calls.append((component, version, repo))
            return manifest(component, version or "", SOURCE_SHA)

        allocation = discover_component_allocation(
            "server",
            "0.0.130",
            SOURCE_SHA,
            repo="owner/repo",
            fetch_manifest=fetch,
            fetch_url=lambda url: None,
        )

        self.assertIsNotNone(allocation)
        assert allocation is not None
        self.assertEqual(allocation.kind, "resource")
        self.assertTrue(allocation.reusable)
        self.assertEqual(allocation.reference, "agent-server/v0.0.130")
        self.assertEqual(calls, [("server", "0.0.130", "owner/repo")])

    def test_resource_manifest_with_another_source_blocks_the_version(self) -> None:
        allocation = discover_component_allocation(
            "server",
            "0.0.130",
            SOURCE_SHA,
            repo="owner/repo",
            fetch_manifest=lambda component, version, repo: manifest(
                component, version or "", OTHER_SHA
            ),
            fetch_url=lambda url: None,
        )

        self.assertIsNotNone(allocation)
        assert allocation is not None
        self.assertFalse(allocation.reusable)
        self.assertEqual(allocation.source_sha, "")
        self.assertEqual(
            allocation.reference, "release://owner/repo/agent-server/v0.0.130"
        )

    def test_extension_sidecar_binds_the_source(self) -> None:
        urls = []

        def fetch_url(url):
            urls.append(url)
            return {
                "binding-schema": "browseros-extension-crx-v1",
                "extension": "agent",
                "version": "0.0.42.0",
                "source-sha": SOURCE_SHA,
                "sha256": SHA256,
            }

        allocation = discover_component_allocation(
            "agent",
            "0.0.42.0",
            SOURCE_SHA,
            repo="owner/repo",
            fetch_manifest=lambda *args: None,
            fetch_url=fetch_url,
        )

        self.assertIsNotNone(allocation)
        assert allocation is not None
        self.assertTrue(allocation.reusable)
        self.assertEqual(allocation.reference, "extensions/v0.0.42.0")
        self.assertEqual(
            urls,
            [
                "https://github.com/owner/repo/releases/download/"
                "extensions%2Fv0.0.42.0/agent-0.0.42.0.crx.json"
            ],
        )

    def test_extension_binding_mismatch_fails_closed(self) -> None:
        with self.assertRaises(RuntimeError):
            discover_component_allocation(
                "agent",
                "0.0.42.0",
                SOURCE_SHA,
                repo="owner/repo",
                fetch_manifest=lambda *args: None,
                fetch_url=lambda url: {
                    "binding-schema": "browseros-extension-crx-v1",
                    "extension": "browserclaw",
                    "version": "0.0.42.0",
                    "source-sha": SOURCE_SHA,
                },
            )

    def test_unknown_component_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            discover_component_allocation(
                "controller",
                "1.0.0.0",
                SOURCE_SHA,
                fetch_manifest=lambda *args: None,
                fetch_url=lambda url: None,
            )


if __name__ == "__main__":
    unittest.main()
