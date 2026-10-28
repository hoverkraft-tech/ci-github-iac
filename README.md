# ci-github-iac

Reusable infrastructure validation and disposable VM tests for GitHub Actions.
Consumers provide Make targets for startup, assertions, diagnostic collection and
teardown. A credential-free Ubuntu fixture exercises the contract.

Use the [VM workflow guide](docs/usage/vm-e2e.md) to connect a repository or run the
fixture locally. See the [documentation index](docs/README.md) for development
and release guidance.
