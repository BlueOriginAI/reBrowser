#!/usr/bin/env python3
"""BrowserOS — the flagship product."""

from pathlib import Path

from ...core.products import (
    BROWSEROS_AGENT_EXTENSION_ID,
    BROWSEROS_BUG_REPORTER_EXTENSION_ID,
    MacProductIdentity,
    ProductDescriptor,
    WindowsProductIdentity,
)
from ..server_binaries import ServerBundle, SignSpec

BROWSEROS_PRODUCT = ProductDescriptor.define(
    id="browseros",
    display_name="reBrowser",
    company="Remocode",
    mac_bundle_domain="com.remocode",
    homepage_url="https://github.com/BlueOriginAI/reBrowser",
    support_url="https://github.com/BlueOriginAI/reBrowser/issues",
    bugtracker_url="https://github.com/BlueOriginAI/reBrowser/issues",
    windows_installer_guid="{5d8d08af-2df9-4da2-86c1-eac353a0ca32}",
    summary="The open source agentic browser",
    description="reBrowser is an open-source AI browser based on BrowserOS and Chromium.",
    required_extensions=(
        (BROWSEROS_AGENT_EXTENSION_ID, "reBrowser agent"),
        (BROWSEROS_BUG_REPORTER_EXTENSION_ID, "reBrowser bug reporter"),
    ),
    mac=MacProductIdentity(
        bundle_id="com.remocode.RemocodeBrowser",
        dev_bundle_id="com.remocode.dev.RemocodeBrowser",
        signing_identifier="com.remocode.RemocodeBrowser",
        dev_signing_identifier="com.remocode.dev.RemocodeBrowser",
        framework_name="reBrowser Framework.framework",
        dev_framework_name="reBrowser Dev Framework.framework",
        dmg_volume_name="reBrowser",
    ),
    windows=WindowsProductIdentity(
        app_user_model_id="Remocode.RemocodeBrowser",
        installer_app_id="{5d8d08af-2df9-4da2-86c1-eac353a0ca32}",
    ),
)

BROWSEROS_SERVER_BUNDLE = ServerBundle(
    id="browseros-server",
    name="BrowserOS Server",
    product_ids=("browseros",),
    chromium_output_root="BrowserOSServer",
    local_resources_root=Path("resources/binaries/browseros_server"),
    chromium_resources_root=Path("chrome/browser/browseros/server/resources"),
    macos_bundle_resources_root=Path(
        "Contents/Resources/BrowserOSServer/default/resources"
    ),
    windows_bundle_resources_root=Path("BrowserOSServer/default/resources"),
    macos_binaries={
        "browseros_server": SignSpec(
            "browseros_server", "runtime", "browseros-executable-entitlements.plist"
        ),
        "bun": SignSpec("bun", "runtime", "browseros-executable-entitlements.plist"),
        "rg": SignSpec("rg", "runtime"),
    },
    windows_binaries=("browseros_server.exe",),
    source_builder="bun",
    source_component="server",
    runtime_binary_name="browseros_server",
)
