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

Validate playbook syntax and collection sanity, publish reports and annotate pull requests.

Validate Ansible playbooks and first-party collections in a consumer tooling image.

### Run checks

Check out the consumer and build or pull its tooling image before this action.
The Linux runner needs Docker. The image must provide `/bin/sh`, `ansible-playbook`,
`ansible-test` and `python3`, with the consumer's pinned dependencies installed.
No Makefile or reporting script is required. The image's entrypoint is replaced.

```yaml
- name: Test Ansible
  uses: hoverkraft-tech/ci-github-iac/actions/ansible/test@d2673efa2d13247d9a7ccf9fc2b6876fbf2d3435
  with:
    container-image: my-project-tooling:local
    playbooks: ansible/site.yml
    inventory: ansible/inventory.example.yml
```

Supply newline-separated `playbooks`, `collections`, or both. Paths are explicit
checkout-relative paths, without globs. Inventory is optional; when omitted,
Ansible uses the image's configuration. Missing, empty and escaping paths fail.
Collection roots must follow `ansible_collections/namespace/name` layout.

Each playbook runs with `ansible-playbook --syntax-check`. Each collection runs
with `ansible-test sanity --python` using the image's Python version. Checks
continue after a nonzero exit so all selected targets receive a result. Each
command has a 20-minute timeout. Interrupted containers are forcibly removed.
These checks do not apply playbooks or measure code coverage; integration and
deployment scenarios remain in the consumer.

The checkout is mounted at `/workspace` and commands start there (sanity starts
in its collection directory). Containers run with the runner's UID/GID and a
temporary home. Use `environment` for Ansible configuration, for example
`ANSIBLE_COLLECTIONS_PATH=/opt/ansible/collections:/workspace/ansible/collections`.
Image environment defaults remain available. Runner secrets are not forwarded.

`cache-directory` optionally mounts a checkout-local directory for ansible-test
virtual environments. Restore/save it with `actions/cache`, keyed by the tooling
runtime. The action does not cache source files or reports. Sanity's normal
`tests/output/` files remain in each collection and are not uploaded.

### Publish results

The action writes fresh JUnit status results for every executed check and SARIF
locations for syntax failures under `runner.temp`. Raw command output remains
in execution logs; report artifacts contain status and file locations only.
Hoverkraft's parser publishes summaries and annotations. PR comments use a
stable `report-name` and require `pull-requests: write`; forks and Dependabot
skip comments. Never use `pull_request_target` to execute untrusted tests.

Completed reports are uploaded with unique artifact names and seven-day
retention, including after checks or report publication fail. Neither a parser
nor an upload can turn failed checks into success. Use a distinct report name
for each invocation. Reports describe validation results, not code coverage.

<!-- overview:end -->
<!-- inputs:start -->

## Inputs

| **Input**             | **Description**                                                                                                            | **Required** | **Default**            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- |
| **`container-image`** | Built or pulled tooling image containing Ansible and the consumer's dependencies.                                          | **true**     | -                      |
| **`playbooks`**       | Newline-separated nonempty playbook files relative to the checkout. Supply playbooks or collections.                       | **false**    | -                      |
| **`inventory`**       | Optional inventory file relative to the checkout for syntax validation.                                                    | **false**    | -                      |
| **`collections`**     | Newline-separated first-party collection directories relative to the checkout for sanity validation.                       | **false**    | -                      |
| **`environment`**     | Newline-separated ANSIBLE_* assignments using container paths. ANSIBLE_HOME and ANSIBLE_NOCOLOR are managed by the action. | **false**    | -                      |
| **`cache-directory`** | Optional checkout-relative directory for ansible-test virtual environments; manage persistence with actions/cache.         | **false**    | -                      |
| **`report-name`**     | Stable summary and PR comment title, distinct for each test step.                                                          | **false**    | `Ansible test results` |
| **`github-token`**    | Token for PR comments; requires pull-requests write. Fork and Dependabot comments are skipped.                             | **false**    | `${{ github.token }}`  |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->

## Outputs

| **Output**         | **Description**                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **`report-files`** | Newline-separated absolute paths of completed JUnit and SARIF reports, also after check failure. |
| **`summary`**      | Parsed validation summary.                                                                       |
| **`markdown`**     | Markdown used for the PR comment.                                                                |
| **`parsed-files`** | JSON array of parsed report paths.                                                               |
| **`artifact-id`**  | Uploaded report artifact identifier.                                                             |

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
