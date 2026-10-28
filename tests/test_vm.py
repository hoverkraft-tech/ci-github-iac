"""Exercise public VM configuration, failure, ownership and cleanup contracts."""

import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from unittest.mock import Mock, call, patch

SCRIPT = Path(__file__).resolve().parents[1] / "actions/vm-e2e/vm.py"
SPEC = importlib.util.spec_from_file_location("vm", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class VirtualMachineTests(unittest.TestCase):
    """Protect guest execution, resource ownership and public report boundaries."""

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
        self.vm = self.prepare()

    def prepare(self, **inputs) -> Any:
        """Register runtime cleanup even when a test injects a CLI failure."""
        vm = module.VirtualMachine.prepare({"test-script": "assert.sh", **inputs})
        self.addCleanup(shutil.rmtree, vm.home, ignore_errors=True)
        return vm

    def test_each_invocation_has_a_short_private_runtime(self) -> None:
        """Concurrent runs cannot share VMs or exceed Unix socket limits."""
        other = self.prepare()
        self.assertNotEqual(self.vm.home, other.home)
        self.assertEqual(self.vm.home.stat().st_mode & 0o777, 0o700)
        self.assertLess(len(str(self.vm.home / self.vm.name / "ssh.sock.1234567890123456").encode()), 108)

    def test_shared_runtime_is_rejected(self) -> None:
        """Other users must not be able to read VM SSH identities."""
        self.vm.home.chmod(0o755)
        with self.assertRaises(RuntimeError):
            self.vm.validate_runtime()

    def test_symlinked_runtime_is_rejected(self) -> None:
        """An existing symlink cannot redirect VM writes or deletion."""
        home = self.vm.home
        shutil.rmtree(home)
        home.symlink_to(self.root, target_is_directory=True)
        self.addCleanup(home.unlink)
        with self.assertRaises(RuntimeError):
            self.vm.validate_runtime()

    def test_input_validation_precedes_runtime_allocation(self) -> None:
        """Missing scripts, unsafe paths and unbounded timeouts fail before setup."""
        invalid: list[dict[str, object]] = [
            {"test-script": ""},
            {"test-script": "missing.sh"},
            {"test-script": "../outside.sh"},
            {"vm-config": "missing.yml"},
            {"artifact-path": "../reports"},
            {"artifact-path": "/tmp/reports"},
            {"artifact-path": "."},
            {"artifact-path": "*"},
            {"test-timeout-minutes": 0},
            {"test-timeout-minutes": 41},
            {"test-timeout-minutes": -1},
            {"test-timeout-minutes": 1.5},
            {"test-timeout-minutes": "nan"},
        ]
        with patch.object(module.tempfile, "mkdtemp") as allocate:
            for inputs in invalid:
                with self.subTest(inputs=inputs), self.assertRaises(ValueError):
                    module.VirtualMachine.prepare({"test-script": "assert.sh", **inputs})
            allocate.assert_not_called()

    def test_symlinked_input_cannot_escape_checkout(self) -> None:
        """Caller files must belong to the checked-out scenario."""
        self.script.unlink()
        self.script.symlink_to(SCRIPT)
        with self.assertRaises(ValueError):
            self.prepare()

    def test_empty_script_is_rejected(self) -> None:
        """Missing assertions cannot become an empty successful test run."""
        self.script.write_text(" \n")
        with self.assertRaises(ValueError):
            self.prepare()

    def test_prepare_invalidates_previous_reports(self) -> None:
        """Failed startup cannot upload a previous run's passing assertions."""
        for filename in ("e2e.junit.xml", "vm.json"):
            (self.vm.reports / filename).write_text("stale evidence")
        self.prepare()
        self.assertEqual(list(self.vm.reports.iterdir()), [])

    def test_custom_configuration_and_plain_mode_reach_lima(self) -> None:
        """Consumers configure their guest without implementing its lifecycle."""
        config = self.root / "guest.yml"
        config.write_text("cpus: 1\n")
        vm = self.prepare(**{"vm-config": "guest.yml"})
        with patch.object(vm, "exists", return_value=False), patch.object(vm, "lima") as lima:
            vm.up()
        self.assertIn(str(config), lima.call_args.args)
        self.assertIn("--plain", lima.call_args.args)
        self.assertEqual(lima.call_args.kwargs["timeout"], 660)

    def test_existing_owned_vm_is_not_reused_for_cold_start(self) -> None:
        """Repeated startup cannot satisfy a fresh-boot requirement."""
        with patch.object(self.vm, "exists", return_value=True), patch.object(self.vm, "lima") as lima:
            with self.assertRaises(RuntimeError):
                self.vm.up()
            lima.assert_not_called()

    def test_consumer_script_is_sent_to_guest_stdin_with_deadline(self) -> None:
        """Assertions run in guest Bash with failure propagation and no host mounts."""
        self.vm.settings["test-timeout-minutes"] = 3
        with patch.object(self.vm, "lima", return_value="") as lima:
            self.vm.test()
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
        report = ET.parse(self.vm.reports / "e2e.junit.xml").getroot()
        self.assertEqual(report.get("failures"), "0")
        self.assertEqual(len(report.findall("testcase")), 1)

    def test_failure_and_timeout_produce_redacted_failed_reports(self) -> None:
        """Nonzero exit and timeout cannot become success or leak guest output."""
        errors = [
            subprocess.CalledProcessError(1, "secret-command", output="secret-output"),
            subprocess.TimeoutExpired("secret-command", 1, output="secret-output"),
        ]
        for error in errors:
            with self.subTest(error=type(error).__name__):
                with patch.object(self.vm, "lima", side_effect=error), self.assertRaises(RuntimeError):
                    self.vm.test()
                report = (self.vm.reports / "e2e.junit.xml").read_text()
                self.assertNotIn("secret", report)
                self.assertEqual(ET.fromstring(report).get("failures"), "1")

    def test_disappearing_script_fails_without_executing_guest(self) -> None:
        """A script removed after input validation cannot produce passing evidence."""
        self.script.unlink()
        with patch.object(self.vm, "lima") as lima, self.assertRaises(RuntimeError):
            self.vm.test()
        lima.assert_not_called()

    def test_diagnostics_allow_only_known_status_values(self) -> None:
        """Unexpected CLI output cannot enter the public artifact."""
        with patch.object(self.vm, "exists", return_value=True), patch.object(self.vm, "lima", return_value="secret"):
            self.vm.collect()
        self.assertEqual(json.loads((self.vm.reports / "vm.json").read_text()), {"status": "unknown"})

    def test_cleanup_only_targets_its_owned_runtime(self) -> None:
        """Deletion uses the private Lima home and verifies absence before removing keys."""
        with patch.object(module.subprocess, "run") as run:
            run.return_value.stdout = ""
            self.vm.lima("delete", "--force", self.vm.name)
        self.assertEqual(run.call_args.kwargs["env"]["LIMA_HOME"], str(self.vm.home))
        with patch.object(self.vm, "exists", side_effect=[True, False]), patch.object(self.vm, "lima") as lima:
            self.vm.down()
        lima.assert_called_once_with("delete", "--force", "iac-test")
        self.assertFalse(self.vm.home.exists())
        self.assertEqual(json.loads((self.vm.reports / "vm.json").read_text()), {"status": "absent"})
        # A second CLI cleanup is safe without a remaining context or installed Lima.
        subprocess.run(["python3", str(SCRIPT), "down", "--context", str(self.vm.context)], check=True)

    def test_failed_deletion_retains_recovery_context(self) -> None:
        """A guest that survives deletion fails cleanup and preserves its identities."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima"),
            self.assertRaises(RuntimeError),
        ):
            self.vm.down()
        self.assertTrue(self.vm.context.is_file())
        self.assertFalse((self.vm.reports / "vm.json").exists())

    def test_cleanup_propagates_cli_failure(self) -> None:
        """Deletion errors cannot become successful cleanup."""
        with (
            patch.object(self.vm, "exists", return_value=True),
            patch.object(self.vm, "lima", side_effect=subprocess.CalledProcessError(1, "limactl")),
            self.assertRaises(subprocess.CalledProcessError),
        ):
            self.vm.down()

    def test_cleanup_before_lima_installation_needs_no_cli(self) -> None:
        """Failed setup still removes its empty private runtime without Lima."""
        with patch.object(self.vm, "lima") as lima:
            self.vm.down()
        lima.assert_not_called()
        self.assertFalse(self.vm.home.exists())

    def test_local_lifecycle_cleans_up_after_each_failure(self) -> None:
        """Startup, assertion and collection failures all preserve teardown attempts."""
        for failing_operation in ("up", "test", "collect", "down"):
            trace = Mock()
            getattr(trace, failing_operation).side_effect = RuntimeError("synthetic failure")
            with (
                self.subTest(operation=failing_operation),
                patch.object(self.vm, "up", new=trace.up),
                patch.object(self.vm, "test", new=trace.test),
                patch.object(self.vm, "collect", new=trace.collect),
                patch.object(self.vm, "down", new=trace.down),
                self.assertRaises(RuntimeError),
            ):
                self.vm.run()
            self.assertEqual(trace.method_calls[-2:], [call.collect(), call.down()])
            self.assertEqual(call.test() in trace.method_calls, failing_operation != "up")
