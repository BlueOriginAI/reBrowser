#!/usr/bin/env python3
"""Tests for resolving component resource manifests from GitHub Releases."""

import unittest

from bos_build.release.resource_pins import (
    RESOURCE_FAMILIES,
    resolve_resource_pins,
    verify_prepared_resource_pin,
)


SOURCE_SHA = "a" * 40
OTHER_SHA = "b" * 40


def manifest(family, version="0.0.9", release_sha=SOURCE_SHA, targets=None):
    entries = {}
    for target in family.targets:
        entries[target] = {
            "filename": family.filename(target),
            "sha256": "1" * 64,
            "size": 100,
        }
    entries.update(targets or {})
    return {
        "schema": "browseros-component-manifest-v1",
        "component": family.component,
        "version": version,
        "release_tag": family.tag(version),
        "release_sha": release_sha,
        "targets": entries,
    }


class ResourcePinsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.families = {family.name: family for family in RESOURCE_FAMILIES}

    def _fetcher(self, documents, calls=None):
        def fetch(component, version, repo):
            if calls is not None:
                calls.append((component, version, repo))
            return documents.get((component, version))

        return fetch

    def test_resolves_every_live_family_manifest(self) -> None:
        documents = {
            (family.component, None): manifest(family) for family in RESOURCE_FAMILIES
        }
        calls = []

        pins = resolve_resource_pins(
            {},
            repo="owner/repo",
            fetch=self._fetcher(documents, calls),
            attempts=1,
        )

        self.assertEqual(set(pins), set(self.families))
        for family in RESOURCE_FAMILIES:
            pin = pins[family.name]
            self.assertEqual(pin.version, "0.0.9")
            self.assertEqual(
                {item.target for item in pin.objects}, set(family.targets)
            )
            for item in pin.objects:
                self.assertEqual(item.filename, family.filename(item.target))
                self.assertEqual(item.sha256, "1" * 64)
                self.assertEqual(item.release_sha, SOURCE_SHA)
        self.assertEqual(
            calls,
            [(family.component, None, "owner/repo") for family in RESOURCE_FAMILIES],
        )

    def test_prepared_family_uses_its_exact_version_and_source(self) -> None:
        documents = {
            (family.component, None): manifest(family) for family in RESOURCE_FAMILIES
        }
        server = self.families["browseros_server"]
        documents[(server.component, "0.0.10")] = manifest(
            server, version="0.0.10", release_sha=OTHER_SHA
        )

        pins = resolve_resource_pins(
            {"browseros_server": ("0.0.10", OTHER_SHA)},
            fetch=self._fetcher(documents),
            attempts=1,
        )

        self.assertEqual(pins["browseros_server"].version, "0.0.10")
        self.assertTrue(
            all(
                item.release_sha == OTHER_SHA
                for item in pins["browseros_server"].objects
            )
        )

    def test_prepared_source_mismatch_fails_closed(self) -> None:
        server = self.families["browseros_server"]
        documents = {(server.component, "0.0.10"): manifest(server, "0.0.10")}

        with self.assertRaises(RuntimeError):
            resolve_resource_pins(
                {"browseros_server": ("0.0.10", OTHER_SHA)},
                fetch=self._fetcher(documents),
                attempts=1,
            )

    def test_missing_manifest_fails_after_retries(self) -> None:
        attempts = []

        def fetch(component, version, repo):
            attempts.append(component)
            return None

        with self.assertRaises(RuntimeError):
            resolve_resource_pins({}, fetch=fetch, attempts=2, sleep=lambda _: None)
        self.assertEqual(attempts, ["server", "server"])

    def test_target_skew_is_rejected(self) -> None:
        documents = {
            (family.component, None): manifest(family) for family in RESOURCE_FAMILIES
        }
        server = self.families["browseros_server"]
        skewed = manifest(server)
        del skewed["targets"]["windows-x64"]
        documents[(server.component, None)] = skewed

        with self.assertRaises(RuntimeError):
            resolve_resource_pins(
                {}, fetch=self._fetcher(documents), attempts=1
            )

    def test_transient_manifest_failure_is_retried(self) -> None:
        server = self.families["browseros_server"]
        attempts = {"count": 0}

        def fetch(component, version, repo):
            if component == server.component:
                attempts["count"] += 1
                if attempts["count"] == 1:
                    raise RuntimeError("network")
                return manifest(server)
            family = next(
                item for item in RESOURCE_FAMILIES if item.component == component
            )
            return manifest(family)

        pins = resolve_resource_pins({}, fetch=fetch, attempts=2, sleep=lambda _: None)

        self.assertEqual(attempts["count"], 2)
        self.assertIn("browseros_server", pins)

    def test_verify_prepared_checks_source_binding(self) -> None:
        server = self.families["browseros_server"]
        documents = {(server.component, "0.0.10"): manifest(server, "0.0.10")}

        pin = verify_prepared_resource_pin(
            "browseros_server",
            "0.0.10",
            SOURCE_SHA,
            fetch=self._fetcher(documents),
        )

        self.assertEqual(pin.version, "0.0.10")
        with self.assertRaises(RuntimeError):
            verify_prepared_resource_pin(
                "browseros_server",
                "0.0.10",
                OTHER_SHA,
                fetch=self._fetcher(documents),
            )

    def test_unknown_prepared_family_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            resolve_resource_pins(
                {"nope": ("0.0.1", SOURCE_SHA)}, attempts=1
            )


if __name__ == "__main__":
    unittest.main()
