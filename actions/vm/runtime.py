"""Manage an isolated Lima instance without test or artifact policy."""

import os
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path


class VirtualMachine:
    """Create and destroy only the guest in an invocation's private runtime."""

    name = "iac-test"

    def __init__(self, home: Path) -> None:
        self.home = home
        self.validate_runtime()

    @classmethod
    def allocate(cls) -> "VirtualMachine":
        """Allocate a short, private Lima home without starting a guest."""
        return cls(Path(tempfile.mkdtemp(prefix=f"iac-{os.getuid()}-", dir="/tmp")))

    def validate_runtime(self) -> None:
        """Reject shared, foreign-owned or symlinked runtime directories."""
        if self.home.parent != Path("/tmp") or not self.home.name.startswith(f"iac-{os.getuid()}-"):
            raise ValueError("Expected an invocation's private Lima home")
        if not self.home.exists() and not self.home.is_symlink():
            return  # Repeated destruction is safe after verified removal.
        info = self.home.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError("VM runtime must be a private directory owned by this user")

    def lima(self, *arguments: str, timeout: int = 120, script: str | None = None) -> str:
        """Bound CLI calls and suppress raw output in public logs."""
        self.validate_runtime()
        if not self.home.is_dir():
            raise RuntimeError("VM runtime is absent")
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

    def create(self, template: Path) -> None:
        """Start a fresh guest and roll back resources if startup fails."""
        if self.exists():
            raise RuntimeError("This invocation already has a VM")
        try:
            self.lima(
                "start",
                "--tty=false",
                "--plain",
                "--timeout=10m",
                f"--name={self.name}",
                str(template),
                timeout=660,
            )
        except (subprocess.SubprocessError, OSError, RuntimeError):
            self.destroy()
            raise

    def destroy(self) -> None:
        """Verify deletion before removing the private runtime and SSH identities."""
        if self.exists():
            self.lima("delete", "--force", self.name)
            if self.exists():
                raise RuntimeError("Disposable VM still exists after deletion")
        if self.home.exists():
            shutil.rmtree(self.home)
