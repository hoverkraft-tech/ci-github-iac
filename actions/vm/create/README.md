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

Create an isolated disposable VM, rolling back resources if startup fails.

Create a disposable Lima or direct-QEMU guest and return its private runtime directory.

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
cleanup can retry after startup failure. Startup defaults to ten minutes, with
one additional minute for the subprocess deadline; `startup-timeout-minutes`
allows longer provisioning. Failed startup rolls back partial creation.
The runtime is retained if rollback
cannot verify removal; keep the `always()` destruction step and let failures
fail the job. Never upload the runtime directory, which contains SSH keys and
VM state. Forced runner termination can interrupt cleanup; ephemeral runner
disposal bounds remaining resources. Persistent runners and cloud resources
are outside this action's scope.

Host-side test tools can use the returned `name` with `LIMA_HOME` set to `vm`.
Keep their SSH configuration private. If a scenario creates external resources,
verify its cleanup before calling `vm/destroy`; destruction cannot verify
application-specific resources such as remote browser devices.

### Direct QEMU

Set `backend: qemu` for an unattended installer that cannot run inside a Lima
guest. QEMU runs directly on the runner using KVM, UEFI and a private raw disk
under `/var/tmp/iac-qemu-<uid>-<random>`. Lima's maintained setup action installs
the host dependencies; this backend does not start a Lima guest.
Supply a JSON `vm-config` with explicit resources, media, network and SSH identity:

```json
{
  "cpus": 2,
  "memoryMiB": 4096,
  "diskGiB": 32,
  "diskSerial": "TEST_DISK",
  "iso": ".local/test/installer.iso",
  "network": {
    "subnet": "192.0.2.0/24",
    "address": "192.0.2.10",
    "gateway": "192.0.2.1",
    "dns": "192.0.2.2",
    "mac": "02:00:00:00:00:01"
  },
  "ssh": { "user": "root", "privateKey": ".local/test/key" }
}
```

All media and keys must be regular checkout files. Use synthetic credentials.
Consumers verify downloads and prepare the ISO's unattended answer with matching
network, disk serial and SSH public key. The installer must power off on success;
the action then boots the installed disk without the ISO and waits for SSH.
Alternatively replace `iso` with a trusted `image` (QCOW2), optionally supplying
a cloud-init `seed` ISO. The image is converted to a private raw disk, then resized.
Images must fit diskGiB. No arbitrary QEMU arguments or host disks are accepted.
Limits are 1–16 CPUs, 1–65536 MiB memory and 1–128 GiB disk. The runner must have
sufficient disk-backed storage and memory. Network addresses must be distinct
hosts in the supplied IPv4 subnet (prefix 8–30); MAC addresses start with `02`.

SSH is exposed on a dynamically allocated loopback port, with a private key and
known-hosts file. Initial trust is confined to that owned endpoint; later calls
require the recorded host key. Use `ssh -F <ssh-config> iac-test` for host tools.
One startup deadline covers preparation, installation and SSH readiness. Startup
failure attempts verified rollback; always schedule `vm/destroy` to retry cleanup.
Reports belong to `vm/test`; no raw console logs, keys or VM state are published.
Application readiness checks remain in consumer tests.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/vm/create@5c4b7307d7a2c58a01a3b62607cebde65f96b0a2 # 0.2.0
  with:
    # VM backend, lima or qemu. QEMU boots directly on the runner with UEFI and KVM.
    # Default: `lima`
    backend: lima

    # Checkout configuration file. Lima uses YAML in plain mode; QEMU uses the JSON schema described above.
    # This input is required.
    vm-config: ""

    # Guest startup timeout, from 1 to 40 minutes. The subprocess deadline includes one additional minute.
    # Default: `10`
    startup-timeout-minutes: "10"
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**                     | **Description**                                                                                       | **Required** | **Default** |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| **`backend`**                 | VM backend, lima or qemu. QEMU boots directly on the runner with UEFI and KVM.                        | **false**    | `lima`      |
| **`vm-config`**               | Checkout configuration file. Lima uses YAML in plain mode; QEMU uses the JSON schema described above. | **true**     | -           |
| **`startup-timeout-minutes`** | Guest startup timeout, from 1 to 40 minutes. The subprocess deadline includes one additional minute.  | **false**    | `10`        |

<!-- inputs:end -->
<!-- secrets:start -->
<!-- secrets:end -->
<!-- outputs:start -->

## Outputs

| **Output**       | **Description**                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **`ssh-config`** | Private SSH configuration for either backend, using the returned name as host alias. Never upload it. |
| **`vm`**         | Private runtime directory for subsequent VM actions; allocated before startup.                        |
| **`id`**         | Unique identifier for this invocation.                                                                |
| **`name`**       | Instance name. Lima tools also need LIMA_HOME set to vm; QEMU tools use ssh-config.                   |

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
