# ADR 0002: Direct QEMU and runner-side VM tests

Date: 2026-10-31

Status: Proposed; hosted shared-action and consumer validation required before merge.

## Context

The Proxmox installation consumer needs direct QEMU because its nested Lima
installation timed out on GitHub-hosted runners. Its working direct-QEMU
implementation duplicates VM lifecycle and reporting responsibilities assigned
to this repository by [ADR 0001](0001-vm-actions.md).

## Decision

Extend the existing VM actions with an explicit QEMU backend while retaining Lima
as the default. Creation validates a required JSON configuration, provisions only
private files, waits for unattended ISO power-off when applicable, boots the system
disk and establishes SSH readiness. A verified QCOW2 image and cloud-init seed also
support generic hosted action qualification without importing a consumer scenario.

Reuse Lima's maintained setup action for host packages. It also installs Lima,
but the QEMU backend starts no Lima guest. Keep lifecycle implementation beside
create, tests beside test, and bounded commands, process ownership and verified
cleanup in the existing internal safety modules. No arbitrary QEMU flags are exposed.

Allow runner-side test tools to target the returned private SSH configuration.
Both execution locations reuse the same report collection limits and publication
pipeline. Consumers retain platform assertions, application readiness checks and
synthetic installation inputs. VM actions own no Proxmox configuration.

## Consequences

This is an additive contract, requiring a minor release. The three actions remain
pinned together. QEMU requires Linux x86-64, KVM, UEFI firmware and disk-backed
storage. Only loopback SSH is forwarded; no host disk or mount is exposed. Runtime
files remain private and are removed only after process ownership and termination
are verified. Download authenticity and guest provisioning remain consumer concerns.

The setup dependency installs an unused Lima binary for QEMU consumers. Reusing
its maintained host setup avoids adding another installation implementation.
Forced runner termination still relies on ephemeral runner disposal for cleanup.
