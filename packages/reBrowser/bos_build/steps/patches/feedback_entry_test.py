"""Regression checks for the Settings-only feedback entry."""

import re
import unittest

from ...lib.paths import get_package_root


PATCHES = get_package_root() / "chromium_patches"
CORE = "chrome/browser/browseros/core/browseros_constants.h"
ABOUT = "chrome/browser/resources/settings/about_page"


def _added_source(relative_path: str) -> str:
    return "\n".join(
        line[1:]
        for line in (PATCHES / relative_path).read_text().splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )


class FeedbackEntryPatchTest(unittest.TestCase):
    def test_feedback_remains_installed_for_both_products_without_forced_pin(self) -> None:
        self.assertIn(
            "{kBugReporterExtensionId, false, false, BrowserOSExtensionProduct::kAll}",
            _added_source(CORE),
        )

    def test_feedback_route_reuses_the_reporter_extension(self) -> None:
        self.assertIn(
            '{"/feedback", kBugReporterExtensionId, "popup.html", ""}',
            _added_source(CORE),
        )

    def test_about_page_exposes_a_feedback_link(self) -> None:
        template = _added_source(f"{ABOUT}/about_page.html.ts")
        self.assertIn('id="browserOSFeedback"', template)
        self.assertIn('@click="${this.onBrowserOSFeedbackClick_}"', template)
        self.assertIn('label="$i18n{browserOSFeedback}" external', template)
        provider = _added_source("chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc")
        self.assertIn('AddLocalizedString("browserOSFeedback",', provider)
        self.assertIn('IDS_SETTINGS_BROWSEROS_FEEDBACK', provider)

    def test_feedback_entry_is_outside_google_branding_guard(self) -> None:
        patch = (PATCHES / ABOUT / "about_page.html.ts").read_text()
        self.assertRegex(
            patch,
            r'\+  <cr-link-row[^\n]*id="browserOSFeedback"\n'
            r'\+[^\n]*\n\+[^\n]*\n <if expr="_google_chrome">',
        )

    def test_feedback_click_opens_the_virtual_route_not_google_feedback(self) -> None:
        handler = _added_source(f"{ABOUT}/about_page.ts")
        match = re.search(
            r"onBrowserOSFeedbackClick_\(\) \{(?P<body>.*?)\}",
            handler,
            re.DOTALL,
        )
        self.assertIsNotNone(match)
        assert match is not None
        self.assertEqual(
            match.group("body").strip(),
            "window.open('chrome://browseros/feedback');",
        )


if __name__ == "__main__":
    unittest.main()
