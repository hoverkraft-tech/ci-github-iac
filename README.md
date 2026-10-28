# ci-github-iac

Reusable infrastructure validation and disposable VM tests for GitHub Actions.
Provide a Bash assertion script and optional Lima configuration. The shared action
installs Lima, creates the VM, runs the script, reports its result and cleans up.

Use the [VM validation guide](docs/usage/vm-e2e.md) to connect a repository or run
the same validation locally. See the [documentation index](docs/README.md) for
development and release guidance.
