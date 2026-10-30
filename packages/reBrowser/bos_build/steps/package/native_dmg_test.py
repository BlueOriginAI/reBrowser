"""Regression coverage for signature-preserving macOS disk image staging."""

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from .macos import create_dmg


class NativeDiskImageTest(unittest.TestCase):
    def test_preserves_signed_app_and_uses_native_image_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / "reBrowser.app"
            seal = app / "Contents/_CodeSignature/CodeResources"
            seal.parent.mkdir(parents=True)
            seal.write_text("signature-seal")
            output = root / "release.dmg"
            commands = []

            def run(command):
                commands.append(command)
                if command[0] == "ditto":
                    shutil.copytree(command[1], command[2])
                elif command[0] == "hdiutil":
                    stage = Path(command[command.index("-srcfolder") + 1])
                    self.assertEqual((stage / "Applications").readlink(), Path("/Applications"))
                    self.assertEqual((stage / app.name / seal.relative_to(app)).read_text(), "signature-seal")
                    output.write_bytes(b"disk-image")

            with patch("bos_build.steps.package.macos.run_command", side_effect=run):
                self.assertTrue(create_dmg(app, output, "reBrowser", root / "legacy-pkg-dmg"))
            self.assertEqual([cmd[0] for cmd in commands], ["ditto", "codesign", "codesign", "hdiutil"])
            self.assertIn("UDZO", commands[-1])
            self.assertIn("HFS+", commands[-1])
            self.assertNotIn("makehybrid", " ".join(commands[-1]))
            self.assertEqual(seal.read_text(), "signature-seal")

    def test_refuses_overwriting_an_existing_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / "reBrowser.app"
            app.mkdir()
            output = root / "release.dmg"
            output.write_bytes(b"keep-original")
            with patch("bos_build.steps.package.macos.run_command") as run:
                self.assertFalse(create_dmg(app, output))
            run.assert_not_called()
            self.assertEqual(output.read_bytes(), b"keep-original")

    def test_signature_failure_prevents_image_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / "reBrowser.app"
            seal = app / "Contents/_CodeSignature/CodeResources"
            seal.parent.mkdir(parents=True)
            seal.write_text("invalid-seal")
            commands = []

            def run(command):
                commands.append(command)
                if command[0] == "ditto":
                    shutil.copytree(command[1], command[2])
                elif command[0] == "codesign":
                    raise subprocess.CalledProcessError(1, command)

            with patch("bos_build.steps.package.macos.run_command", side_effect=run):
                self.assertFalse(create_dmg(app, root / "release.dmg"))
            self.assertFalse(any(cmd[0] == "hdiutil" for cmd in commands))

    def test_unsigned_local_bundle_remains_supported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / "reBrowser.app"
            app.mkdir()
            with patch("bos_build.steps.package.macos.run_command") as run:
                self.assertTrue(create_dmg(app, root / "release.dmg"))
            self.assertEqual([call.args[0][0] for call in run.call_args_list], ["ditto", "hdiutil"])


if __name__ == "__main__":
    unittest.main()
