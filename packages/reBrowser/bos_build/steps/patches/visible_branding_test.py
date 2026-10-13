"""Visible-brand and resource contracts; identifiers and legal notices are out of scope."""

from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[5]
AGENT = ROOT / "packages/reBrowser-agent"
PATCHES = ROOT / "packages/reBrowser/chromium_patches"
LEGACY = re.compile(r"BrowserOS neo|\bBrowserOS\b|\bBrowserClaw\b|RemocodeBrowser")


class VisibleBrandingTest(unittest.TestCase):
    def test_catalog_display_strings_use_rebrowser(self):
        paths = [
            "apps/claw-app/lib/i18n/locales/en.ts",
            "apps/claw-app/lib/i18n/locales/zh-CN.ts",
            "apps/claw-app/lib/i18n/supplemental.ts",
            "apps/app/lib/i18n/en.ts",
            "apps/app/lib/i18n/zh-CN.ts",
            "apps/app/lib/i18n/provider-supplemental.ts",
            "apps/app/lib/i18n/surfaces-supplemental.ts",
            "apps/claw-onboard/src/i18n.tsx",
            "apps/claw-onboard/src/i18n-messages.ts",
            "apps/app-onboard/src/i18n.tsx",
            "apps/app-onboard/src/i18n-messages.ts",
        ]
        for relative in paths:
            for number, line in enumerate((AGENT / relative).read_text().splitlines(), 1):
                if line.lstrip().startswith(("//", "/*", "*", "import ")):
                    continue
                with self.subTest(path=relative, line=number):
                    self.assertIsNone(LEGACY.search(line), line)

    def test_initial_html_titles_match_the_product(self):
        for relative in [
            "apps/claw-app/entrypoints/newtab/index.html",
            "apps/app/entrypoints/app/index.html",
            "apps/claw-onboard/index.html",
            "apps/app-onboard/index.html",
        ]:
            source = (AGENT / relative).read_text()
            title = re.search(r"<title>(.*?)</title>", source).group(1)
            self.assertIn("reBrowser", title)
            self.assertIsNone(LEGACY.search(title))

    def test_legacy_keychain_screenshot_is_not_packaged(self):
        for app in ["claw-onboard", "app-onboard"]:
            self.assertFalse((AGENT / f"apps/{app}/public/icon/keychain-prompt.png").exists())
            for path in ["scripts/verify-chromium-build.ts", "tests/build.test.ts"]:
                self.assertNotIn("'icon/keychain-prompt.png'", (AGENT / f"apps/{app}/{path}").read_text())
        self.assertNotIn('"icon/keychain-prompt.png"', (PATCHES / "chrome/browser/browseros/onboarding/BUILD.gn").read_text())

    def test_onboarding_does_not_relabel_upstream_media(self):
        hero = (AGENT / "apps/claw-app/components/cockpit/VideoFeature.tsx").read_text()
        self.assertIn("reBrowser", hero)
        self.assertNotIn("<video", hero)
        self.assertNotIn("cdn.browseros.com", hero)
        features = (AGENT / "apps/app/screens/features/Features.tsx").read_text()
        self.assertNotIn("mediaUrls", features)
        self.assertNotIn("<video", features)
        self.assertNotIn("discordUrl", features)
        self.assertNotIn("slackUrl", features)
        guide = (AGENT / "apps/claw-app/screens/mcp/install-guide.data.ts").read_text()
        self.assertIn("https://github.com/BlueOriginAI/reBrowser/", guide)
        self.assertIn("MCP_SERVER_NAME = 'reBrowser'", guide)
        self.assertNotIn(".mcpb", guide)
        self.assertNotIn("browseros-ai", guide)

    def test_native_display_strings_and_patch_hunks(self):
        paths = [
            "chrome/browser/ui/browser_actions.cc",
            "chrome/browser/ui/browser_command_controller.cc",
            "chrome/browser/resources/settings/about_page/about_page.html.ts",
            "chrome/browser/browseros/onboarding/BUILD.gn",
        ]
        for relative in paths:
            patch = PATCHES / relative
            result = subprocess.run(["git", "apply", "--numstat", str(patch)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            source = patch.read_text()
            self.assertNotIn('u"Ask BrowserOS"', source)
            self.assertNotIn('u"BrowserOS Agent is installing/updating.', source)
            self.assertNotIn('>BrowserOS - $i18n', source)


if __name__ == "__main__":
    unittest.main()
