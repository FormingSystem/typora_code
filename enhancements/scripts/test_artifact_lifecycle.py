"""实际文件和子进程验证测试载荷回收边界，不触碰历史无标记缓存。"""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

import manage_test_artifacts as artifacts


class artifact_lifecycle(unittest.TestCase):
    def setUp(self):
        self.root = artifacts.create("test", os.getpid())
        self.work = self.root / "work"

    def tearDown(self):
        artifacts.finish(self.root, "unit_finished", os.getpid())

    def test_success_failure_evidence_and_readonly(self):
        for status in ("passed", "failed"):
            root = artifacts.create("test", os.getpid())
            work = root / "work"
            (work / "payload.bin").write_bytes(b"x" * 1048576)
            (work / "payload.bin").chmod(stat.S_IREAD)
            (work / "stderr.log").write_text("错误保留", encoding="utf-8")
            (work / "checks.json").write_text('{"status":"FAIL"}', encoding="utf-8")
            (work / "screen.png").write_bytes(b"fixture")
            result = artifacts.finish(root, status, os.getpid())
            self.assertFalse(work.exists())
            self.assertGreater(result["payload_bytes"], 1048576)
            self.assertEqual(result["result"], status)
            self.assertEqual((root / "evidence/work/stderr.log").read_text(encoding="utf-8"), "错误保留")
            self.assertTrue((root / "evidence/work/checks.json").is_file())
            self.assertTrue((root / "evidence/work/screen.png").is_file())
            self.assertEqual(artifacts.finish(root, status), result)

    def test_ui_named_json_evidence(self):
        root = artifacts.create("test", os.getpid(), keep_json=True)
        (root / "work/layouts.json").write_text("{}", encoding="utf-8")
        artifacts.finish(root, "passed", os.getpid())
        self.assertTrue((root / "evidence/work/layouts.json").is_file())

    def test_command_failure_keeps_log_and_removes_payload(self):
        script = Path(__file__).with_name("run_test_command.py")
        command = "import tempfile,pathlib,sys; pathlib.Path(tempfile.gettempdir(),'large.bin').write_bytes(b'x'*1048576); print('failure evidence'); sys.exit(9)"
        result = subprocess.run([sys.executable, "-X", "utf8", str(script), sys.executable, "-c", command], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 9, result.stderr)
        evidence = Path(result.stdout.split("Evidence: ")[-1].strip())
        self.assertIn("failure evidence", (evidence / "output.log").read_text(encoding="utf-8"))
        self.assertFalse((evidence.parent / "work").exists())

    def test_command_git_does_not_discover_development_repository(self):
        script = Path(__file__).with_name("run_test_command.py")
        command = "import tempfile,subprocess; directory=tempfile.gettempdir(); assert subprocess.run(['git','-C',directory,'rev-parse','--show-toplevel'],capture_output=True).returncode != 0"
        result = subprocess.run([sys.executable, "-X", "utf8", str(script), sys.executable, "-c", command], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_child_lease_and_handoff(self):
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        try:
            artifacts.claim(self.root, child.pid, child=True)
            artifacts.claim(self.root, os.getpid())
            with self.assertRaisesRegex(RuntimeError, "子进程"):
                artifacts.finish(self.root, "failed", os.getpid())
            self.assertTrue(self.work.exists())
            self.assertIn("cleanup_error", artifacts.load(self.root)[1])
        finally:
            child.terminate()
            child.wait()
        self.assertEqual(artifacts.finish(self.root, "failed", os.getpid())["state"], "cleaned")

    def test_debug_retention(self):
        with patch.dict(os.environ, {"TYPORA_KEEP_TEST_WORK": "1"}):
            self.assertEqual(artifacts.finish(self.root, "passed", os.getpid())["state"], "retained")
        self.assertTrue(self.work.exists())

    def test_stale_recovery_and_live_exclusion(self):
        _, data = artifacts.load(self.root)
        data["created"] = time.time() - 86401
        artifacts.save(self.root, data)
        self.assertFalse(any(entry["directory"] == str(self.root) for entry in artifacts.sweep()))
        data["processes"] = {"4294967294": "dead"}
        artifacts.save(self.root, data)
        self.assertTrue(any(entry.get("action") == "reclaim" and entry["directory"] == str(self.root) for entry in artifacts.sweep()))
        self.assertTrue(self.work.exists())
        artifacts.sweep(apply=True)
        self.assertFalse(self.work.exists())

    def test_missing_marker_and_foreign_directory(self):
        with self.assertRaises(ValueError):
            artifacts.finish(self.root.parent, "failed")
        marker = self.root / artifacts.MARKER
        text = marker.read_text(encoding="utf-8")
        marker.unlink()
        try:
            with self.assertRaises(FileNotFoundError):
                artifacts.finish(self.root, "failed")
            self.assertTrue(self.work.exists())
        finally:
            marker.write_text(text, encoding="utf-8")

    def test_junction_refusal_preserves_external_file(self):
        outside = artifacts.create("test", os.getpid())
        protected = outside / "work/keep.txt"
        protected.write_text("保留", encoding="utf-8")
        link = self.work / "escape"
        try:
            if os.name == "nt":
                subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(protected.parent)], check=True, capture_output=True)
            else:
                link.symlink_to(protected.parent, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "链接"):
                artifacts.finish(self.root, "failed", os.getpid())
            self.assertEqual(protected.read_text(encoding="utf-8"), "保留")
        finally:
            if link.exists():
                if os.name == "nt":
                    link.rmdir()  # 仅移除本测试建立的junction本身。
                else:
                    link.unlink()
            artifacts.finish(outside, "passed", os.getpid())

    def test_reused_pid_does_not_block_recovery(self):
        _, data = artifacts.load(self.root)
        data["processes"] = {str(os.getpid()): "different_start_time"}
        self.assertFalse(artifacts.active(data))


if __name__ == "__main__":
    unittest.main(verbosity=2)
