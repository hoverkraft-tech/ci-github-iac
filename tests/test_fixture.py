"""Exercise ownership, failure, report and cleanup contracts without a VM."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

SPEC = importlib.util.spec_from_file_location("fixture", Path(__file__).parent / "fixture/vm.py")
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        environment = patch.dict(os.environ, {
            "E2E_STATE_DIR": str(self.root / "state"),
            "REPORTS_DIR": str(self.root / "reports"),
            "E2E_VM_NAME": "iac-test",
        })
        environment.start()
        self.addCleanup(environment.stop)
        self.vm = fixture.Fixture()

    def test_rejects_unscoped_instance_names(self):
        with patch.dict(os.environ, {"E2E_VM_NAME": "production"}):
            with self.assertRaises(ValueError):
                fixture.Fixture()

    def test_missing_fixture_cleanup_is_idempotent(self):
        with patch.object(self.vm, "lima") as lima:
            self.vm.down()
            self.vm.down()
            lima.assert_not_called()

    def test_existing_vm_is_not_reused_as_cold_fixture(self):
        with patch.object(self.vm, "exists", return_value=True):
            with patch.object(self.vm, "lima") as lima:
                with self.assertRaises(RuntimeError):
                    self.vm.up()
                lima.assert_not_called()

    def test_start_failure_removes_previous_assertions(self):
        self.vm.reports.mkdir()
        report = self.vm.reports / "e2e.junit.xml"
        report.write_text("previous success")
        with patch.object(self.vm, "exists", return_value=False):
            with patch.object(self.vm, "lima", side_effect=subprocess.TimeoutExpired("limactl", 1)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    self.vm.up()
        self.assertFalse(report.exists())

    def test_success_report_contains_real_assertion_results(self):
        with patch.object(self.vm, "lima", return_value="") as lima:
            self.vm.test()
        report = ET.parse(self.vm.reports / "e2e.junit.xml").getroot()
        self.assertEqual(len(report.findall("testcase")), 2)
        self.assertEqual(report.get("failures"), "0")
        self.assertEqual(lima.call_count, 2)

    def test_failed_assertions_fail_and_never_publish_guest_output(self):
        error = subprocess.CalledProcessError(1, "secret-command", output="secret-output")
        with patch.object(self.vm, "lima", side_effect=error):
            with self.assertRaises(RuntimeError):
                self.vm.test()
        text = (self.vm.reports / "e2e.junit.xml").read_text()
        self.assertNotIn("secret", text)
        self.assertEqual(ET.fromstring(text).get("failures"), "2")

    def test_diagnostics_allow_only_known_status_values(self):
        with patch.object(self.vm, "exists", return_value=True):
            with patch.object(self.vm, "lima", return_value="sensitive-data"):
                self.vm.collect()
        self.assertEqual(json.loads((self.vm.reports / "vm.json").read_text()), {"status": "unknown"})

    def test_cleanup_verifies_deletion(self):
        with patch.object(self.vm, "exists", side_effect=[True, True]):
            with patch.object(self.vm, "lima") as lima:
                with self.assertRaises(RuntimeError):
                    self.vm.down()
                lima.assert_called_once_with("delete", "--force", "iac-test")

    def test_cleanup_propagates_lima_failure(self):
        with patch.object(self.vm, "exists", return_value=True):
            with patch.object(self.vm, "lima", side_effect=subprocess.CalledProcessError(1, "limactl")):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.vm.down()
