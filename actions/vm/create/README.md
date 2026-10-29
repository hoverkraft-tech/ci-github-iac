<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItc2VydmVyIiBjb2xvcj0icHVycGxlIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PHJlY3QgeD0iMiIgeT0iMTQiIHdpZHRoPSIyMCIgaGVpZ2h0PSI4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48bGluZSB4MT0iNiIgeTE9IjYiIHgyPSI2LjAxIiB5Mj0iNiI+PC9saW5lPjxsaW5lIHgxPSI2IiB5MT0iMTgiIHgyPSI2LjAxIiB5Mj0iMTgiPjwvbGluZT48L3N2Zz4=) GitHub Action: VM - Create

<!-- header:end -->
<!-- badges:start -->

[![Marketplace](https://img.shields.io/badge/Marketplace-vm------create-blue?logo=github-actions)](https://github.com/marketplace/actions/vm---create)
[![Release](https://img.shields.io/github/v/release/hoverkraft-tech/ci-github-iac)](https://github.com/hoverkraft-tech/ci-github-iac/releases)
[![Stars](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)](https://img.shields.io/github/stars/hoverkraft-tech/ci-github-iac?style=social)

<!-- badges:end -->
<!-- overview:start -->

## Overview

Create an isolated Lima VM, rolling back resources if startup fails.

Create a disposable Lima guest and return its private runtime directory.

### Runner and configuration

Use an ephemeral Linux x86-64 runner with KVM, network access and `contents: read`.
Check out the consumer repository with `persist-credentials: false`. Reserve a
90-minute job timeout for installation, startup, testing and cleanup. Pin all
three VM actions to the same reviewed full commit SHA.

`vm-config` must point to an existing Lima YAML file within the checkout. Missing
or blank input fails before allocating a runtime. The consumer owns the image
and resource settings; no default configuration is supplied. The
[test fixture](../../../tests/fixture/lima.yml) provides a digest-pinned Ubuntu
example. Plain mode is enforced: host mounts, SSH agent forwarding and dynamic
port forwarding are disabled. Provisioning still runs, so treat configuration
and scripts as trusted repository code.

### Compose the VM actions

After checkout, create the guest, [run tests](../test/README.md) and
[destroy the guest](../destroy/README.md) in the same job:

```yaml
- name: Create VM
  id: vm
  uses: hoverkraft-tech/ci-github-iac/actions/vm/create@<reviewed-full-commit-sha>
  with:
    vm-config: tests/lima.yml
- name: Test VM
  uses: hoverkraft-tech/ci-github-iac/actions/vm/test@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
    command: test -d /run/systemd/system
    report-name: Infrastructure VM tests
- name: Destroy VM
  if: ${{ always() && steps.vm.outputs.vm != '' }}
  uses: hoverkraft-tech/ci-github-iac/actions/vm/destroy@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
```

Default GitHub reporting needs `pull-requests: write` for PR comments. Other
reporting modes and permissions are documented by `vm/test`. The maintained
[action-test workflow](../../../.github/workflows/__test-actions-vm.yml) also
covers failures and repeated tests. No consumer Makefile is required.

### Startup and cleanup

The action installs Lima and QEMU and allocates a private
`/tmp/iac-<uid>-<random>` runtime. It exports `vm` before starting the guest so
cleanup can retry after startup failure. Startup has an 11-minute subprocess
deadline and rolls back partial creation. The runtime is retained if rollback
cannot verify removal; keep the `always()` destruction step and let failures
fail the job. Never upload the runtime directory, which contains SSH keys and
VM state. Forced runner termination can interrupt cleanup; ephemeral runner
disposal bounds remaining resources. Persistent runners and cloud resources
are outside this action's scope.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/vm/create@081afc2fec975206110e367af328afdb7b681dce # feat/phase-1-bootstrap
  with:
    # Path to a Lima YAML file in the checkout. Plain mode is enforced.
    # This input is required.
    vm-config: ""
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**       | **Description**                                                   | **Required** | **Default** |
| --------------- | ----------------------------------------------------------------- | ------------ | ----------- |
| **`vm-config`** | Path to a Lima YAML file in the checkout. Plain mode is enforced. | **true**     | -           |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->

## Outputs

| **Output** | **Description**                                                                     |
| ---------- | ----------------------------------------------------------------------------------- |
| **`vm`**   | Private Lima runtime directory for subsequent VM actions; allocated before startup. |
| **`id`**   | Unique identifier for this invocation.                                              |

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
