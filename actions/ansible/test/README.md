<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: Ansible - Test

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-ansible------test-blue?logo=github-actions)](https://github.com/marketplace/actions/ansible---test)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Compose official Ansible syntax and sanity actions with Hoverkraft reports, PR comments and artifacts.

Validate Ansible by composing maintained upstream actions and Hoverkraft reporting.

### Run checks

Check out the consumer on a fresh Linux GitHub-hosted runner. Provide the existing
requirements file containing an exact `ansible-core==X.Y.Z` pin and either
newline-separated playbook files or one collection directory. Use a workflow
matrix for multiple collections. No consumer Make target or tooling image is needed.

Playbook validation uses [Ansible Lint](https://github.com/ansible/ansible-lint)
with its `min` profile: content loading, parsing and native syntax checks. It
produces SARIF directly. A uv constraint keeps Ansible Core at the consumer's
pinned version. `galaxy-requirements` installs the consumer's role/collection
dependencies; `collections-path` adds first-party collections to the search path.

Collection validation uses the maintained Ansible community
[ansible-test action](https://github.com/ansible-community/ansible-test-gh-action).
It owns Python setup, the test container and native sanity/JUnit generation.
The selected upstream revision pins its nested actions to full commit SHAs,
matching consumers that enforce transitive action pinning.
Its Ansible Core Git tag is derived from the same requirements pin. Coverage is
disabled for sanity checks. Source stays in the consumer's checked-out collection.
The upstream actions select their supported Python runtime; these checks do not
reuse the consumer's deployment image or apply playbooks. Keep integration and
deployment scenarios in the consumer.

Paths must stay inside the checkout and use letters, digits, dots, underscores,
hyphens and slashes. Explicit files are required; expand playbook globs in the
workflow if needed. Each collection needs `galaxy.yml`. Use a fresh checkout per
collection job so native `tests/output/junit` contains only that run's reports.

### Publish results

Native SARIF and JUnit files are parsed with Hoverkraft's `parse-ci-reports`,
published as summaries and annotations, and attached to a stable PR comment.
Native reports preserve upstream diagnostics; use synthetic data suitable for
the repository's visibility. The collection action also publishes its own summary.

Report collection runs after upstream failures, including when the upstream
action does not export its report output. Available files are copied to a fresh
directory under `runner.temp` and uploaded with a unique artifact name and
seven-day retention, including after parsing or commenting errors. Missing
reports fail the action. Failed checks remain failures. No custom test runner,
Docker lifecycle or JUnit/SARIF generator is maintained here.

Grant `pull-requests: write` for comments. Fork and Dependabot comments are skipped.
Never run untrusted checks through `pull_request_target`. Use distinct report
names for matrix entries. Syntax and sanity results are not code coverage.

<!-- overview:end -->
<!-- inputs:start -->

## Inputs

| **Input**                  | **Description**                                                                                         | **Required** | **Default**            |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| **`ansible-requirements`** | Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.              | **true**     | -                      |
| **`playbooks`**            | Newline-separated playbook files relative to the checkout. Supply playbooks or collection, exclusively. | **false**    | -                      |
| **`collection`**           | One checked-out collection directory containing galaxy.yml. Use a matrix for multiple collections.      | **false**    | -                      |
| **`inventory`**            | Optional checkout-relative inventory file for syntax validation.                                        | **false**    | -                      |
| **`ansible-config`**       | Optional checkout-relative ansible.cfg file for syntax validation.                                      | **false**    | -                      |
| **`collections-path`**     | Optional checkout-relative first-party collection search directory containing ansible_collections.      | **false**    | -                      |
| **`galaxy-requirements`**  | Optional checkout-relative Galaxy requirements file for third-party role and collection dependencies.   | **false**    | -                      |
| **`report-name`**          | Stable summary and PR comment title, distinct for each test step or matrix entry.                       | **false**    | `Ansible test results` |
| **`github-token`**         | Token for PR comments; requires pull-requests write. Fork and Dependabot comments are skipped.          | **false**    | `${{ github.token }}`  |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->

## Outputs

| **Output**         | **Description**                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **`report-files`** | Newline-separated absolute paths of completed native reports, including after check failure. |
| **`summary`**      | Parsed validation summary.                                                                   |
| **`markdown`**     | Markdown used for the PR comment.                                                            |
| **`parsed-files`** | JSON array of parsed report paths.                                                           |
| **`artifact-id`**  | Uploaded report artifact identifier.                                                         |

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
