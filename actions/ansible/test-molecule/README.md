<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: Ansible - Test Molecule

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="Ansible - Test Molecule" />
</div>

---

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-ansible------test--molecule-blue?logo=github-actions)](https://github.com/marketplace/actions/ansible---test-molecule)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![License](https://img.shields.io/github/license/hoverkraft-tech/ci-github-iac)](http://choosealicense.com/licenses/mit/)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/hoverkraft-tech/ci-github-iac/blob/main/CONTRIBUTING.md)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Run native Molecule scenarios with native reports, PR comments and artifacts.

Run a native Molecule scenario and publish its Ansible task reports.

### Run a scenario

Molecule and Ansible run on the GitHub runner. Your scenario selects its inventory,
target environment and test sequence: containers, an existing test host or a VM.
This action installs the pinned tools, runs `molecule test`, and publishes results.
Use [ansible/test](../test/README.md) for test playbooks and collection sanity.

```yaml
- name: Test Ansible with Molecule
  uses: hoverkraft-tech/ci-github-iac/actions/ansible/test-molecule@<reviewed-full-commit-sha>
  with:
    molecule-scenario: tests/molecule/default
    ansible-requirements: requirements.txt
    python-version-file: .python-version
    report-name: Ansible integration tests
```

Supply a directory containing `molecule.yml` with
[Ansible-native configuration](https://docs.ansible.com/projects/molecule/ansible-native/).
Configure inventories, playbook locations, Galaxy dependencies and the sequence
in that file. The action supplies no base configuration, inventory or reboot step.
Use a workflow matrix to test multiple scenarios. The selected scenario must
produce native Ansible JUnit task reports; empty report sets fail.
The [local fixture](../../../tests/fixture/molecule/local/molecule.yml) runs
without a VM. Molecule's [container examples](https://docs.ansible.com/projects/molecule/examples/)
show how scenarios can manage container targets.

### Runtime and cleanup

Use a fresh Linux GitHub-hosted runner. Supply an exact stable `ansible-core==X.Y.Z`
pin in `ansible-requirements`; the action installs that pin and its maintained
Molecule release into a private environment. The action owns Python setup through
actions/setup-python. Pass `python-version-file` for the consumer's maintained
controller pin; otherwise setup-python reads the root `.python-version` or uses
the Python already on PATH. Select a version supported by both pinned tools.
Configure extra target dependencies and collection search paths in the scenario
or `ansible-config`. Input files must remain inside the checkout and use letters,
digits, dots, underscores, hyphens and slashes.

Molecule honors the scenario's native resource lifecycle and failure cleanup.
Scenarios that create resources must provide idempotent cleanup/destroy playbooks
and include destruction in their test sequence. If the test process is interrupted
or times out, the action retries native `molecule destroy` with a two-minute limit.
Timeouts and cleanup failures remain failures. Allow time for cleanup and reporting
in the job timeout. Forced runner termination can interrupt cleanup entirely;
externally hosted resources need their own recovery policy.

### Test an existing VM

When a scenario needs a full OS, [vm/create](../../vm/create/README.md) can create
it in the same job. Pass its `ssh-config` and `name` outputs through step environment
variables referenced by your scenario's inventory. The
[QEMU fixture](../../../tests/fixture/molecule/smoke/molecule.yml) demonstrates
this connection and chooses to test reboot persistence. No VM input is required.
Keep [vm/destroy](../../vm/destroy/README.md) in an `always()` workflow step;
a scenario targeting an externally created VM must not destroy it itself.
[vm/test](../../vm/test/README.md) can verify the installed state afterward.

### Publish results

Native task reports and a scenario status report are collected after failures.
Only JUnit files are published; inventory, runtime state and installed tools remain
private. Reports contain task results: use synthetic data and `no_log` for private values.

Hoverkraft's report actions publish summaries, annotations and stable PR comments.
Grant `pull-requests: write` for comments; fork PR comments are skipped.
Never run untrusted tests through `pull_request_target`. Choose distinct report
names for separate scenarios. Reports are uploaded with a unique artifact name
and seven-day retention, including after parsing or commenting failures.
For consolidated comments, set `comment: false` and call the common `ci-reports`
workflow after all test jobs. Native report artifacts use the `ci-reports-` prefix
and the current run attempt, so earlier attempts cannot leak stale results.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/ansible/test-molecule@f8c074d2d45a37caa4a24e2dcdf6d2df034a2ae1 # 1.3.0
  with:
    # Checkout-relative directory containing molecule.yml. The scenario defines its inventory, playbooks and test sequence.
    # This input is required.
    molecule-scenario: ""

    # Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.
    # This input is required.
    ansible-requirements: ""

    # Optional checkout-relative controller Python version file. Otherwise setup-python reads the root .python-version or uses the runner Python. For playbook or Molecule execution only; choose a version supported by the pinned tools.
    python-version-file: ""

    # Optional checkout-relative ansible.cfg for scenario execution and collection search paths.
    ansible-config: ""

    # Native test sequence deadline, from 1 to 40 minutes. Interrupted runs allow two additional minutes for scenario cleanup.
    # Default: `20`
    test-timeout-minutes: "20"

    # Stable summary and PR comment title, distinct for each test step or matrix entry.
    # Default: `Molecule test results`
    report-name: Molecule test results

    # Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled.
    # Default: `true`
    comment: "true"
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**                  | **Description**                                                                                                                                                                                                                      | **Required** | **Default**             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ----------------------- |
| **`molecule-scenario`**    | Checkout-relative directory containing molecule.yml. The scenario defines its inventory, playbooks and test sequence.                                                                                                                | **true**     | -                       |
| **`ansible-requirements`** | Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.                                                                                                                                           | **true**     | -                       |
| **`python-version-file`**  | Optional checkout-relative controller Python version file. Otherwise setup-python reads the root .python-version or uses the runner Python. For playbook or Molecule execution only; choose a version supported by the pinned tools. | **false**    | -                       |
| **`ansible-config`**       | Optional checkout-relative ansible.cfg for scenario execution and collection search paths.                                                                                                                                           | **false**    | -                       |
| **`test-timeout-minutes`** | Native test sequence deadline, from 1 to 40 minutes. Interrupted runs allow two additional minutes for scenario cleanup.                                                                                                             | **false**    | `20`                    |
| **`report-name`**          | Stable summary and PR comment title, distinct for each test step or matrix entry.                                                                                                                                                    | **false**    | `Molecule test results` |
| **`comment`**              | Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled.                                                                                          | **false**    | `true`                  |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->
<!-- outputs:end -->
<!-- examples:start -->
<!-- examples:end -->
<!-- contributing:start -->

## Contributing

Contributions are welcome! Please see the [contributing guidelines](https://github.com/hoverkraft-tech/ci-github-iac/blob/main/CONTRIBUTING.md) for more details.

<!-- contributing:end -->
<!-- security:start -->
<!-- security:end -->
<!-- license:start -->

## License

This project is licensed under the MIT License.

SPDX-License-Identifier: MIT

Copyright © 2026 Hoverkraft

For more details, see the [license](http://choosealicense.com/licenses/mit/).

<!-- license:end -->
<!-- generated:start -->

---

This documentation was automatically generated by [CI Dokumentor](https://github.com/hoverkraft-tech/ci-dokumentor).

<!-- generated:end -->
