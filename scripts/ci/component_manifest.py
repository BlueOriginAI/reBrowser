#!/usr/bin/env python3
"""Build a component resource manifest from release assets.

The manifest binds one component version to the exact sha256 and size of each
platform archive so browser builds and server OTA can verify downloads without
a mutable object store.
"""

import argparse
import hashlib
import json
from pathlib import Path

SCHEMA = "browseros-component-manifest-v1"

COMPONENTS = {
    "server": {
        "release_tag_prefix": "agent-server/v",
        "archive_base": "browseros-server-resources",
        "targets": (
            "darwin-arm64",
            "darwin-x64",
            "linux-arm64",
            "linux-x64",
            "windows-x64",
        ),
    },
    "claw-server-rust": {
        "release_tag_prefix": "claw-server/v",
        "archive_base": "browseros-claw-server-rust-resources",
        "targets": (
            "darwin-arm64",
            "darwin-x64",
            "linux-arm64",
            "linux-x64",
            "windows-x64",
        ),
    },
    "app-onboard": {
        "release_tag_prefix": "app-onboard/v",
        "archive_base": "browseros-app-onboard-resources",
        "targets": ("universal",),
    },
    "claw-onboard": {
        "release_tag_prefix": "claw-onboard/v",
        "archive_base": "browseros-claw-onboard-resources",
        "targets": ("universal",),
    },
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(
    component: str,
    version: str,
    release_sha: str,
    assets_dir: Path,
) -> dict:
    spec = COMPONENTS[component]
    targets = {}
    for target in spec["targets"]:
        suffix = "" if target == "universal" else f"-{target}"
        filename = f"{spec['archive_base']}{suffix}.zip"
        path = assets_dir / filename
        if not path.is_file():
            raise SystemExit(f"Missing component asset: {path}")
        targets[target] = {
            "filename": filename,
            "sha256": _sha256(path),
            "size": path.stat().st_size,
        }
    return {
        "schema": SCHEMA,
        "component": component,
        "version": version,
        "release_tag": f"{spec['release_tag_prefix']}{version}",
        "release_sha": release_sha,
        "targets": targets,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", required=True, choices=sorted(COMPONENTS))
    parser.add_argument("--version", required=True)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    document = build_manifest(
        args.component,
        args.version,
        args.release_sha,
        args.assets_dir,
    )
    args.output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
