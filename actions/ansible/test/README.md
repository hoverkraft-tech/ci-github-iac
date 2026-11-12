<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: Ansible - Test

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="Ansible - Test" />
</div>

---

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-ansible------test-blue?logo=github-actions)](https://github.com/marketplace/actions/ansible---test)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![License](https://img.shields.io/github/license/hoverkraft-tech/ci-github-iac)](http://choosealicense.com/licenses/mit/)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/hoverkraft-tech/ci-github-iac/blob/main/CONTRIBUTING.md)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Run Ansible test playbooks and collection sanity with native reports, PR comments and artifacts.

Run Ansible tests with maintained upstream actions and native JUnit reports.

For Ansible integration scenarios with a configurable target environment, use
[ansible/test-molecule](../test-molecule/README.md). This action tests Ansible content
without managing a VM or running a deployment lifecycle.

### Run tests

Check out the consumer on a fresh Linux GitHub-hosted runner. Supply its existing
requirements file containing an exact `ansible-core==X.Y.Z` pin and either an
explicit `test-playbook` or one `collection`. Use a matrix for multiple targets.
Linting and playbook syntax checks belong in separate consumer jobs.

Test playbooks are executed by
[dawidd6/action-ansible-playbook](https://github.com/dawidd6/action-ansible-playbook).
The pinned Ansible Core is installed in a temporary virtual environment using
the runner's Python; that Python must be supported by the selected Ansible Core.
Ansible's built-in JUnit callback writes task results, including failed assertions.
Provide test assertions and disposable targets, never a deployment playbook.
Use `ansible-config` for inventory and collection search paths, and
`galaxy-requirements` for dependencies. The action does not provision test environments.

Collection sanity uses the maintained Ansible community
[ansible-test action](https://github.com/ansible-community/ansible-test-gh-action),
which owns Python setup, test containers and native JUnit generation.
Its Ansible Core Git tag comes from the same requirements pin. Coverage is
disabled for sanity checks. The selected upstream revision pins nested actions
to full commit SHAs. Source stays in the consumer's checked-out collection.
Sanity covers all supported Python versions unless `target-python-version`
selects the consumer's supported runtime. These are sanity results, not code coverage.
Set `sanity-image` to a pinned compatible container when the upstream default
image is unsuitable. This forwards the upstream action's Docker image setting;
also select `target-python-version`, because custom images do not declare
Ansible's default Python matrix. Use a matrix for multiple supported runtimes.

Paths must stay inside the checkout and use letters, digits, dots, underscores,
hyphens and slashes. Each collection needs `galaxy.yml`. Use a fresh checkout per
collection job so native `tests/output/junit` contains only that run's reports.

### Publish results

Hoverkraft's `parse-ci-reports` publishes native JUnit as summaries, annotations
and a stable PR comment. Test output and task results appear in these reports;
use synthetic data suitable for the repository's visibility. The collection
action also publishes its own summary.

Report collection runs after upstream failures, including when the upstream
action does not export its report output. Reports are uploaded with a unique
artifact name and seven-day retention, including after parsing or commenting
errors. Missing reports fail the action. Failed tests remain failures. No custom
test runner or Docker lifecycle is maintained here.

Grant `pull-requests: write` for comments. Fork PR comments are skipped.
Never run untrusted tests through `pull_request_target`. Use distinct report names
for matrix entries.
For consolidated comments, set `comment: false` and call the common `ci-reports`
workflow after all test jobs. Native report artifacts use the `ci-reports-` prefix
and the current run attempt, so earlier attempts cannot leak stale results.

<!-- overview:end -->
<!-- inputs:start -->

## Inputs

| **Input**                   | **Description**                                                                                                                                | **Required** | **Default**            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| **`ansible-requirements`**  | Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.                                                     | **true**     | -                      |
| **`test-playbook`**         | Checkout-relative playbook containing test assertions. This playbook is executed. Supply test-playbook or collection, exclusively.             | **false**    | -                      |
| **`collection`**            | One checked-out collection directory containing galaxy.yml. Use a matrix for multiple collections.                                             | **false**    | -                      |
| **`target-python-version`** | Optional Python major.minor for collection sanity checks. Empty tests all versions supported by Ansible Core.                                  | **false**    | -                      |
| **`sanity-image`**          | Optional pinned Docker image for collection sanity. Requires target-python-version; empty uses Ansible Core's default image and Python matrix. | **false**    | -                      |
| **`ansible-config`**        | Optional checkout-relative ansible.cfg file for test playbook execution.                                                                       | **false**    | -                      |
| **`galaxy-requirements`**   | Optional checkout-relative Galaxy requirements file for third-party role and collection dependencies.                                          | **false**    | -                      |
| **`report-name`**           | Stable summary and PR comment title, distinct for each test step or matrix entry.                                                              | **false**    | `Ansible test results` |
| **`comment`**               | Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled.    | **false**    | `true`                 |

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
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/ansible/test@f79197ed335849b362694735d0fe7d0e6a55c4e9 # dependabot/pip/tests/fixture/ansible/python-dependencies-f8f2875693
  with:
    # Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.
    # This input is required.
    ansible-requirements: ""

    # Checkout-relative playbook containing test assertions. This playbook is executed. Supply test-playbook or collection, exclusively.
    test-playbook: ""

    # One checked-out collection directory containing galaxy.yml. Use a matrix for multiple collections.
    collection: ""

    # Optional Python major.minor for collection sanity checks. Empty tests all versions supported by Ansible Core.
    target-python-version: ""

    # Optional pinned Docker image for collection sanity. Requires target-python-version; empty uses Ansible Core's default image and Python matrix.
    sanity-image: ""

    # Optional checkout-relative ansible.cfg file for test playbook execution.
    ansible-config: ""

    # Optional checkout-relative Galaxy requirements file for third-party role and collection dependencies.
    galaxy-requirements: ""

    # Stable summary and PR comment title, distinct for each test step or matrix entry.
    # Default: `Ansible test results`
    report-name: Ansible test results

    # Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled.
    # Default: `true`
    comment: "true"
```

<!-- usage:end -->
