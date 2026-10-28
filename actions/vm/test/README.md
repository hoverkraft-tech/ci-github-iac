<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: VM - Test

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-vm------test-blue?logo=github-actions)](https://github.com/marketplace/actions/vm---test)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Run guest test commands, parse reports, comment on pull requests and upload results.

Execute guest tests, collect reports and publish coverage results.
See [the usage guide](../../../docs/usage/vm-e2e.md) for workflow composition.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/vm/test@dced70c9039bddd0b5903c5eb2e61c1ee2e0db9b # feat/phase-1-bootstrap
  with:
    # Private runtime directory returned by vm/create.
    # This input is required.
    vm: ""

    # Bash command or multiline commands to execute inside the guest from /tmp.
    # Provide exactly one of command or test-script. Checkout files are not mounted in the guest.
    command: ""

    # Nonempty Bash script in the checkout to send to the guest instead of command.
    test-script: ""

    # Guest command timeout, from 1 to 40 minutes.
    # Default: `10`
    test-timeout-minutes: "10"

    # Optional report paths or glob patterns relative to the guest REPORTS_DIR.
    # Separate patterns with newlines, commas or semicolons. Every pattern must match.
    # Commands receive a fresh REPORTS_DIR; matched files are collected even after test failure.
    # Report contents are preserved. Use only reports suitable for public CI.
    report-file: ""

    # Coverage reporter; `github` for summaries and PR comments, `codecov` for upload,
    # or empty to disable reporting. Report artifacts are always retained.
    # Codecov requires report-file selection and id-token write permission for OIDC.
    #
    # Default: `github`
    coverage: github

    # Summary and PR comment title. Use a distinct stable name for each test step and matrix scenario.
    # Default: `VM test results`
    report-name: VM test results

    # Optional path mappings forwarded to Hoverkraft's report parser.
    path-mapping: ""

    # Token for coverage PR comments. Requires pull-requests write; fork and Dependabot PR comments are skipped.
    # Default: `${{ github.token }}`
    github-token: ${{ github.token }}
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**                  | **Description**                                                                                            | **Required** | **Default**           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ | --------------------- |
| **`vm`**                   | Private runtime directory returned by vm/create.                                                           | **true**     | -                     |
| **`command`**              | Bash command or multiline commands to execute inside the guest from /tmp.                                  | **false**    | -                     |
|                            | Provide exactly one of command or test-script. Checkout files are not mounted in the guest.                |              |                       |
| **`test-script`**          | Nonempty Bash script in the checkout to send to the guest instead of command.                              | **false**    | -                     |
| **`test-timeout-minutes`** | Guest command timeout, from 1 to 40 minutes.                                                               | **false**    | `10`                  |
| **`report-file`**          | Optional report paths or glob patterns relative to the guest REPORTS_DIR.                                  | **false**    | -                     |
|                            | Separate patterns with newlines, commas or semicolons. Every pattern must match.                           |              |                       |
|                            | Commands receive a fresh REPORTS_DIR; matched files are collected even after test failure.                 |              |                       |
|                            | Report contents are preserved. Use only reports suitable for public CI.                                    |              |                       |
| **`coverage`**             | Coverage reporter; `github` for summaries and PR comments, `codecov` for upload,                           | **false**    | `github`              |
|                            | or empty to disable reporting. Report artifacts are always retained.                                       |              |                       |
|                            | Codecov requires report-file selection and id-token write permission for OIDC.                             |              |                       |
| **`report-name`**          | Summary and PR comment title. Use a distinct stable name for each test step and matrix scenario.           | **false**    | `VM test results`     |
| **`path-mapping`**         | Optional path mappings forwarded to Hoverkraft's report parser.                                            | **false**    | -                     |
| **`github-token`**         | Token for coverage PR comments. Requires pull-requests write; fork and Dependabot PR comments are skipped. | **false**    | `${{ github.token }}` |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->

## Outputs

| **Output**         | **Description**                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **`report`**       | Absolute path of the sanitized command-status JUnit report, including on assertion or collection failure.     |
| **`report-files`** | Newline-separated absolute paths of completed guest report files. Empty when collection is disabled or fails. |
| **`summary`**      | Parsed test and coverage summary in GitHub mode.                                                              |
| **`markdown`**     | Markdown used for the coverage PR comment in GitHub mode.                                                     |
| **`parsed-files`** | JSON array of report files parsed in GitHub mode.                                                             |
| **`artifact-id`**  | Uploaded report artifact identifier.                                                                          |

<!-- outputs:end -->
<!-- examples:start -->
<!-- examples:end -->
<!-- contributing:start -->
<!-- contributing:end -->
<!-- security:start -->
<!-- security:end -->
<!-- license:start -->
<!-- license:end -->
<!-- generated:start -->

---

This documentation was automatically generated by [CI Dokumentor](https://github.com/hoverkraft-tech/ci-dokumentor).

<!-- generated:end -->
