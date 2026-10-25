"""Old backends must not re-enter a macOS release through bundle or OTA paths."""

import tempfile
import unittest
import plistlib
from pathlib import Path

from bos_build.products.mcp_instance_policy import (
    MCP_INSTANCE_POLICY_MARKER,
    HTTP_REQUEST_POLICY_MARKER,
    NATIVE_SYNC_URL_POLICY_MARKER,
    NATIVE_FRAMEWORK,
    SERVER_RESOURCES,
    validate_app_instance_policy,
    validate_mcp_instance_policy,
)


class McpInstancePolicyTest(unittest.TestCase):
    def test_unguarded_backend_is_rejected_and_guarded_backend_is_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            binary = Path(temporary) / "reBrowser-server"
            binary.write_bytes(b"old signed backend")
            with self.assertRaisesRegex(ValueError, "primary-instance protection"):
                validate_mcp_instance_policy(binary)
            binary.write_bytes(b"native backend:" + MCP_INSTANCE_POLICY_MARKER)
            with self.assertRaisesRegex(ValueError, "HTTP source protection"):
                validate_mcp_instance_policy(binary)
            binary.write_bytes(b"native backend:" + MCP_INSTANCE_POLICY_MARKER + HTTP_REQUEST_POLICY_MARKER)
            validate_mcp_instance_policy(binary)

    def test_missing_backend_and_compatibility_launcher_are_not_release_payloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "reBrowser.app"
            with self.assertRaisesRegex(ValueError, "missing"):
                validate_app_instance_policy(app, required=True)
            binary = app / SERVER_RESOURCES / "bin/reBrowser-server"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(MCP_INSTANCE_POLICY_MARKER + HTTP_REQUEST_POLICY_MARKER)
            native = app / NATIVE_FRAMEWORK
            native.parent.mkdir(parents=True)
            native.write_bytes(NATIVE_SYNC_URL_POLICY_MARKER)
            validate_app_instance_policy(app, required=True)
            binary.with_name("reBrowser-server-core").write_bytes(b"old backend")
            with self.assertRaisesRegex(ValueError, "compatibility launcher"):
                validate_app_instance_policy(app, required=True)

    def test_deferred_native_security_app_requires_explicit_local_packaging(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "reBrowser.app"
            binary = app / SERVER_RESOURCES / "bin/reBrowser-server"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(MCP_INSTANCE_POLICY_MARKER + HTTP_REQUEST_POLICY_MARKER)
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({"RemocodeNativeSecurityBuildPending": True}))
            with self.assertRaisesRegex(ValueError, "local-maintenance only"):
                validate_app_instance_policy(app, required=True)
            validate_app_instance_policy(app, required=True, allow_deferred_native_security=True)

    def test_old_framework_cannot_be_released_by_clearing_pending_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "reBrowser.app"
            binary = app / SERVER_RESOURCES / "bin/reBrowser-server"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(MCP_INSTANCE_POLICY_MARKER + HTTP_REQUEST_POLICY_MARKER)
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({"RemocodeNativeSecurityBuildPending": False}))
            native = app / NATIVE_FRAMEWORK
            native.parent.mkdir(parents=True)
            native.write_bytes(b"old framework")
            for maintenance_override in (False, True):
                with self.assertRaisesRegex(ValueError, "compiled sync URL policy v2"):
                    validate_app_instance_policy(app, required=True, allow_deferred_native_security=maintenance_override)
            native.write_bytes(b"native framework:" + NATIVE_SYNC_URL_POLICY_MARKER)
            validate_app_instance_policy(app, required=True)

    def test_native_policy_detection_spans_stream_boundaries(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "reBrowser.app"
            binary = app / SERVER_RESOURCES / "bin/reBrowser-server"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(MCP_INSTANCE_POLICY_MARKER + HTTP_REQUEST_POLICY_MARKER)
            native = app / NATIVE_FRAMEWORK
            native.parent.mkdir(parents=True)
            native.write_bytes(b"x" * (1024 * 1024 - 8) + NATIVE_SYNC_URL_POLICY_MARKER)
            validate_app_instance_policy(app, required=True)


if __name__ == "__main__":
    unittest.main()
