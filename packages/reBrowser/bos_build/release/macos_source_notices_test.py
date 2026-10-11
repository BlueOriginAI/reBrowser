"""Tests for the public macOS source notice bundle."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from .macos_source_notices import NOTICE_FILES, write_macos_source_notices


class MacOSSourceNoticesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.app = Path(self.temp.name) / "reBrowser.app"
        (self.app / "Contents").mkdir(parents=True)
        (self.app / "Contents/Info.plist").write_text("app")
        for rel in NOTICE_FILES:
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"Copyright and license: {rel}\n")
        (self.root / ".env").write_text("PRIVATE=do-not-copy\n")

    def write(self, **kwargs):
        return write_macos_source_notices(
            self.app,
            self.root,
            source_sha=kwargs.get("source_sha", "a" * 40),
            project_version=kwargs.get("project_version", "0.1.0"),
            chromium_version="151.0.8162.137",
        )

    def test_copies_exact_declared_notices_and_records_the_source(self):
        result = self.write()
        metadata = json.loads((result / "source.json").read_text())
        self.assertEqual(metadata["sourceCommit"], "a" * 40)
        self.assertEqual(metadata["projectVersion"], "0.1.0")
        self.assertIn("a" * 40, metadata["sourceUrl"])
        self.assertEqual(
            {item["path"] for item in metadata["noticeFiles"]}, set(NOTICE_FILES)
        )
        for item in metadata["noticeFiles"]:
            contents = (result / item["path"]).read_bytes()
            self.assertEqual(hashlib.sha256(contents).hexdigest(), item["sha256"])
        self.assertFalse((result / ".env").exists())
        self.assertIn("Corresponding source:", (result / "SOURCE.txt").read_text())

    def test_rejects_short_sha_and_invalid_project_version(self):
        for kwargs in [{"source_sha": "abc"}, {"project_version": "../0.1.0"}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.write(**kwargs)
        self.assertFalse((self.app / "Contents/Resources/OpenSource").exists())

    def test_preflights_missing_notices_before_creating_output(self):
        (self.root / NOTICE_FILES[-1]).unlink()
        with self.assertRaises(FileNotFoundError):
            self.write()
        self.assertFalse((self.app / "Contents/Resources/OpenSource").exists())

    def test_rejects_notice_symlinks(self):
        notice = self.root / NOTICE_FILES[0]
        notice.unlink()
        notice.symlink_to(self.root / ".env")
        with self.assertRaises(FileNotFoundError):
            self.write()

    def test_does_not_overwrite_previously_sealed_notice_directory(self):
        self.write()
        with self.assertRaises(FileExistsError):
            self.write()


if __name__ == "__main__":
    unittest.main()
