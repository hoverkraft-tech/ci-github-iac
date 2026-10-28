"""Exercise ownership, failure, report and cleanup contracts without a VM."""

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("fixture", Path(__file__).parent / "fixture/vm.py")
assert SPEC is not None and SPEC.loader is not None
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)


class FixtureTests(unittest.TestCase):
    """Protect failure semantics, resource ownership and artifact boundaries."""

    def setUp(self) -> None:
        # unittest cleanup owns this directory across the test method.
        # pylint: disable-next=consider-using-with
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        environment = patch.dict(
            os.environ,
            {
                "E2E_STATE_DIR": str(self.root / "state"),
                "REPORTS_DIR": str(self.root / "reports"),
                "E2E_VM_NAME": "iac-test",
            },
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.vm = fixture.Fixture()
        self.vm.lima_home = self.root / "lima"
        self.vm.environment["LIMA_HOME"] = str(self.vm.lima_home)

    def test_long_checkout_paths_keep_runtime_sockets_short(self) -> None:
        """Deep consumer checkouts fit Lima's Linux Unix socket limit."""
        with patch.dict(
            os.environ,
            {
                "E2E_STATE_DIR": str(self.root / ("a" * 200) / ".cache/e2e"),
                "E2E_VM_NAME": "iac-" + "n" * 32,
            },
        ):
            vm = fixture.Fixture()
        socket = vm.lima_home / vm.name / "ssh.sock.1234567890123456"
        self.assertLess(len(str(socket).encode()), 108)

    def test_runtime_is_scoped_to_checkout(self) -> None:
        """Different consumers cannot share a fixture runtime directory."""
        first = fixture.Fixture().lima_home
        with patch.dict(os.environ, {"E2E_STATE_DIR": str(self.root / "another-checkout")}):
            second = fixture.Fixture().lima_home
        self.assertNotEqual(first, second)

    def test_symlinked_runtime_is_rejected(self) -> None:
        """A pre-existing temporary-directory symlink cannot redirect VM writes."""
        target = self.root / "other"
        target.mkdir(mode=0o700)
        self.vm.lima_home.symlink_to(target, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            self.vm.up()

    def test_shared_runtime_is_rejected(self) -> None:
        """A runtime readable by other users cannot hold fixture SSH identities."""
        self.vm.lima_home.mkdir(mode=0o755)
        with self.assertRaises(RuntimeError):
            self.vm.up()

    def test_rejects_unscoped_instance_names(self) -> None:
        """Production VM names cannot be passed to the disposable fixture."""
        with (
            patch.dict(os.environ, {"E2E_VM_NAME": "production"}),
            self.assertRaises(ValueError),
        ):
            fixture.Fixture()

    def test_missing_fixture_cleanup_is_idempotent(self) -> None:
        """Cleanup succeeds twice when no fixture was created."""
        with patch.object(self.vm, "lima") as lima:
            self.vm.down()
            self.vm.down()
            lima.assert_not_called()

    def test_existing_vm_is_not_reused_as_cold_fixture(self) -> None:
        """An existing guest cannot satisfy cold-start acceptance."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima") as lima,
        ):
            with self.assertRaises(RuntimeError):
                self.vm.up()
            lima.assert_not_called()

    def test_start_failure_removes_previous_assertions(self) -> None:
        """Startup failure invalidates stale passing evidence."""
        self.vm.reports.mkdir()
        report = self.vm.reports / "e2e.junit.xml"
        report.write_text("previous success")
        with (
            patch.object(self.vm, "exists", return_value=False),
            patch.object(self.vm, "lima", side_effect=subprocess.TimeoutExpired("limactl", 1)),
            self.assertRaises(subprocess.TimeoutExpired),
        ):
            self.vm.up()
        self.assertFalse(report.exists())

    def test_success_report_contains_real_assertion_results(self) -> None:
        """Every successful report corresponds to a guest assertion call."""
        with patch.object(self.vm, "lima", return_value="") as lima:
            self.vm.test()
        report = ET.parse(self.vm.reports / "e2e.junit.xml").getroot()
        self.assertEqual(len(report.findall("testcase")), 2)
        self.assertEqual(report.get("failures"), "0")
        self.assertEqual(lima.call_count, 2)

    def test_failed_assertions_fail_and_never_publish_guest_output(self) -> None:
        """A failed assertion propagates failure while suppressing raw output."""
        error = subprocess.CalledProcessError(1, "secret-command", output="secret-output")
        with (
            patch.object(self.vm, "lima", side_effect=error),
            self.assertRaises(RuntimeError),
        ):
            self.vm.test()
        text = (self.vm.reports / "e2e.junit.xml").read_text()
        self.assertNotIn("secret", text)
        self.assertEqual(ET.fromstring(text).get("failures"), "2")

    def test_diagnostics_allow_only_known_status_values(self) -> None:
        """Unexpected CLI output cannot enter the public artifact."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima", return_value="sensitive-data"),
        ):
            self.vm.collect()
        self.assertEqual(json.loads((self.vm.reports / "vm.json").read_text()), {"status": "unknown"})

    def test_cleanup_verifies_deletion(self) -> None:
        """A VM that survives deletion must fail cleanup."""
        with (
            patch.object(self.vm, "exists", side_effect=[True, True]),
            patch.object(self.vm, "lima") as lima,
        ):
            with self.assertRaises(RuntimeError):
                self.vm.down()
            lima.assert_called_once_with("delete", "--force", "iac-test")

    def test_cleanup_propagates_lima_failure(self) -> None:
        """CLI deletion errors cannot become successful cleanup."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima", side_effect=subprocess.CalledProcessError(1, "limactl")),
            self.assertRaises(subprocess.CalledProcessError),
        ):
            self.vm.down()
