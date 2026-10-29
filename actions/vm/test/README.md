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

### Execute guest commands

Pass the `vm` output of [vm/create](../create/README.md) from the same job and
exactly one of `command` or `test-script`. Commands accept a YAML multiline
block; a script must be a nonempty file within the checkout. Both execute in
guest Bash with `-euo pipefail`, through standard input, starting in `/tmp`.
Checkout files and host environment variables are not copied into the guest.
Use self-contained scripts or code prepared by Lima provisioning. Nonzero exit
or timeout fails the action; the timeout accepts 1 to 40 minutes, default 10.

Testing leaves the guest running for additional test steps. Always schedule
[vm/destroy](../destroy/README.md) afterward, including after test or reporting
failure. The [action-test workflow](../../../.github/workflows/__test-actions-vm.yml)
demonstrates composition and failure assertions.

### Collect test-generated reports

Configure test tools to write into the fresh guest directory in `REPORTS_DIR`.
Set `report-file` to relative paths or glob patterns, for example:

```yaml
report-file: |
  junit.xml
  coverage/*.info
```

Lists accept newlines, commas or semicolons. Basic `*`, `**`, `?` and character
class globs are supported. Use filenames containing letters, digits, spaces,
dots, underscores or hyphens. Absolute paths and parent traversal are rejected;
symbolic links are excluded. Every pattern must match a nonempty regular file.
Collection is limited to 100 files, 20 MiB total and two minutes. Guests need
Bash, GNU find and an SSH file-copy service, as provided by the Ubuntu fixture.

Collection is attempted after command failure or timeout, then the guest report
directory is removed. Missing files, incomplete transfers and cleanup errors
fail the action. An incomplete collection exports no guest files. Completed
files retain their relative names in an isolated host directory; `report-files`
lists their absolute paths. See the [success](../../../tests/fixture/assert.sh)
and [failure](../../../tests/fixture/fail.sh) fixtures for report examples.

Each invocation keeps separate reports under `runner.temp`; later calls preserve
earlier results. `report` is a sanitized command-status JUnit file without raw
command output or exceptions. Only completed files are exported; failed writes
discard partial output and preserve completed guest reports. Collected tool
reports retain their original contents. Use synthetic data and exclude secrets,
environment dumps and private logs from reports published by public workflows.

### Publish results

| `coverage`         | Behavior                                   | Job permission                      |
| ------------------ | ------------------------------------------ | ----------------------------------- |
| `github` (default) | Summaries, annotations and PR comments     | `pull-requests: write` for comments |
| `codecov`          | Upload selected guest reports through OIDC | `id-token: write`                   |
| `""`               | Skip parsing, comments and Codecov         | No additional permission            |

GitHub mode uses Hoverkraft's `parse-ci-reports` and `create-or-update-comment`
actions. It parses collected files, falling back to the command-status report
when none are available. `path-mapping` translates guest paths to checkout paths;
`summary`, `markdown` and `parsed-files` expose parser results. The parser manages
its own dependencies.

Choose a distinct, stable `report-name` for each test step and matrix scenario.
Reruns update the matching comment. `github-token` defaults to `github.token`.
Comments are limited to same-repository pull requests, excluding Dependabot;
forks still receive summaries and artifacts. Do not use `pull_request_target`
to execute untrusted tests.

Codecov mode requires a repository enabled in Codecov and explicit `report-file`
selection. Discovery is disabled: only collected guest files are uploaded, never
the command-status wrapper. Configure Codecov path fixes when guest source paths
differ from repository paths. Upload errors fail the action.

Every mode uploads completed reports as a GitHub artifact with a unique name and
seven-day retention; `artifact-id` identifies the upload. Upload still runs after
parser, comment or Codecov errors. Test and reporting failures remain failures.
No extra reporting steps are needed in the workflow.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/vm/test@5c4b7307d7a2c58a01a3b62607cebde65f96b0a2 # 0.2.0
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
