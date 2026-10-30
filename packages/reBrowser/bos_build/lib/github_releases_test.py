#!/usr/bin/env python3
"""Tests for GitHub Releases URL and tag helpers."""

import os
import unittest
from unittest import mock

from . import github_releases
from .github_releases import (
    alias_asset_url,
    extension_asset_url,
    feed_asset_url,
    feed_tag,
    release_asset_url,
    release_tag,
    server_asset_url,
)


class ReleaseTagTest(unittest.TestCase):
    def test_default_product_uses_v_prefixed_tag(self):
        self.assertEqual(release_tag("0.50.5", "browseros"), "v0.50.5")

    def test_four_part_zero_patch_is_normalized(self):
        self.assertEqual(release_tag("0.50.5.0", "browseros"), "v0.50.5")

    def test_other_products_are_namespaced(self):
        self.assertEqual(release_tag("0.50.5", "browserclaw"), "browserclaw/v0.50.5")


class ReleaseAssetUrlTest(unittest.TestCase):
    def test_encodes_slash_in_tag(self):
        self.assertEqual(
            release_asset_url("browserclaw/v1.2.3", "a.dmg", "o/r"),
            "https://github.com/o/r/releases/download/browserclaw%2Fv1.2.3/a.dmg",
        )

    def test_encodes_asset_names(self):
        self.assertEqual(
            release_asset_url("v1.2.3", "my file.dmg", "o/r"),
            "https://github.com/o/r/releases/download/v1.2.3/my%20file.dmg",
        )


class FeedAndAliasTest(unittest.TestCase):
    def test_feed_tags_are_per_product_and_channel(self):
        self.assertEqual(feed_tag("macos", "browseros"), "feed-browseros")
        self.assertEqual(feed_tag("win", "browserclaw"), "feed-win-browserclaw")
        self.assertEqual(feed_tag("server", "browseros"), "feed-server-browseros")
        self.assertEqual(feed_tag("extensions", "browseros"), "feed-extensions")

    def test_unknown_feed_kind_raises(self):
        with self.assertRaisesRegex(ValueError, "Unknown feed kind"):
            feed_tag("linux", "browseros")

    def test_feed_and_alias_urls_are_public_github_assets(self):
        self.assertEqual(
            feed_asset_url("macos", "browseros", "appcast.xml", "o/r"),
            "https://github.com/o/r/releases/download/feed-browseros/appcast.xml",
        )
        self.assertEqual(
            alias_asset_url("browseros", "reBrowser.dmg", "o/r"),
            "https://github.com/o/r/releases/download/latest-browseros/reBrowser.dmg",
        )

    def test_versioned_component_urls(self):
        self.assertEqual(
            extension_asset_url("0.1.7.0", "agent-0.1.7.0.crx", "o/r"),
            "https://github.com/o/r/releases/download/"
            "extensions%2Fv0.1.7.0/agent-0.1.7.0.crx",
        )
        self.assertEqual(
            server_asset_url("0.0.37", "browseros_server_0.0.37_x64.zip", "o/r"),
            "https://github.com/o/r/releases/download/"
            "server%2Fv0.0.37/browseros_server_0.0.37_x64.zip",
        )


class RepoResolutionTest(unittest.TestCase):
    def test_prefers_actions_repository_env(self):
        with mock.patch.dict(
            os.environ, {"GITHUB_REPOSITORY": "BlueOriginAI/reBrowser"}, clear=False
        ):
            self.assertEqual(github_releases.github_repo(), "BlueOriginAI/reBrowser")

    def test_rejects_malformed_env_repo(self):
        with (
            mock.patch.dict(
                os.environ, {"GITHUB_REPOSITORY": "not a repo"}, clear=False
            ),
            mock.patch.object(
                github_releases.subprocess,
                "run",
                side_effect=FileNotFoundError("git"),
            ),
        ):
            self.assertEqual(
                github_releases.github_repo(), github_releases.DEFAULT_REPO
            )


if __name__ == "__main__":
    unittest.main()
