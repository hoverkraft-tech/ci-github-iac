"""Credential-free Lima fixture; reports contain only fixed assertion names/status."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET


class Fixture:
    """Own one disposable VM in a dedicated Lima home."""

    def __init__(self) -> None:
        self.name = os.environ.get("E2E_VM_NAME", "iac-fixture")
        if not re.fullmatch(r"iac-[a-z0-9-]{1,50}", self.name):
            raise ValueError("E2E_VM_NAME must start with iac- and use lowercase letters, digits or hyphens")
        self.state = Path(os.environ.get("E2E_STATE_DIR", ".cache/e2e")).resolve()
        self.reports = Path(os.environ.get("REPORTS_DIR", ".reports")).resolve()
        self.environment = {**os.environ, "LIMA_HOME": str(self.state / "lima")}

    def lima(self, *arguments: str, timeout: int = 120) -> str:
        result = subprocess.run(
            ["limactl", *arguments], env=self.environment,
            check=True, capture_output=True, text=True, timeout=timeout,
        )
        return result.stdout.strip()

    def exists(self) -> bool:
        if not Path(self.environment["LIMA_HOME"]).exists():
            return False
        return self.name in self.lima("list", "--format", "{{.Name}}").splitlines()

    def up(self) -> None:
        self.state.mkdir(parents=True, exist_ok=True)
        self.reports.mkdir(parents=True, exist_ok=True)
        # A prior successful report must never satisfy assertions for a new run.
        (self.reports / "e2e.junit.xml").unlink(missing_ok=True)
        if self.exists():
            raise RuntimeError("Fixture already exists; run make e2e-down before a cold-start test")
        template = Path(__file__).with_name("lima.yml")
        self.lima("start", "--tty=false", "--timeout=10m", f"--name={self.name}", str(template), timeout=660)

    def test(self) -> None:
        self.reports.mkdir(parents=True, exist_ok=True)
        suite = ET.Element("testsuite", name="disposable-vm", tests="2", failures="0")
        checks = [
            ("ubuntu-boot", "test \"$(. /etc/os-release; printf '%s' \"$ID\")\" = ubuntu; test -d /run/systemd/system"),
            ("guest-write-read", "test ! -e /tmp/iac-fixture; printf '%s' synthetic > /tmp/iac-fixture; test \"$(cat /tmp/iac-fixture)\" = synthetic; rm /tmp/iac-fixture"),
        ]
        failed = False
        for name, command in checks:
            case = ET.SubElement(suite, "testcase", name=name, classname="vm")
            started = time.monotonic()
            try:
                self.lima("shell", self.name, "sh", "-eu", "-c", command)
            except (subprocess.SubprocessError, OSError):
                # Never serialize guest output or exception arguments into artifacts.
                ET.SubElement(case, "failure", message="Guest assertion failed; inspect locally")
                failed = True
            case.set("time", f"{time.monotonic() - started:.3f}")
        suite.set("failures", str(len(suite.findall(".//failure"))))
        ET.ElementTree(suite).write(self.reports / "e2e.junit.xml", encoding="unicode")
        if failed:
            raise RuntimeError("Guest assertions failed")

    def collect(self) -> None:
        self.reports.mkdir(parents=True, exist_ok=True)
        status = "absent"
        if self.exists():
            value = self.lima("list", self.name, "--format", "{{.Status}}")
            status = value if value in {"Running", "Stopped", "Broken"} else "unknown"
        (self.reports / "vm.json").write_text(json.dumps({"status": status}) + "\n")

    def down(self) -> None:
        if not self.exists():
            return
        self.lima("delete", "--force", self.name)
        if self.exists():
            raise RuntimeError("Disposable VM still exists after deletion")


def main() -> None:
    """Dispatch the four public Make lifecycle operations."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("up", "test", "collect", "down"))
    arguments = parser.parse_args()
    try:
        getattr(Fixture(), arguments.operation)()
    except (subprocess.SubprocessError, OSError, RuntimeError, ValueError) as error:
        # subprocess exceptions may embed sensitive command output; expose a type only.
        parser.exit(1, f"Fixture {arguments.operation} failed ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
