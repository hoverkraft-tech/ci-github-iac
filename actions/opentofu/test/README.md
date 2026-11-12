<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: OpenTofu - Test

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="OpenTofu - Test" />
</div>

---

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-opentofu------test-blue?logo=github-actions)](https://github.com/marketplace/actions/opentofu---test)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![License](https://img.shields.io/github/license/hoverkraft-tech/ci-github-iac)](http://choosealicense.com/licenses/mit/)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/hoverkraft-tech/ci-github-iac/blob/main/CONTRIBUTING.md)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Run native OpenTofu tests with the official runtime, summaries, JUnit artifacts and optional PR comments.

Run native OpenTofu tests and publish their results through Hoverkraft reporting.

Supply a module containing native `.tofutest.hcl` or `.tftest.hcl` tests and a
checkout-relative file containing an exact stable OpenTofu version. The action
composes the official setup Action, `tofu init -backend=false` and `tofu test`.
Provider and module installation uses the consumer's configuration and lockfile.
Formatting and linting remain separate. No arbitrary command input is exposed.

Use a fresh Linux runner and disposable test infrastructure. Native tests can
create resources and own their cleanup; workflows must bound runtime and retain
an independent cleanup path for interrupted provider tests. Backend initialization
is disabled: this action never migrates the consumer's operational state.
Repository-specific recovery and provider scenarios stay in the consumer.
Supply native TF_VAR variables through the step environment, never action inputs.

OpenTofu currently emits test events as JSON rather than JUnit. A small adapter
retains only test names and outcomes in JUnit; diagnostic text, plans, state,
variable values and raw event streams are never uploaded. Failures, empty suites,
incomplete reports and cleanup errors remain failures. Use synthetic fixtures;
test names and filenames are public report metadata.

Reports are parsed as summaries and annotations and retained for seven days,
including after test failures. Set `comment: false` with the common `ci-reports`
workflow to consolidate results. Individual comments require `pull-requests: write`
and are skipped for fork PRs. Never execute untrusted tests via pull_request_target.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/opentofu/test@51d24c6eddd109333ffe5c673e482d3270aff05f # feat/opentofu-test
  with:
    # Checkout-relative module directory containing native OpenTofu tests.
    # This input is required.
    working-directory: ""

    # Checkout-relative file containing an exact stable OpenTofu version maintained by the consumer.
    # This input is required.
    tofu-version-file: ""

    # Stable report title, distinct for each test step or matrix entry.
    # Default: `OpenTofu test results`
    report-name: OpenTofu test results

    # Publish an individual PR comment. Set false when using the shared ci-reports workflow.
    # Default: `true`
    comment: "true"
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**               | **Description**                                                                                | **Required** | **Default**             |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| **`working-directory`** | Checkout-relative module directory containing native OpenTofu tests.                           | **true**     | -                       |
| **`tofu-version-file`** | Checkout-relative file containing an exact stable OpenTofu version maintained by the consumer. | **true**     | -                       |
| **`report-name`**       | Stable report title, distinct for each test step or matrix entry.                              | **false**    | `OpenTofu test results` |
| **`comment`**           | Publish an individual PR comment. Set false when using the shared ci-reports workflow.         | **false**    | `true`                  |

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
