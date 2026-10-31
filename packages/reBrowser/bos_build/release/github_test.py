#!/usr/bin/env python3
"""GitHub command adapter tests."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bos_build.lib.github_releases import component_manifest_url, component_resource_tag
from bos_build.release.github import (
    create_pull_request,
    download_release_asset,
    edit_pull_request_body,
    github_release_tag,
    inspect_github_release,
    list_github_releases,
    list_pull_requests,
    mark_pull_request_ready,
    merge_pull_request,
    normalize_version,
)


class RecordingRunner:
    def __init__(self, stdout: str = "") -> None:
        self.stdout = stdout
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, self.stdout, "")


class PullRequestAdapterTest(unittest.TestCase):
    def test_lists_pull_requests_as_json(self) -> None:
        runner = RecordingRunner(
            stdout=json.dumps(
                [
                    {
                        "data": {
                            "repository": {
                                "pullRequests": {
                                    "nodes": [
                                        {
                                            "number": 41,
                                            "headRefName": "unrelated",
                                        },
                                        {
                                            "number": 42,
                                            "headRefName": "bot/release-browseros",
                                        },
                                    ]
                                }
                            }
                        }
                    },
                    {
                        "data": {
                            "repository": {
                                "pullRequests": {
                                    "nodes": [
                                        {
                                            "number": 43,
                                            "headRefName": "bot/release-browseros",
                                        }
                                    ]
                                }
                            }
                        }
                    },
                ]
            )
        )

        records = list_pull_requests(
            "browseros-ai/BrowserOS",
            state="all",
            head="bot/release-browseros",
            runner=runner,
        )

        self.assertEqual([record["number"] for record in records], [42, 43])
        command = runner.calls[0][0]
        self.assertEqual(command[:3], ["gh", "api", "graphql"])
        self.assertIn("--paginate", command)
        self.assertIn("--slurp", command)

    def test_creates_and_edits_pull_request_without_changing_git(self) -> None:
        create_runner = RecordingRunner(
            stdout="https://github.com/browseros-ai/BrowserOS/pull/42\n"
        )
        url = create_pull_request(
            repo="browseros-ai/BrowserOS",
            head="bot/release-browseros",
            base="main",
            title="chore(release): candidate",
            body="candidate body",
            runner=create_runner,
        )
        edit_runner = RecordingRunner()
        edit_pull_request_body(
            repo="browseros-ai/BrowserOS",
            number=42,
            body="updated body",
            runner=edit_runner,
        )

        self.assertTrue(url.endswith("/42"))
        self.assertEqual(create_runner.calls[0][0][:3], ["gh", "pr", "create"])
        self.assertNotIn("--draft", create_runner.calls[0][0])
        self.assertEqual(edit_runner.calls[0][0][:3], ["gh", "pr", "edit"])

    def test_draft_creation_and_ready_transition_are_explicit(self) -> None:
        create_runner = RecordingRunner(
            stdout="https://github.com/browseros-ai/BrowserOS/pull/42\n"
        )
        create_pull_request(
            repo="browseros-ai/BrowserOS",
            head="bot/release-nightly-111111111111",
            base="main",
            title="chore(release): nightly family transaction",
            body="suite body",
            draft=True,
            runner=create_runner,
        )
        ready_runner = RecordingRunner()

        mark_pull_request_ready("browseros-ai/BrowserOS", 42, runner=ready_runner)

        self.assertIn("--draft", create_runner.calls[0][0])
        self.assertEqual(
            ready_runner.calls[0][0],
            [
                "gh",
                "pr",
                "ready",
                "42",
                "--repo",
                "browseros-ai/BrowserOS",
            ],
        )

    def test_merges_pull_request_and_returns_merge_commit(self) -> None:
        runner = RecordingRunner(stdout=json.dumps({"mergeCommit": {"oid": "3" * 40}}))

        sha = merge_pull_request(
            "browseros-ai/BrowserOS",
            42,
            expected_head_sha="2" * 40,
            runner=runner,
        )

        self.assertEqual(sha, "3" * 40)
        command = runner.calls[0][0]
        self.assertEqual(command[:3], ["gh", "pr", "merge"])
        self.assertIn("--squash", command)
        self.assertEqual(command[-2:], ["--match-head-commit", "2" * 40])
        self.assertNotIn("--delete-branch", command)


class ReleaseAdapterTest(unittest.TestCase):
    def test_onboarding_feed_avoids_permanently_reserved_tag(self) -> None:
        self.assertEqual(
            component_manifest_url("app-onboard", repo="owner/repo"),
            "https://github.com/owner/repo/releases/download/"
            "feed-resources-app-onboard-v2/component-manifest.json",
        )
        self.assertEqual(component_resource_tag("server"), "feed-resources-server")

    def test_release_tag_preserves_nonzero_browser_patch(self) -> None:
        self.assertEqual(normalize_version("0.50.0.3"), "0.50.0.3")
        self.assertEqual(
            github_release_tag("0.50.0.3", "browseros"),
            "v0.50.0.3",
        )
        self.assertEqual(
            github_release_tag("0.50.0.3", "browserclaw"),
            "browserclaw/v0.50.0.3",
        )

    def test_release_tag_omits_zero_browser_patch(self) -> None:
        self.assertEqual(normalize_version("0.50.0.0"), "0.50.0")
        self.assertEqual(github_release_tag("0.50.0.0", "browseros"), "v0.50.0")

    def test_lists_paginated_releases_with_normalized_fields(self) -> None:
        runner = RecordingRunner(
            stdout=json.dumps(
                [
                    [
                        {
                            "tag_name": "agent-server/v0.0.128",
                            "draft": False,
                            "target_commitish": "1" * 40,
                        }
                    ],
                    [
                        {
                            "tag_name": "ext-agent/v0.0.124.0",
                            "draft": True,
                            "target_commitish": "2" * 40,
                        }
                    ],
                ]
            )
        )

        releases = list_github_releases("browseros-ai/BrowserOS", runner=runner)

        self.assertEqual(
            releases,
            [
                {
                    "tagName": "agent-server/v0.0.128",
                    "isDraft": False,
                    "targetCommitish": "1" * 40,
                },
                {
                    "tagName": "ext-agent/v0.0.124.0",
                    "isDraft": True,
                    "targetCommitish": "2" * 40,
                },
            ],
        )
        command = runner.calls[0][0]
        self.assertEqual(command[:4], ["gh", "api", "--paginate", "--slurp"])
        self.assertEqual(
            command[-1], "repos/browseros-ai/BrowserOS/releases?per_page=100"
        )

    def test_inspects_draft_release_through_release_cli(self) -> None:
        response = {
            "isDraft": True,
            "targetCommitish": "1" * 40,
            "assets": [
                {
                    "name": "BrowserOS.dmg",
                    "size": 42,
                    "digest": "sha256:" + "a" * 64,
                }
            ],
        }
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(response), stderr=""
        )
        with mock.patch(
            "bos_build.release.github.subprocess.run", return_value=completed
        ) as runner:
            release = inspect_github_release(
                "ext-agent/v0.0.124.0", "browseros-ai/BrowserOS"
            )

        self.assertEqual(release["isDraft"], True)
        self.assertEqual(release["targetCommitish"], "1" * 40)
        self.assertEqual(release["assets"], ["BrowserOS.dmg"])
        self.assertEqual(release["asset_metadata"]["BrowserOS.dmg"]["sha256"], "a" * 64)
        command = runner.call_args.args[0]
        self.assertEqual(command[:3], ["gh", "release", "view"])
        self.assertEqual(command[3], "ext-agent/v0.0.124.0")
        self.assertEqual(command[-2:], ["--json", "isDraft,targetCommitish,assets"])


class ReleaseAssetDownloadTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dest = Path(self._tmp.name)

    def _missing_release_error(self) -> subprocess.CalledProcessError:
        return subprocess.CalledProcessError(
            1, ["gh"], stderr="release not found"
        )

    def test_absent_release_is_not_an_error(self) -> None:
        with mock.patch(
            "bos_build.release.github.inspect_github_release",
            side_effect=self._missing_release_error(),
        ):
            result = download_release_asset(
                "feed-browseros", "owner/repo", "appcast.xml", self.dest
            )

        self.assertIsNone(result)

    def test_transient_release_lookup_failure_raises(self) -> None:
        with mock.patch(
            "bos_build.release.github.inspect_github_release",
            side_effect=subprocess.CalledProcessError(
                1, ["gh"], stderr="error connecting to api.github.com"
            ),
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                download_release_asset(
                    "feed-browseros", "owner/repo", "appcast.xml", self.dest
                )

    def test_absent_asset_returns_none_without_downloading(self) -> None:
        with (
            mock.patch(
                "bos_build.release.github.inspect_github_release",
                return_value={"assets": ["other.xml"]},
            ),
            mock.patch("bos_build.release.github.subprocess.run") as runner,
        ):
            result = download_release_asset(
                "feed-browseros", "owner/repo", "appcast.xml", self.dest
            )

        self.assertIsNone(result)
        runner.assert_not_called()

    def test_download_failure_raises_instead_of_reporting_absence(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[], returncode=1, stdout="", stderr="network down"
        )
        with (
            mock.patch(
                "bos_build.release.github.inspect_github_release",
                return_value={"assets": ["appcast.xml"]},
            ),
            mock.patch(
                "bos_build.release.github.subprocess.run", return_value=completed
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "network down"):
                download_release_asset(
                    "feed-browseros", "owner/repo", "appcast.xml", self.dest
                )


if __name__ == "__main__":
    unittest.main()
