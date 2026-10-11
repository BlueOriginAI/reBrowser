"""Bundle source provenance and license notices before macOS signing."""

import hashlib
import json
import re
import shutil
from pathlib import Path


NOTICE_FILES = (
    "LICENSE",
    "LICENSE.ungoogled_chromium",
    "THIRD_PARTY_NOTICES.md",
    "UPSTREAM.md",
    "packages/reBrowser-agent/LICENSE",
    "packages/reBrowser-agent/packages/acpx-ai-provider/LICENSE",
    "packages/reBrowser-agent/packages/agent-mcp-manager/LICENSE",
    "packages/reBrowser-agent/packages/agent-mcp-manager/THIRD_PARTY_NOTICES.md",
    "packages/reBrowser-agent/apps/app/public/geist/LICENSE.txt",
    "packages/reBrowser-agent/apps/app/public/geist-mono/LICENSE.txt",
)


def write_macos_source_notices(
    app_path: Path,
    repo_root: Path,
    *,
    source_sha: str,
    project_version: str,
    chromium_version: str,
) -> Path:
    """Copy only declared public notices; call before sealing the app bundle."""
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("Source provenance requires a full commit SHA")
    if not re.fullmatch(r"\d+\.\d+\.\d+", project_version):
        raise ValueError("Project release version must be major.minor.patch")
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", chromium_version):
        raise ValueError("Chromium version must have four numeric components")
    if not (app_path / "Contents/Info.plist").is_file():
        raise FileNotFoundError(f"Not an app bundle: {app_path}")
    files = [repo_root / rel for rel in NOTICE_FILES]
    for source in files:
        if not source.is_file() or source.is_symlink():
            raise FileNotFoundError(f"Public source notice missing: {source}")
    destination = app_path / "Contents/Resources/OpenSource"
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite source notices: {destination}")
    destination.mkdir(parents=True)
    records = []
    for rel, source in zip(NOTICE_FILES, files):
        target = destination / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        records.append(
            {"path": rel, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
        )
    metadata = {
        "project": "reBrowser",
        "projectVersion": project_version,
        "chromiumVersion": chromium_version,
        "sourceCommit": source_sha,
        "sourceUrl": f"https://github.com/BlueOriginAI/reBrowser/tree/{source_sha}",
        "sourceArchiveUrl": (
            f"https://github.com/BlueOriginAI/reBrowser/archive/{source_sha}.tar.gz"
        ),
        "buildInstructions": "docs/remocode-development.md",
        "noticeFiles": records,
    }
    (destination / "source.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (destination / "SOURCE.txt").write_text(
        f"reBrowser {project_version}\n"
        f"Chromium {chromium_version}\n"
        f"Corresponding source: {metadata['sourceUrl']}\n"
        "See the bundled licenses and the source repository's build instructions.\n",
        encoding="utf-8",
    )
    return destination
