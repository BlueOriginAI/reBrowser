"""Release gates for the macOS global MCP instance-ownership policy."""

from pathlib import Path

MCP_INSTANCE_POLICY_MARKER = b"rebrowser-mcp-instance-policy=1;"
SERVER_RESOURCES = Path("Contents/Resources/BrowserClawServer/default/resources")


def validate_mcp_instance_policy(binary: Path) -> None:
    if not binary.is_file():
        raise ValueError(f"MCP backend is missing: {binary}")
    if MCP_INSTANCE_POLICY_MARKER not in binary.read_bytes():
        raise ValueError(f"MCP backend lacks primary-instance protection: {binary}")
    if binary.with_name("reBrowser-server-core").exists():
        raise ValueError("A compatibility launcher is not a release MCP backend")


def validate_app_instance_policy(app: Path, *, required: bool = False) -> None:
    resources = app / SERVER_RESOURCES
    if required or resources.exists():
        validate_mcp_instance_policy(resources / "bin/reBrowser-server")
