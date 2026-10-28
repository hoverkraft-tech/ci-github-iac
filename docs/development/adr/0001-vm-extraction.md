# ADR 0001: Workstation extraction boundary

Date: 2026-10-28

Status: Proposed; workstation migration requires behavior-parity evidence.
The four-target interface is superseded by [ADR 0002](0002-action-owned-vm-lifecycle.md).

## Evidence

Audited neilime/workstation-manager at
`7272c06a8eba48fa5d4a9ff3b83f2155e0385696`.
Its Make targets create a Lima/QEMU VM, run nine ordered backup/setup/cleanup
stages, finish fixtures and delete the VM. `e2e-test` sequences those stages
locally; CI calls each stage explicitly with a shared 35-minute assertion deadline.
There is no separate `e2e-collect` target.

CI requires Linux x86-64, KVM, QEMU, Lima, Docker and network access. Desktop image
preparation uses libguestfs, dhcpcd-base and readable host kernels. CI allocates
4 CPUs and 8 GiB to the VM, builds a public offline desktop image, verifies its
checksum, and caches it before authenticated operations. Local defaults are
2 CPUs, 6 GiB and a 40 GiB disk.

Live Bitwarden and private GitHub credentials are scoped to the stages that need
them. Setup additionally uses the short-lived GHCR job token. JUnit parsing and
desktop screenshot upload run after failures. Fixture finishing has an always
condition; VM teardown has a separate always condition after artifact handling.
Teardown resumes stopped guests, removes captured browser devices from their
remote Sync chains, verifies removal, then deletes the VM. Failed remote-device
removal retains VM identities for recovery; ephemeral runners nevertheless expire.
Blind force deletion would lose recovery information without removing those devices.

## Decision

Extract the four-target lifecycle, independent operation timeouts, collection on
failure and verified teardown into a reusable workflow. Start with a credential-free
fixture that owns only runner-local resources. Its dedicated Lima home cannot
target an existing workstation VM. Use plain mode without host filesystem mounts.

Keep workstation's authenticated scenario, offline-image preparation, caches and
browser recovery policy in the consumer. Do not migrate its production workflow
until credential scoping, nine-stage parity, screenshot/report handling and
retention behavior can be demonstrated. The initial workflow is credential-free;
it does not yet satisfy that migration gate.

## Consequences

The first workflow proves real boot/assert/delete behavior without cloud spend or
external account mutations. The hosted runner lifetime bounds leftover local VM
resources. Cloud TTL reaping and nested Proxmox need separate adapters and tests.
The initial fixture does not simulate an application, connector or LLM; those
belong to later application scenarios, where stubs replace paid services.

Sources: [workstation workflow](https://github.com/neilime/workstation-manager/blob/7272c06a8eba48fa5d4a9ff3b83f2155e0385696/.github/workflows/__shared-ci.yml),
[teardown](https://github.com/neilime/workstation-manager/blob/7272c06a8eba48fa5d4a9ff3b83f2155e0385696/e2e-tests/e2e-down.sh),
[Lima plain mode](https://lima-vm.io/docs/config/plain/),
[Ubuntu images](https://cloud-images.ubuntu.com/releases/resolute/).
