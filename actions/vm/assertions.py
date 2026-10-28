"""Execute guest assertions and produce their sanitized JUnit result."""

import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from runtime import VirtualMachine


# One operation owns assertion execution and its result.
# pylint: disable-next=too-few-public-methods
class GuestAssertions:
    """Report script success, failure or timeout without provisioning resources."""

    def __init__(self, script: str, directory: str = ".reports", minutes: str = "10") -> None:
        workspace = Path.cwd().resolve()
        reports = (workspace / directory).resolve()
        if (
            not re.fullmatch(r"[a-zA-Z0-9_./-]+", directory)
            or Path(directory).is_absolute()
            or reports == workspace
            or not reports.is_relative_to(workspace)
        ):
            raise ValueError("The report directory must be inside the checkout")
        reports.mkdir(parents=True, exist_ok=True)
        self.report = reports / "e2e.junit.xml"
        self.report.unlink(missing_ok=True)
        if not re.fullmatch(r"[0-9]+", minutes) or not 1 <= int(minutes) <= 40:
            raise ValueError("The assertion timeout must be an integer from 1 to 40 minutes")
        self.timeout = int(minutes) * 60
        self.script = script

    def run(self, vm: VirtualMachine) -> None:
        """Send assertions to guest Bash; a missing or failed script fails the test."""
        suite = ET.Element("testsuite", name="disposable-vm", tests="1", failures="0")
        case = ET.SubElement(suite, "testcase", name="consumer-script", classname="vm")
        started = time.monotonic()
        failed = False
        try:
            workspace = Path.cwd().resolve()
            path = (workspace / self.script).resolve()
            if not self.script or not path.is_relative_to(workspace):
                raise ValueError("The script must be inside the checkout")
            script = path.read_text(encoding="utf-8")
            if not script.strip():
                raise ValueError("The script must not be empty")
            vm.lima(
                "shell",
                "--workdir=/tmp",
                vm.name,
                "bash",
                "-euo",
                "pipefail",
                "-s",
                timeout=self.timeout,
                script=script,
            )
        except (subprocess.SubprocessError, OSError, RuntimeError, ValueError):
            ET.SubElement(case, "failure", message="Consumer script failed or timed out; inspect locally")
            failed = True
        case.set("time", f"{time.monotonic() - started:.3f}")
        suite.set("failures", "1" if failed else "0")
        ET.ElementTree(suite).write(self.report, encoding="unicode")
        if failed:
            raise RuntimeError("Consumer assertions failed")
