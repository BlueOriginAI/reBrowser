"""Release gates for the macOS global MCP instance-ownership policy."""

from pathlib import Path
import plistlib

MCP_INSTANCE_POLICY_MARKER = b"rebrowser-mcp-instance-policy=1;"
HTTP_REQUEST_POLICY_MARKER = b"rebrowser-http-origin-policy=1;"
NATIVE_SYNC_URL_POLICY_MARKER = b"rebrowser-sync-url-policy=2;"
SERVER_RESOURCES = Path("Contents/Resources/BrowserClawServer/default/resources")
NATIVE_FRAMEWORK = Path("Contents/Frameworks/reBrowser Framework.framework/reBrowser Framework")


def _contains_marker(binary: Path, marker: bytes) -> bool:
    # Scan the large Chromium framework without copying it all into memory.
    with binary.open("rb") as stream:
        tail = b""
        while chunk := stream.read(1024 * 1024):
            data = tail + chunk
            if marker in data:
                return True
            tail = data[-len(marker) + 1:]
    return False


def validate_mcp_instance_policy(binary: Path) -> None:
    if not binary.is_file():
        raise ValueError(f"MCP backend is missing: {binary}")
    if MCP_INSTANCE_POLICY_MARKER not in binary.read_bytes():
        raise ValueError(f"MCP backend lacks primary-instance protection: {binary}")
    if HTTP_REQUEST_POLICY_MARKER not in binary.read_bytes():
        raise ValueError(f"MCP backend lacks HTTP source protection: {binary}")
    if binary.with_name("reBrowser-server-core").exists():
        raise ValueError("A compatibility launcher is not a release MCP backend")


def validate_app_instance_policy(
    app: Path, *, required: bool = False, allow_deferred_native_security: bool = False
) -> None:
    resources = app / SERVER_RESOURCES
    if required or resources.exists():
        validate_mcp_instance_policy(resources / "bin/reBrowser-server")
        info = app / "Contents/Info.plist"
        pending = False
        if info.is_file():
            metadata = plistlib.loads(info.read_bytes())
            pending = metadata.get("RemocodeNativeSecurityBuildPending") is True
        if pending:
            if allow_deferred_native_security:
                return
            raise ValueError("Native security rebuild is pending; this app is local-maintenance only")
        native = app / NATIVE_FRAMEWORK
        if not native.is_file() or not _contains_marker(native, NATIVE_SYNC_URL_POLICY_MARKER):
            raise ValueError("Native framework lacks compiled sync URL policy v2")
