"""Old backends must not re-enter a macOS release through bundle or OTA paths."""

import tempfile
import unittest
from pathlib import Path

from bos_build.products.mcp_instance_policy import (
    MCP_INSTANCE_POLICY_MARKER,
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
            validate_mcp_instance_policy(binary)

    def test_missing_backend_and_compatibility_launcher_are_not_release_payloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "reBrowser.app"
            with self.assertRaisesRegex(ValueError, "missing"):
                validate_app_instance_policy(app, required=True)
            binary = app / SERVER_RESOURCES / "bin/reBrowser-server"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(MCP_INSTANCE_POLICY_MARKER)
            validate_app_instance_policy(app, required=True)
            binary.with_name("reBrowser-server-core").write_bytes(b"old backend")
            with self.assertRaisesRegex(ValueError, "compatibility launcher"):
                validate_app_instance_policy(app, required=True)


if __name__ == "__main__":
    unittest.main()
