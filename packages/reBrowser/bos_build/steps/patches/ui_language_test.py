"""Source-contract checks for the native language bridge (not a Chromium build)."""

import re
import subprocess
import unittest

from ...lib.paths import get_package_root

PATCHES = get_package_root() / "chromium_patches"
CORE = "chrome/browser/browseros/core"
API = "chrome/browser/extensions/api/browser_os"
ONBOARDING = "chrome/browser/browseros/onboarding/browseros_onboarding.cc"


def added_source(relative_path: str) -> str:
    return "\n".join(
        line[1:]
        for line in (PATCHES / relative_path).read_text().splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )


class UILanguagePatchContractTest(unittest.TestCase):
    def test_profile_preference_defaults_to_system(self) -> None:
        self.assertIn(
            'kUILanguage[] = "browseros.ui_language"',
            added_source(f"{CORE}/browseros_prefs.h"),
        )
        self.assertIn(
            'RegisterStringPref(prefs::kUILanguage, "system")',
            added_source(f"{CORE}/browseros_prefs.cc"),
        )

    def test_existing_setter_preserves_its_namespace(self) -> None:
        source = added_source(f"{API}/browser_os_api.cc")
        self.assertIn('!params->name.starts_with("browseros.")', source)
        self.assertIn("params->name == browseros::prefs::kUILanguage", source)
        self.assertIn("!IsValidUILanguagePreference(params->value)", source)
        for value in ['"system"', '"zh-CN"', '"en"']:
            self.assertIn(value, source)

    def test_webui_observes_changes_and_acknowledges_equal_writes(self) -> None:
        source = added_source(ONBOARDING)
        self.assertIn("PrefChangeRegistrar pref_change_registrar_;", source)
        self.assertIn("void OnJavascriptAllowed() override", source)
        self.assertIn("pref_change_registrar_.Reset()", source)
        self.assertRegex(
            source,
            r"GetString\(browseros::prefs::kUILanguage\) == \*preference\) "
            r"\{\s+OnUILanguagePreferenceChanged\(\)",
        )
        self.assertIn(
            'state.Set("systemUiLanguage", '
            "g_browser_process->GetApplicationLocale())",
            source,
        )
        handler = source.split("void HandleSetUILanguage", 1)[1].split(
            "void HandleRefreshSources", 1
        )[0]
        for forbidden in ["DetectSources(", "ResumeSetup(", "HandleComplete("]:
            self.assertNotIn(forbidden, handler)

    def test_language_only_updates_preserve_import_error_and_progress(self) -> None:
        source = added_source(ONBOARDING)
        handler = source.split("void OnUILanguagePreferenceChanged()", 1)[1].split(
            "void HandlePageReady", 1
        )[0]
        self.assertIn("last_sent_state_->Clone()", handler)
        self.assertIn("AddUILanguageState(state)", handler)
        self.assertNotIn("BuildSources()", handler)
        self.assertIn("last_sent_state_.reset()", source)
        for method in ["void SendState(", "void SendFailure(std::string_view"]:
            body = source.split(method, 1)[1].split("CallJavascriptFunction", 1)[0]
            self.assertIn("last_sent_state_ = state.Clone()", body)

    def test_extension_observer_is_profile_scoped(self) -> None:
        source = added_source(f"{API}/browser_os_change_detector.cc")
        header = added_source(f"{API}/browser_os_change_detector.h")
        self.assertIn("kServiceIsCreatedWithBrowserContext = true", header)
        self.assertIn("pref_change_registrar_.Init(profile_->GetPrefs())", source)
        self.assertIn(
            "browser_os::OnUILanguageChanged::kEventName, std::move(args), profile_",
            source,
        )
        self.assertIn(
            "static void onUILanguageChanged(DOMString preference)",
            added_source("chrome/common/extensions/api/browser_os.idl"),
        )

    def test_custom_native_labels_have_chinese_translations(self) -> None:
        translations = added_source(
            "chrome/app/resources/generated_resources_zh-CN.xtb"
        )
        self.assertIn('id="6187065185557150870">聊天</translation>', translations)
        self.assertIn('id="3739760661582092658">登录会话</translation>', translations)

    def test_changed_patch_hunks_are_ordered_and_parseable(self) -> None:
        paths = [
            f"{CORE}/browseros_prefs.h",
            f"{CORE}/browseros_prefs.cc",
            f"{CORE}/browseros_prefs_unittest.cc",
            ONBOARDING,
            f"{API}/browser_os_api.cc",
            f"{API}/browser_os_change_detector.cc",
            f"{API}/browser_os_change_detector.h",
            "chrome/common/extensions/api/browser_os.idl",
            "chrome/browser/extensions/api/api_browser_context_keyed_service_factories.cc",
            "extensions/browser/extension_event_histogram_value.h",
            "tools/metrics/histograms/metadata/extensions/enums.xml",
            "chrome/app/resources/generated_resources_zh-CN.xtb",
            "chrome/app/generated_resources.grd",
            "chrome/browser/ui/webui/settings/settings_localized_strings_provider.cc",
        ]
        for relative in paths:
            with self.subTest(path=relative):
                patch = PATCHES / relative
                starts = [
                    int(value)
                    for value in re.findall(
                        r"^@@ -(\d+)", patch.read_text(), re.MULTILINE
                    )
                ]
                self.assertEqual(starts, sorted(starts))
                result = subprocess.run(
                    ["git", "apply", "--numstat", str(patch)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
