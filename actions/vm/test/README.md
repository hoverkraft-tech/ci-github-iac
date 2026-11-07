<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: VM - Test

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="VM - Test" />
</div>

---

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-vm------test-blue?logo=github-actions)](https://github.com/marketplace/actions/vm---test)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![License](https://img.shields.io/github/license/hoverkraft-tech/ci-github-iac)](http://choosealicense.com/licenses/mit/)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/hoverkraft-tech/ci-github-iac/blob/main/CONTRIBUTING.md)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Validate VM state with Goss, publish summaries and PR comments, and upload JUnit results.

Validate a disposable Linux VM with Goss and publish JUnit results.

Pass the `vm` output from [vm/create](../create/README.md) in the same job and
a required checkout-relative `goss-file`. The action works with both creation
backends. Always schedule [vm/destroy](../destroy/README.md), including after
assertion or report publication failure. Testing leaves the VM running.

### Write a suite

Use Goss resources for files, packages, services, users and commands. Keep
deployment, idempotence and reboot in Ansible Molecule scenarios. Complex checks
can invoke consumer-owned probes already installed in the guest; checkout files
other than the rendered suite are not copied automatically.

The action downloads and verifies the pinned Goss release, renders the suite,
includes and optional `goss-vars` on the runner, then copies the binary and
rendered suite to the guest. Templates therefore use runner environment values;
pass guest-specific expectations through `goss-vars`. Goss runs as the SSH user
through a fresh login so group changes made during provisioning take effect.
Both runner and guest must be Linux x86-64. The guest needs Bash, uname, chmod,
GNU find and an SSH file-copy service. Consumers need no Goss installation.

Setup and execution share `test-timeout-minutes` (1 to 40, default 10).
Collection has a separate two-minute limit and accepts only the native Goss
report, a nonempty regular file up to 20 MiB. Missing, empty and fully skipped
suites fail. Reports are collected after failed assertions; private guest test
files are then removed. Incomplete transfers are never published.

### Publish results

Each invocation publishes native JUnit plus a sanitized execution-status report
through Hoverkraft's report parser: job summary, annotations and, on eligible
pull requests, an updated comment. Use a distinct stable `report-name` for each
step and matrix scenario. Comments use `github.token` and require
`pull-requests: write`; fork PRs still receive summaries and artifacts.
Do not use `pull_request_target` to execute untrusted suites.

Completed reports are retained as a unique GitHub artifact for seven days, even
after parser or comment failure. Raw command output and exceptions are excluded
from the execution-status report. Native Goss reports retain assertion details:
use synthetic expectations and never match or print credentials. Infrastructure
assertions produce test results, not application code coverage.

See the [lifecycle example](../create/README.md#compose-the-vm-actions).
For consolidated comments, set `comment: false` and call the common `ci-reports`
workflow after all test jobs. Native report artifacts use the `ci-reports-` prefix
and the current run attempt, so earlier attempts cannot leak stale results.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/vm/test@89e3bf93adc94b592188e714f61d4abc391aab46 # 1.0.0
  with:
    # VM reference returned by vm/create in the same job; works with either backend.
    # This input is required.
    vm: ""

    # Required checkout-relative Goss suite, including any referenced Goss files.
    # This input is required.
    goss-file: ""

    # Optional checkout-relative JSON or YAML variables file. Use values suitable for public reports.
    goss-vars: ""

    # Combined Goss setup and execution timeout, from 1 to 40 minutes.
    # Default: `10`
    test-timeout-minutes: "10"

    # Summary and PR comment title. Use a distinct stable name for each test step and matrix scenario.
    # Default: `VM test results`
    report-name: VM test results

    # Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled.
    # Default: `true`
    comment: "true"
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**                  | **Description**                                                                                                                             | **Required** | **Default**       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------- |
| **`vm`**                   | VM reference returned by vm/create in the same job; works with either backend.                                                              | **true**     | -                 |
| **`goss-file`**            | Required checkout-relative Goss suite, including any referenced Goss files.                                                                 | **true**     | -                 |
| **`goss-vars`**            | Optional checkout-relative JSON or YAML variables file. Use values suitable for public reports.                                             | **false**    | -                 |
| **`test-timeout-minutes`** | Combined Goss setup and execution timeout, from 1 to 40 minutes.                                                                            | **false**    | `10`              |
| **`report-name`**          | Summary and PR comment title. Use a distinct stable name for each test step and matrix scenario.                                            | **false**    | `VM test results` |
| **`comment`**              | Publish an individual PR comment. Set false when using the shared ci-reports workflow; summaries, annotations and artifacts remain enabled. | **false**    | `true`            |

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
