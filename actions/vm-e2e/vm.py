"""Run consumer assertions in an owned, disposable Lima VM."""

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path


class VirtualMachine:
    """Own VM creation, bounded assertions, sanitized reports and verified cleanup."""

    name = "iac-test"

    def __init__(self, context: Path) -> None:
        self.context = context
        self.home = context.parent
        self.validate_runtime()
        self.settings = json.loads(context.read_text())
        self.reports = Path(self.settings["artifact-path"])

    @classmethod
    def prepare(cls, inputs: dict) -> "VirtualMachine":
        """Validate caller files before allocating a unique, private runtime."""
        workspace = Path.cwd().resolve()
        script = cls.source_file(inputs.get("test-script", ""), workspace)
        if not script.read_text().strip():
            raise ValueError("The test script must not be empty")
        config = inputs.get("vm-config", "")
        template = cls.source_file(config, workspace) if config else Path(__file__).with_name("lima.yml").resolve()
        minutes = str(inputs.get("test-timeout-minutes", "10"))
        if not re.fullmatch(r"[0-9]+", minutes) or not 1 <= int(minutes) <= 40:
            raise ValueError("The assertion timeout must be an integer from 1 to 40 minutes")
        artifact_path = inputs.get("artifact-path", ".reports")
        if not re.fullmatch(r"[a-zA-Z0-9_./-]+", artifact_path):
            raise ValueError("The report path must be a relative directory without glob characters")
        reports = (workspace / artifact_path).resolve()
        if Path(artifact_path).is_absolute() or reports == workspace or not reports.is_relative_to(workspace):
            raise ValueError("The report directory must be inside the checkout")
        reports.mkdir(parents=True, exist_ok=True)
        for filename in ("e2e.junit.xml", "vm.json"):
            (reports / filename).unlink(missing_ok=True)
        home = Path(tempfile.mkdtemp(prefix=f"iac-{os.getuid()}-", dir="/tmp"))
        context = home / "context.json"
        context.write_text(
            json.dumps(
                {
                    "test-script": str(script),
                    "vm-config": str(template),
                    "artifact-path": str(reports),
                    "test-timeout-minutes": int(minutes),
                }
            )
        )
        return cls(context)

    @staticmethod
    def source_file(value: str, workspace: Path) -> Path:
        """Require a real input file within the consumer checkout."""
        path = (workspace / value).resolve()
        if not value or not path.is_relative_to(workspace) or not path.is_file():
            raise ValueError("The input must name a file inside the checkout")
        return path

    def validate_runtime(self) -> None:
        """Reject shared, foreign-owned or symlinked runtime directories."""
        info = self.home.lstat()
        if (
            self.home.parent != Path("/tmp")
            or not self.home.name.startswith(f"iac-{os.getuid()}-")
            or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise RuntimeError("VM runtime must be a private directory owned by this user")

    def lima(self, *arguments: str, timeout: int = 120, script: str | None = None) -> str:
        """Bound each subprocess and keep raw guest output out of public logs."""
        self.validate_runtime()
        result = subprocess.run(
            ["limactl", *arguments],
            env={**os.environ, "LIMA_HOME": str(self.home)},
            input=script,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()

    def exists(self) -> bool:
        """Look only inside this invocation's private Lima home."""
        self.validate_runtime()
        if not (self.home / self.name).exists():
            return False
        return self.name in self.lima("list", "--format", "{{.Name}}").splitlines()

    def up(self) -> None:
        """Create a fresh guest with host mounts and agent forwarding disabled."""
        if self.exists():
            raise RuntimeError("This invocation already has a VM")
        self.lima(
            "start",
            "--tty=false",
            "--plain",
            "--timeout=10m",
            f"--name={self.name}",
            self.settings["vm-config"],
            timeout=660,
        )

    def test(self) -> None:
        """Execute the consumer's Bash script in the guest and report its exit status."""
        suite = ET.Element("testsuite", name="disposable-vm", tests="1", failures="0")
        case = ET.SubElement(suite, "testcase", name="consumer-script", classname="vm")
        started = time.monotonic()
        failed = False
        try:
            script = Path(self.settings["test-script"]).read_text(encoding="utf-8")
            if not script.strip():
                raise ValueError("The test script must not be empty")
            self.lima(
                "shell",
                "--workdir=/tmp",
                self.name,
                "bash",
                "-euo",
                "pipefail",
                "-s",
                timeout=self.settings["test-timeout-minutes"] * 60,
                script=script,
            )
        except (subprocess.SubprocessError, OSError, ValueError):
            # Never serialize guest output, input paths or exception arguments.
            ET.SubElement(case, "failure", message="Consumer script failed or timed out; inspect locally")
            failed = True
        case.set("time", f"{time.monotonic() - started:.3f}")
        suite.set("failures", "1" if failed else "0")
        ET.ElementTree(suite).write(self.reports / "e2e.junit.xml", encoding="unicode")
        if failed:
            raise RuntimeError("Consumer assertions failed")

    def collect(self) -> None:
        """Publish only an allowlisted VM status."""
        status = "absent"
        if self.exists():
            value = self.lima("list", self.name, "--format", "{{.Status}}")
            status = value if value in {"Running", "Stopped", "Broken"} else "unknown"
        (self.reports / "vm.json").write_text(json.dumps({"status": status}) + "\n")

    def down(self) -> None:
        """Delete only this invocation's guest, verify absence and remove its keys."""
        if self.exists():
            self.lima("delete", "--force", self.name)
            if self.exists():
                raise RuntimeError("Disposable VM still exists after deletion")
        (self.reports / "vm.json").write_text(json.dumps({"status": "absent"}) + "\n")
        shutil.rmtree(self.home)

    def run(self) -> None:
        """Use the same lifecycle locally, preserving cleanup after all failures."""
        try:
            self.up()
            self.test()
        finally:
            try:
                self.collect()
            finally:
                self.down()


def main() -> None:
    """Support action steps and one local command without consumer orchestration."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("prepare", "up", "test", "collect", "down", "run"))
    parser.add_argument("--context", default=os.environ.get("VM_CONTEXT", ""))
    parser.add_argument("--test-script", default="")
    parser.add_argument("--vm-config", default="")
    parser.add_argument("--artifact-path", default=".reports")
    parser.add_argument("--test-timeout-minutes", default="10")
    arguments = parser.parse_args()
    try:
        if arguments.operation in {"prepare", "run"}:
            inputs = json.loads(os.environ.get("VM_INPUTS", "null")) or {
                key.replace("_", "-"): value for key, value in vars(arguments).items()
            }
            vm = VirtualMachine.prepare(inputs)
            print(f"VM recovery context: {vm.context}", flush=True)
            if arguments.operation == "prepare":
                with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
                    output.write(f"context={vm.context}\nid={vm.home.name}\n")
                return
        else:
            context = Path(arguments.context)
            if arguments.operation == "down" and not context.exists():
                return
            vm = VirtualMachine(context)
        getattr(vm, arguments.operation)()
    except (subprocess.SubprocessError, OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f"VM {arguments.operation} failed ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
