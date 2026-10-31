# ADR 0003: Opinionated VM verification

Status: Accepted

## Context

Consumer VM tests duplicated tool installation, SSH setup and lifecycle assertions.
The existing VM actions provide lifecycle and reporting, but arbitrary commands
alone leave each consumer to implement a testing harness. This extends
[ADR 0001](0001-vm-actions.md) and [ADR 0002](0002-direct-qemu.md).

## Decision

Use Goss as the declarative state verifier in vm/test. Pin its release with an
archive checksum, render the consumer suite and variables, execute in the guest
and publish native JUnit. Empty suites fail. Initially support the existing Linux
x86-64 runner and guest contract. Keep commands for procedural tests.

Use maintained Molecule in ansible/test for Ansible-native deployment scenarios.
Generate inventory from the owned VM runtime. Supply a base sequence for readiness,
convergence, verification, idempotence, reboot and repeated verification. Consumers
own the actual playbooks and can customize Molecule's documented sequence.
VM actions retain creation/destruction ownership; linting remains separate.
Expose an SSH configuration consistently across Lima and QEMU.

## Consequences

Shared releases deliver execution and reporting improvements to consumers. Goss
runs inside the guest and requires file transfer; Molecule runs in an isolated
runner Python environment. Each retains its native test language. No new scenario
DSL or consumer Make interface is introduced. Custom procedural tests remain
supported. Validate the Proxmox pilot and both backends before wider adoption.

Testinfra was considered because workstation-manager already uses it; its upstream
[maintenance notice](https://github.com/pytest-dev/pytest-testinfra) on 2026-10-31
states that it is not actively maintained. Existing suites can remain during
incremental adoption, but it is not the new shared default.
