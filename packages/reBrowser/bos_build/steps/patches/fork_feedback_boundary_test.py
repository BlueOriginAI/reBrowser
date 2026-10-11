"""Source contracts for the first reBrowser release's feedback boundary."""

import re
import unittest
from pathlib import Path

from bos_build.core.products import BROWSERCLAW_EXTENSION_ID, get_product_descriptor


ROOT = Path(__file__).resolve().parents[3]
PATCHES = ROOT / "chromium_patches/chrome/browser/browseros"


class ForkFeedbackBoundaryTest(unittest.TestCase):
    def test_agent_product_does_not_require_the_external_reporter(self):
        self.assertEqual(
            get_product_descriptor("browserclaw").required_extension_ids,
            ((BROWSERCLAW_EXTENSION_ID, "reBrowser app"),),
        )

    def test_external_reporter_is_only_in_the_legacy_gn_product_branch(self):
        patch = (PATCHES / "bundled_extensions/BUILD.gn").read_text()
        body = "\n".join(line[1:] for line in patch.splitlines() if line.startswith("+") and not line.startswith("+++"))
        before_product_branch = body.split("if (browseros_allow_runtime_product_override", 1)[0]
        self.assertNotIn("adlpneommgkgeanpaekgoaolcpncohkf.crx", before_product_branch)
        self.assertIn("Legacy Bug Reporter", body)

    def test_feedback_has_an_owned_issue_destination(self):
        patch = (PATCHES / "core/browseros_constants.h").read_text()
        self.assertIn('IsBrowserClawProduct() && virtual_path == "/feedback"', patch)
        self.assertIn("https://github.com/BlueOriginAI/reBrowser/issues/new/choose", patch)
        self.assertIn("{kBugReporterExtensionId, false, false,\n+     BrowserOSExtensionProduct::kBrowserOS}", patch)

    def test_new_file_patch_hunk_sizes_are_valid(self):
        for rel in ["core/browseros_constants.h", "bundled_extensions/BUILD.gn"]:
            text = (PATCHES / rel).read_text()
            expected = int(re.search(r"@@ -0,0 \+1,(\d+) @@", text).group(1))
            actual = sum(line.startswith("+") and not line.startswith("+++") for line in text.splitlines())
            self.assertEqual(actual, expected, rel)
