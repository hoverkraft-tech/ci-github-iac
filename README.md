<!-- markdownlint-disable-next-line first-line-heading -->
<div align="center" width="100%">

# <img src=".github/logo.svg" width="60px" align="center" alt="Infrastructure as Code logo" /> Continuous Integration - GitHub - IaC

![GitHub Verified Creator](https://img.shields.io/badge/GitHub-Verified_Creator-4493F8?logo=github)
[![Continuous Integration](https://github.com/hoverkraft-tech/ci-github-iac/actions/workflows/__main-ci.yml/badge.svg)](https://github.com/hoverkraft-tech/ci-github-iac/actions/workflows/__main-ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Overview

GitHub Actions for validating Ansible and testing infrastructure changes in disposable virtual machines.
Create a VM from your configuration, run your checks, publish test
reports, and verify that the VM is removed afterward.

Your repository supplies the guest configuration and test scenario. The actions
handle VM operations and reporting; your workflow controls their sequence and
can run several test steps against the same guest.

## Actions

### Ansible

#### - [Test Ansible](actions/ansible/test/README.md)

Execute test playbooks and first-party collection sanity through maintained
Ansible actions. Publish test summaries, annotations, PR comments and report artifacts.
The action does not require or manage a VM.

#### - [Test Molecule scenarios](actions/ansible/test-molecule/README.md)

Run native Molecule scenarios with pinned tools and published task reports.
Your scenario defines its target environment, inventory, playbooks and test sequence.

### Virtual machines

#### - [Create VM](actions/vm/create/README.md)

Start an isolated VM from a required `vm-config` and roll back resources if
startup fails. Choose how the VM runs in this step.

#### - [Test VM](actions/vm/test/README.md)

Run Goss assertions against the VM. Collect native JUnit even after test failure
and publish GitHub summaries, annotations, PR comments and artifacts.

#### - [Destroy VM](actions/vm/destroy/README.md)

Verify guest deletion before removing its private runtime and SSH keys. Failed
cleanup remains visible and preserves the runtime for a retry.

## Getting started

For Ansible, check out your repository on a Linux runner. Pass its pinned
Ansible requirements file and test playbook or collection paths to
[ansible/test](actions/ansible/test/README.md). For integration scenarios, use
[ansible/test-molecule](actions/ansible/test-molecule/README.md) with your native Molecule configuration.

For VMs, use an ephemeral Linux x86-64 runner with KVM and network access. Check out your
repository with `persist-credentials: false`, and provide a VM configuration and
a Goss suite for checks of the installed system.

Compose `vm/create`, `vm/test` and `vm/destroy` in the same job, pinning all three
to the same reviewed commit SHA. Pass the `vm` output from creation to each test
step and destruction. Molecule scenarios can also target that VM using its SSH
outputs in their inventory. Schedule destruction with `always()` so cleanup runs
after test or reporting failures.

Start with the [workflow example](actions/vm/create/README.md#compose-the-vm-actions).
The [creation guide](actions/vm/create/README.md#choose-a-backend) explains the
backend choice and configuration format; testing and cleanup use the same interface.
Each action's readme documents its inputs, outputs and failure behavior.
GitHub reporting needs `pull-requests: write` for PR comments. Publish only reports
suitable for your repository's visibility.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture: infrastructure test actions](docs/development/adr/0002-infrastructure-test-actions.md)

## Contributing

Read the [contributing guidelines](CONTRIBUTING.md) for development, validation
and release conventions before opening a pull request.

## Author

**Hoverkraft** · [contact@hoverkraft.cloud](mailto:contact@hoverkraft.cloud)

- Site: [hoverkraft.cloud](https://hoverkraft.cloud)
- GitHub: [@hoverkraft-tech](https://github.com/hoverkraft-tech)

## License

[MIT](LICENSE) · Copyright © 2026 hoverkraft
