# ADR 0004: Separate VM action responsibilities

Date: 2026-10-28

Status: Accepted. Supersedes the combined action boundary in
[ADR 0003](0003-direct-action-consumption.md) and
[ADR 0002](0002-action-owned-vm-lifecycle.md).

## Decision

Expose `vm/create`, `vm/test` and `vm/destroy` as separate actions. Creation owns
installation, allocation and startup rollback. Testing owns guest assertions and
their sanitized JUnit result. Destruction owns verified removal of the guest and
its private runtime. Pass the runtime directory explicitly between actions.

Workflows own sequencing, failure conditions and artifact publication using the
existing upload action. Remove the combined action. Keep no public forwarding
workflow or consumer Make callbacks. Split the Python implementation into VM
resource management, assertion execution and a command entrypoint; only the local
`run` command composes the complete lifecycle.

## Consequences

Callers can create a VM without supplying tests, execute multiple test steps,
and inspect the guest before destruction. They must explicitly schedule cleanup
with `always()` and pin all shared actions to one revision. Startup rolls back
its own partial resources, including when called outside a workflow.

Publication policy belongs to the workflow. The former `vm.json` record merely
repeated successful deletion; the destruction outcome and `removed` output now
provide that evidence without coupling VM management to report files. JUnit
remains the sanitized assertion artifact. Cleanup precedes upload, so publication
failure cannot prevent deletion. Failed deletion retains the runtime for retry.

The accepted direct-consumption decision remains: no forwarding workflow is
reintroduced. Shared unit contracts and hosted composition tests cover success,
assertion failure, startup rollback, output handoff and explicit destruction.
