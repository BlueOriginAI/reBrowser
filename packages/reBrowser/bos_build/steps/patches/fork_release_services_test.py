"""Source contracts for release-owned reporting and update boundaries."""
import re
import unittest
from ...lib.paths import get_package_root

PATCHES = get_package_root() / "chromium_patches"


def source(relative_path):
    return "\n".join(
        line[1:]
        for line in (PATCHES / relative_path).read_text().splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )


class ForkReleaseServicesTest(unittest.TestCase):
    def test_crash_upload_has_no_fork_consent_or_destination(self):
        body = source("chrome/app/chrome_crash_reporter_client.cc")
        self.assertIn("return !browseros::IsBrowserClawProduct();", body)
        self.assertRegex(body, r"return browseros::IsBrowserClawProduct\(\) \? std::string\(\)\s*: browseros::kSentryMinidumpUrl;")

    def test_fork_does_not_initialize_native_metrics(self):
        body = source("chrome/browser/browseros/metrics/browseros_metrics_extra_parts.cc")
        self.assertIn("if (browseros::IsBrowserClawProduct()) {\n      return;\n    }\n    CHECK(!metrics_service_);", body)

    def test_only_legacy_sidecar_enables_ota(self):
        body = source("chrome/browser/browseros/server/browseros_server_config.cc")
        current = body.split("kBrowserClawServerDescriptor = {", 1)[1].split("};", 1)[0]
        legacy = body.split("kBrowserOSServerDescriptor = {", 1)[1].split("};", 1)[0]
        self.assertIn('"/system/health",\n    false,', current)
        self.assertIn('"/system/health",\n    true,', legacy)

    def test_fork_does_not_fetch_upstream_extension_config(self):
        body = source("chrome/browser/browseros/extensions/browseros_extension_loader.cc")
        check = body.split("void BrowserOSExtensionLoader::CheckForUpdates() {", 1)[1].split("remote_requested_ = true;", 1)[0]
        self.assertIn("if (IsBrowserClawProduct()) {\n    return;\n  }", check)

    def test_new_file_hunk_sizes_are_correct(self):
        for rel in ["chrome/browser/browseros/metrics/browseros_metrics_extra_parts.cc", "chrome/browser/browseros/extensions/browseros_extension_loader.cc"]:
            text = (PATCHES / rel).read_text()
            count = sum(line.startswith("+") and not line.startswith("+++") for line in text.splitlines())
            self.assertEqual(int(re.search(r"@@ -0,0 \+1,(\d+) @@", text).group(1)), count)
