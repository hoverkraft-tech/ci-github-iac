"""Exercise independently composable VM actions and their failure contracts."""

import importlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from unittest.mock import Mock, call, patch

BACKEND = Path(__file__).resolve().parents[1] / "actions/vm"
sys.path.insert(0, str(BACKEND))
# Load the same entrypoints used from downloaded action directories.
GuestAssertions = importlib.import_module("assertions").GuestAssertions
VirtualMachine = importlib.import_module("runtime").VirtualMachine
cli = importlib.import_module("cli")
local_run = cli.local_run
template_path = cli.template_path


# unittest exposes each independent contract as a public test method.
# pylint: disable-next=too-many-public-methods
class VirtualMachineTests(unittest.TestCase):
    """Protect isolated resource ownership and independent test execution."""

    def setUp(self) -> None:
        # unittest cleanup owns temporary files across each test method.
        # pylint: disable-next=consider-using-with
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.script = self.root / "assert.sh"
        self.script.write_text("test -d /run/systemd/system\n")
        working_directory = patch.object(Path, "cwd", return_value=self.root)
        working_directory.start()
        self.addCleanup(working_directory.stop)
        self.vm = self.allocate()

    def allocate(self) -> Any:
        """Register test cleanup even when a simulated CLI deletion fails."""
        vm = VirtualMachine.allocate()
        self.addCleanup(shutil.rmtree, vm.home, ignore_errors=True)
        return vm

    def test_each_invocation_has_a_short_private_runtime(self) -> None:
        """Concurrent runs cannot share VMs or exceed Unix socket limits."""
        other = self.allocate()
        self.assertNotEqual(self.vm.home, other.home)
        self.assertEqual(self.vm.home.stat().st_mode & 0o777, 0o700)
        self.assertLess(len(str(self.vm.home / self.vm.name / "ssh.sock.1234567890123456").encode()), 108)

    def test_shared_runtime_is_rejected(self) -> None:
        """Other users must not be able to read VM SSH identities."""
        self.vm.home.chmod(0o755)
        with self.assertRaises(RuntimeError):
            self.vm.destroy()

    def test_symlinked_runtime_is_rejected(self) -> None:
        """A symlink cannot redirect VM writes or deletion, even when dangling."""
        home = self.vm.home
        shutil.rmtree(home)
        home.symlink_to(self.root / "missing", target_is_directory=True)
        self.addCleanup(home.unlink)
        with self.assertRaises(RuntimeError):
            self.vm.destroy()

    def test_unmanaged_paths_cannot_be_destroyed(self) -> None:
        """Empty and arbitrary paths fail rather than becoming successful cleanup."""
        for path in (Path(""), self.root, Path("/tmp/not-owned")):
            with self.subTest(path=path), self.assertRaises(ValueError):
                VirtualMachine(path).destroy()
        self.assertTrue(self.script.exists())

    def test_template_must_belong_to_checkout(self) -> None:
        """Missing or external configuration fails before allocation."""
        link = self.root / "link.yml"
        link.symlink_to(BACKEND / "create/lima.yml")
        for name in ("missing.yml", "../outside.yml", "link.yml"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                template_path(name)

    def test_custom_configuration_and_plain_mode_reach_lima(self) -> None:
        """Creation needs only a template, with no assertion or report inputs."""
        config = self.root / "guest.yml"
        config.write_text("cpus: 1\n")
        with patch.object(self.vm, "lima") as lima:
            self.vm.create(template_path("guest.yml"))
        self.assertIn(str(config), lima.call_args.args)
        self.assertIn("--plain", lima.call_args.args)
        self.assertEqual(lima.call_args.kwargs["timeout"], 660)
        self.assertFalse((self.root / ".reports").exists())

    def test_existing_owned_vm_is_not_reused_or_deleted(self) -> None:
        """A repeated create must not destroy an already running VM."""
        with patch.object(self.vm, "exists", return_value=True), patch.object(self.vm, "lima") as lima:
            with self.assertRaises(RuntimeError):
                self.vm.create(template_path(""))
            lima.assert_not_called()

    def test_failed_creation_rolls_back_partial_guest(self) -> None:
        """Startup failure cleans its own resources without caller callbacks."""
        error = subprocess.CalledProcessError(1, "limactl")
        with (
            patch.object(self.vm, "exists", side_effect=[False, True, False]),
            patch.object(self.vm, "lima", side_effect=[error, ""]) as lima,
            self.assertRaises(subprocess.CalledProcessError),
        ):
            self.vm.create(template_path(""))
        self.assertEqual(lima.call_args_list[-1], call("delete", "--force", "iac-test"))
        self.assertFalse(self.vm.home.exists())

    def test_failed_rollback_preserves_recovery_directory(self) -> None:
        """A second cleanup failure remains visible and retains identities."""
        with (
            patch.object(self.vm, "exists", side_effect=[False, True]),
            patch.object(self.vm, "lima", side_effect=subprocess.CalledProcessError(1, "limactl")),
            self.assertRaises(subprocess.CalledProcessError),
        ):
            self.vm.create(template_path(""))
        self.assertTrue(self.vm.home.exists())

    def test_assertion_inputs_are_bounded(self) -> None:
        """Report paths stay in the checkout and test deadlines stay finite."""
        for directory in ("../reports", "/tmp/reports", ".", "*"):
            with self.subTest(directory=directory), self.assertRaises(ValueError):
                GuestAssertions("assert.sh", directory=directory)
        for minutes in ("0", "41", "-1", "1.5", "nan"):
            with self.subTest(minutes=minutes), self.assertRaises(ValueError):
                GuestAssertions("assert.sh", minutes=minutes)

    def test_stale_report_is_removed_before_validation(self) -> None:
        """An invalid invocation cannot publish earlier success evidence."""
        report = GuestAssertions("assert.sh").report
        report.write_text("stale evidence")
        with self.assertRaises(ValueError):
            GuestAssertions("assert.sh", minutes="invalid")
        self.assertFalse(report.exists())

    def test_consumer_script_is_sent_to_guest_stdin_with_deadline(self) -> None:
        """Testing an existing guest neither provisions nor destroys it."""
        assertions = GuestAssertions("assert.sh", minutes="3")
        with patch.object(self.vm, "lima", return_value="") as lima:
            assertions.run(self.vm)
        lima.assert_called_once_with(
            "shell",
            "--workdir=/tmp",
            "iac-test",
            "bash",
            "-euo",
            "pipefail",
            "-s",
            timeout=180,
            script=self.script.read_text(),
        )
        self.assertTrue(self.vm.home.exists())
        report = ET.parse(assertions.report).getroot()
        self.assertEqual(report.get("failures"), "0")
        self.assertEqual(len(report.findall("testcase")), 1)

    def test_failure_and_timeout_produce_redacted_reports_without_cleanup(self) -> None:
        """Failed assertions leave the VM available for caller diagnostics."""
        assertions = GuestAssertions("assert.sh")
        for error in (
            subprocess.CalledProcessError(1, "secret-command", output="secret-output"),
            subprocess.TimeoutExpired("secret-command", 1, output="secret-output"),
        ):
            with self.subTest(error=type(error).__name__):
                with patch.object(self.vm, "lima", side_effect=error), self.assertRaises(RuntimeError):
                    assertions.run(self.vm)
                report = assertions.report.read_text()
                self.assertNotIn("secret", report)
                self.assertEqual(ET.fromstring(report).get("failures"), "1")
                self.assertTrue(self.vm.home.exists())

    def test_invalid_scripts_fail_without_guest_execution(self) -> None:
        """Missing, empty and external scripts cannot produce passing reports."""
        self.script.write_text(" \n")
        (self.root / "external.sh").symlink_to(BACKEND / "cli.py")
        for script in ("", "missing.sh", "assert.sh", "../outside.sh", "external.sh"):
            assertions = GuestAssertions(script)
            with self.subTest(script=script):
                with patch.object(self.vm, "lima") as lima, self.assertRaises(RuntimeError):
                    assertions.run(self.vm)
                lima.assert_not_called()
                self.assertEqual(ET.parse(assertions.report).getroot().get("failures"), "1")

    def test_cleanup_only_targets_its_owned_runtime(self) -> None:
        """Deletion uses a private Lima home and verifies absence before removing keys."""
        with patch("runtime.subprocess.run") as run:
            run.return_value.stdout = ""
            self.vm.lima("delete", "--force", self.vm.name)
        self.assertEqual(run.call_args.kwargs["env"]["LIMA_HOME"], str(self.vm.home))
        with patch.object(self.vm, "exists", side_effect=[True, False]), patch.object(self.vm, "lima") as lima:
            self.vm.destroy()
        lima.assert_called_once_with("delete", "--force", "iac-test")
        self.assertFalse(self.vm.home.exists())
        # Repeated deletion needs neither a remaining runtime nor Lima.
        subprocess.run(["python3", str(BACKEND / "cli.py"), "destroy", "--vm", str(self.vm.home)], check=True)

    def test_failed_deletion_retains_recovery_directory(self) -> None:
        """A guest surviving deletion fails cleanup and preserves its identities."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima"),
            self.assertRaises(RuntimeError),
        ):
            self.vm.destroy()
        self.assertTrue(self.vm.home.exists())

    def test_cleanup_before_startup_needs_no_cli(self) -> None:
        """An empty private runtime can be removed without installed Lima."""
        with patch.object(self.vm, "lima") as lima:
            self.vm.destroy()
        lima.assert_not_called()
        self.assertFalse(self.vm.home.exists())

    def test_local_composition_preserves_cleanup_after_failures(self) -> None:
        """Local orchestration uses the same focused components and finally cleanup."""
        for failing_operation in ("create", "test", "destroy"):
            trace = Mock()
            getattr(trace, failing_operation).side_effect = RuntimeError("synthetic failure")
            with (
                self.subTest(operation=failing_operation),
                patch("cli.VirtualMachine.allocate", return_value=self.vm),
                patch.object(self.vm, "create", new=trace.create),
                patch.object(self.vm, "destroy", new=trace.destroy),
                patch("cli.GuestAssertions.run", new=trace.test),
                self.assertRaises(RuntimeError),
            ):
                local_run(template_path(""), GuestAssertions("assert.sh"))
            self.assertEqual(trace.method_calls[-1], call.destroy())
            self.assertEqual(any(item[0] == "test" for item in trace.method_calls), failing_operation != "create")

    def test_failed_cli_test_exports_its_report_for_publication(self) -> None:
        """Report handoff survives assertion failure without owning artifact upload."""
        outputs = self.root / "outputs"
        result = subprocess.run(
            ["python3", str(BACKEND / "cli.py"), "test", "--vm", str(self.vm.home)],
            cwd=self.root,
            env={**os.environ, "GITHUB_OUTPUT": str(outputs)},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(outputs.read_text().strip(), f"report={self.root}/.reports/e2e.junit.xml")
