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

Run Ansible test playbooks and collection sanity with native reports, PR comments and artifacts.

Run Ansible tests with maintained upstream actions and native JUnit reports.

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
`inventory`, `ansible-config`, `collections-path` and `galaxy-requirements`
configure test execution. The action does not provision test environments.

Collection sanity uses the maintained Ansible community
[ansible-test action](https://github.com/ansible-community/ansible-test-gh-action),
which owns Python setup, test containers and native JUnit generation.
Its Ansible Core Git tag comes from the same requirements pin. Coverage is
disabled for sanity checks. The selected upstream revision pins nested actions
to full commit SHAs. Source stays in the consumer's checked-out collection.
Sanity covers all supported Python versions unless `target-python-version`
selects the consumer's supported runtime. These are sanity results, not code coverage.

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
test runner, Docker lifecycle or JUnit generator is maintained here.

Grant `pull-requests: write` for comments. Fork and Dependabot comments are skipped.
Never run untrusted tests through `pull_request_target`. Use distinct report names
for matrix entries.

<!-- overview:end -->
<!-- inputs:start -->

## Inputs

| **Input**                   | **Description**                                                                                                                    | **Required** | **Default**            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| **`ansible-requirements`**  | Checkout-relative requirements file containing exactly one stable ansible-core==X.Y.Z pin.                                         | **true**     | -                      |
| **`test-playbook`**         | Checkout-relative playbook containing test assertions. This playbook is executed. Supply test-playbook or collection, exclusively. | **false**    | -                      |
| **`collection`**            | One checked-out collection directory containing galaxy.yml. Use a matrix for multiple collections.                                 | **false**    | -                      |
| **`target-python-version`** | Optional Python major.minor for collection sanity checks. Empty tests all versions supported by Ansible Core.                      | **false**    | -                      |
| **`inventory`**             | Optional checkout-relative inventory file for test playbook execution.                                                             | **false**    | -                      |
| **`ansible-config`**        | Optional checkout-relative ansible.cfg file for test playbook execution.                                                           | **false**    | -                      |
| **`collections-path`**      | Optional checkout-relative first-party collection search directory containing ansible_collections.                                 | **false**    | -                      |
| **`galaxy-requirements`**   | Optional checkout-relative Galaxy requirements file for third-party role and collection dependencies.                              | **false**    | -                      |
| **`report-name`**           | Stable summary and PR comment title, distinct for each test step or matrix entry.                                                  | **false**    | `Ansible test results` |
| **`github-token`**          | Token for PR comments; requires pull-requests write. Fork and Dependabot comments are skipped.                                     | **false**    | `${{ github.token }}`  |

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
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/ansible/test@5c4b7307d7a2c58a01a3b62607cebde65f96b0a2 # 0.2.0
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

    # Optional checkout-relative inventory file for test playbook execution.
    inventory: ""

    # Optional checkout-relative ansible.cfg file for test playbook execution.
    ansible-config: ""

    # Optional checkout-relative first-party collection search directory containing ansible_collections.
    collections-path: ""

    # Optional checkout-relative Galaxy requirements file for third-party role and collection dependencies.
    galaxy-requirements: ""

    # Stable summary and PR comment title, distinct for each test step or matrix entry.
    # Default: `Ansible test results`
    report-name: Ansible test results

    # Token for PR comments; requires pull-requests write. Fork and Dependabot comments are skipped.
    # Default: `${{ github.token }}`
    github-token: ${{ github.token }}
```

<!-- usage:end -->
