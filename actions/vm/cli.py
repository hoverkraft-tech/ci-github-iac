"""Expose focused action commands and compose them for local validation."""

import argparse
import os
import subprocess
from pathlib import Path

from assertions import GuestAssertions
from runtime import VirtualMachine


def output(name: str, value: str) -> None:
    """Export action outputs when running on GitHub Actions."""
    if destination := os.environ.get("GITHUB_OUTPUT"):
        with Path(destination).open("a", encoding="utf-8") as stream:
            stream.write(f"{name}={value}\n")


def template_path(value: str) -> Path:
    """Resolve a consumer configuration or the bundled Ubuntu template."""
    if not value:
        return Path(__file__).with_name("create") / "lima.yml"
    workspace = Path.cwd().resolve()
    path = (workspace / value).resolve()
    if not path.is_relative_to(workspace) or not path.is_file():
        raise ValueError("The VM configuration must be a file inside the checkout")
    return path


def local_run(template: Path, assertions: GuestAssertions) -> None:
    """Compose the lifecycle locally without making it an action responsibility."""
    vm = VirtualMachine.allocate()
    print(f"VM recovery directory: {vm.home}", flush=True)
    try:
        vm.create(template)
        assertions.run(vm)
    finally:
        vm.destroy()


def main() -> None:
    """Dispatch one responsibility per action, keeping failures visible."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("create", "test", "destroy", "run"))
    parser.add_argument("--vm", default=os.environ.get("VM_DIRECTORY", ""))
    parser.add_argument("--vm-config", default=os.environ.get("VM_CONFIG", ""))
    parser.add_argument("--test-script", default=os.environ.get("TEST_SCRIPT", ""))
    parser.add_argument("--report-directory", default=os.environ.get("REPORT_DIRECTORY", ".reports"))
    parser.add_argument("--test-timeout-minutes", default=os.environ.get("TEST_TIMEOUT_MINUTES", "10"))
    args = parser.parse_args()
    try:
        if args.operation == "create":
            template = template_path(args.vm_config)
            vm = VirtualMachine.allocate()
            print(f"VM recovery directory: {vm.home}", flush=True)
            output("vm", str(vm.home))
            output("id", vm.home.name)
            vm.create(template)
        elif args.operation == "destroy":
            VirtualMachine(Path(args.vm)).destroy()
            output("removed", "true")
        else:
            assertions = GuestAssertions(args.test_script, args.report_directory, args.test_timeout_minutes)
            if args.operation == "run":
                local_run(template_path(args.vm_config), assertions)
            else:
                try:
                    assertions.run(VirtualMachine(Path(args.vm)))
                finally:
                    if assertions.report.is_file():
                        output("report", str(assertions.report))
    except (subprocess.SubprocessError, OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f"VM {args.operation} failed ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
