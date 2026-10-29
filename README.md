# ci-github-iac

Reusable infrastructure validation and disposable VM actions for GitHub Actions.
Create a Lima guest, run your Bash assertions and destroy the guest using focused
actions. Compose these steps in your workflow and choose how to publish results.

Use an ephemeral Linux x86-64 runner with KVM. Compose
[vm/create](actions/vm/create/README.md), [vm/test](actions/vm/test/README.md)
and [vm/destroy](actions/vm/destroy/README.md) in your workflow. Each action's
readme documents its requirements, inputs, outputs and usage.

See the [documentation index](docs/README.md) for contribution and design guidance.
