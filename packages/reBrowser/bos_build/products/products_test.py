#!/usr/bin/env python3
"""Golden tests for shipped product descriptors and define() conventions."""

import unittest

from bos_build.core.products import (
    LinuxProductIdentity,
    MacProductIdentity,
    ProductDescriptor,
    WindowsProductIdentity,
    _replacements,
    get_product_descriptor,
)
from bos_build.products import DEFAULT_PRODUCT_ID, PRODUCTS

BROWSEROS_AGENT_EXTENSION_ID = "bflpfmnmnokmjhmgnolecpppdbdophmk"
BROWSEROS_BUG_REPORTER_EXTENSION_ID = "adlpneommgkgeanpaekgoaolcpncohkf"
BROWSERCLAW_EXTENSION_ID = "naenhmeajakeeifaphccfdccdpnhkdmj"

EXPECTED_BROWSEROS = ProductDescriptor(
    id="browseros",
    gn_product="browseros",
    display_name="reBrowser",
    dev_display_name="reBrowser Dev",
    company_full_name="Remocode",
    company_short_name="Remocode",
    installer_full_name="reBrowser Installer",
    dev_installer_full_name="reBrowser Dev Installer",
    app_base_name="reBrowser",
    artifact_prefix="reBrowser",
    release_prefix="browseros",
    homepage_url="https://github.com/BlueOriginAI/reBrowser",
    support_url="https://github.com/BlueOriginAI/reBrowser/issues",
    bugtracker_url="https://github.com/BlueOriginAI/reBrowser/issues",
    summary="The open source agentic browser",
    description="reBrowser is an open-source AI browser based on BrowserOS and Chromium.",
    string_replacements=_replacements("reBrowser"),
    required_extension_ids=(
        (BROWSEROS_AGENT_EXTENSION_ID, "reBrowser agent"),
        (BROWSEROS_BUG_REPORTER_EXTENSION_ID, "reBrowser bug reporter"),
    ),
    server_bundle_ids=("browseros-server",),
    mac=MacProductIdentity(
        bundle_id="com.remocode.RemocodeBrowser",
        dev_bundle_id="com.remocode.dev.RemocodeBrowser",
        signing_identifier="com.remocode.RemocodeBrowser",
        dev_signing_identifier="com.remocode.dev.RemocodeBrowser",
        framework_name="reBrowser Framework.framework",
        dev_framework_name="reBrowser Dev Framework.framework",
        dmg_volume_name="reBrowser",
    ),
    linux=LinuxProductIdentity(
        package_name="browseros",
        launcher_name="browseros",
        desktop_id="browseros.desktop",
        icon_name="browseros",
        lib_dir="/usr/lib/browseros",
        appimage_dir="/opt/browseros",
        apparmor_profile_name="browseros",
        metainfo_id="browseros.desktop",
    ),
    windows=WindowsProductIdentity(
        app_user_model_id="Remocode.RemocodeBrowser",
        installer_app_id="{5d8d08af-2df9-4da2-86c1-eac353a0ca32}",
    ),
)

EXPECTED_BROWSERCLAW = ProductDescriptor(
    id="browserclaw",
    gn_product="browserclaw",
    display_name="reBrowser",
    dev_display_name="reBrowser Dev",
    company_full_name="Remocode",
    company_short_name="Remocode",
    installer_full_name="reBrowser Installer",
    dev_installer_full_name="reBrowser Dev Installer",
    app_base_name="reBrowser",
    artifact_prefix="reBrowser-agent",
    release_prefix="browserclaw",
    homepage_url="https://github.com/BlueOriginAI/reBrowser",
    support_url="https://github.com/BlueOriginAI/reBrowser/issues",
    bugtracker_url="https://github.com/BlueOriginAI/reBrowser/issues",
    summary="The open source browser for web agents",
    description="reBrowser is an open-source browser for agent workflows based on BrowserOS.",
    string_replacements=_replacements("reBrowser"),
    required_extension_ids=(
        (BROWSERCLAW_EXTENSION_ID, "reBrowser app"),
        (BROWSEROS_BUG_REPORTER_EXTENSION_ID, "reBrowser bug reporter"),
    ),
    server_bundle_ids=("browserclaw-server",),
    mac=MacProductIdentity(
        bundle_id="com.remocode.RemocodeBrowserNeo",
        dev_bundle_id="com.remocode.dev.RemocodeBrowserNeo",
        signing_identifier="com.remocode.RemocodeBrowserNeo",
        dev_signing_identifier="com.remocode.dev.RemocodeBrowserNeo",
        framework_name="reBrowser Framework.framework",
        dev_framework_name="reBrowser Dev Framework.framework",
        dmg_volume_name="reBrowser",
    ),
    linux=LinuxProductIdentity(
        package_name="browserclaw",
        launcher_name="browserclaw",
        desktop_id="browserclaw.desktop",
        icon_name="browserclaw",
        lib_dir="/usr/lib/browserclaw",
        appimage_dir="/opt/browserclaw",
        apparmor_profile_name="browserclaw",
        metainfo_id="browserclaw.desktop",
    ),
    windows=WindowsProductIdentity(
        app_user_model_id="Remocode.RemocodeBrowserNeo",
        installer_app_id="{FA2AFFF8-647B-477C-A5D2-905BA8DB9B82}",
    ),
)


class DefineGoldenTest(unittest.TestCase):
    def test_browseros_matches_expected_descriptor(self):
        self.assertEqual(get_product_descriptor("browseros"), EXPECTED_BROWSEROS)

    def test_browserclaw_matches_expected_descriptor(self):
        self.assertEqual(get_product_descriptor("browserclaw"), EXPECTED_BROWSERCLAW)

    def test_shipped_products_have_distinct_artifact_prefixes(self):
        prefixes = [product.artifact_prefix for product in PRODUCTS.values()]
        self.assertEqual(len(prefixes), len(set(prefixes)))


class DefineBehaviorTest(unittest.TestCase):
    def _minimal(self, **overrides):
        return ProductDescriptor.define(
            id="acmefox",
            display_name="AcmeFox",
            windows_installer_guid="{00000000-0000-0000-0000-000000000000}",
            summary="s",
            description="d",
            **overrides,
        )

    def test_derivations_for_new_product(self):
        p = self._minimal()
        self.assertEqual(p.dev_display_name, "AcmeFox Dev")
        self.assertEqual(p.mac.bundle_id, "com.browseros.AcmeFox")
        self.assertEqual(p.mac.dev_bundle_id, "com.browseros.dev.AcmeFox")
        self.assertEqual(p.mac.framework_name, "AcmeFox Framework.framework")
        self.assertEqual(p.linux.lib_dir, "/usr/lib/acmefox")
        self.assertEqual(p.windows.app_user_model_id, "BrowserOS.AcmeFox")
        self.assertEqual(p.server_bundle_ids, ("acmefox-server",))
        self.assertEqual(p.release_prefix, "acmefox")
        self.assertEqual(p.required_extension_ids, ())

    def test_override_wins_over_derivation(self):
        p = self._minimal(artifact_prefix="Acme")
        self.assertEqual(p.artifact_prefix, "Acme")
        self.assertEqual(p.app_base_name, "AcmeFox")

    def test_unknown_override_raises(self):
        with self.assertRaisesRegex(TypeError, "Unknown ProductDescriptor override"):
            self._minimal(dmg_name="X")


class RegistryTest(unittest.TestCase):
    def test_registry_has_both_products_and_default(self):
        self.assertEqual(set(PRODUCTS), {"browseros", "browserclaw"})
        self.assertEqual(DEFAULT_PRODUCT_ID, "browseros")

    def test_unknown_product_raises(self):
        with self.assertRaisesRegex(ValueError, "Unknown build.product"):
            get_product_descriptor("netscape")


if __name__ == "__main__":
    unittest.main()
