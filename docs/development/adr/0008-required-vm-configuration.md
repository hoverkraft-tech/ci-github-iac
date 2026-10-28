# ADR 0008: Require consumer-owned VM configuration

Date: 2026-10-28

Status: Accepted. Refines [ADR 0004](0004-focused-vm-actions.md) and the bundled
guest assumption in [ADR 0007](0007-guest-report-collection.md).

## Decision

Require `vm-config` on `vm/create` and `--vm-config` on local runs. Validate an
existing checkout file before allocating a VM runtime. Remove the implicit
Ubuntu configuration from the action; retain it only as an explicit test fixture.

Consumers own their images, resource settings and provisioning. Both CI and local
commands pass the same repository configuration. The action continues to enforce
plain mode and owns creation and rollback, independent of the chosen guest.

## Consequences

Callers must supply configuration even for a basic Ubuntu scenario. This avoids
coupling the reusable action to one operating system or resource budget. Consumer
repositories maintain their own image pins and the guest tools needed by their
assertions and report collection. Cleanup remains independent of configuration.
