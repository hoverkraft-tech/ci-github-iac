# ADR 0010: Keep operation modules with their actions

Date: 2026-10-28

Status: Accepted. Refines module ownership in [ADR 0005](0005-native-action-scripting.md).

## Context

Modules at the VM action root obscured which action owned their behavior. The
runtime mixed guest creation with shared safety checks, while assertion and
report modules served only the test action and local CLI.

## Decision

Keep configuration validation and startup with rollback under `create/`. Keep
assertion execution and report collection under `test/`. Move the local CLI to
`bin/vm.cjs`, where it composes those operations with unconditional cleanup.

Retain only shared safety primitives in `actions/vm/_internal/`: bounded Lima
commands, private runtime ownership, verified deletion and checkout path
validation. Startup rollback and the destroy action use the same deletion code.
The internal modules are not a public API.

## Consequences

The three action contracts remain unchanged. Their implementations depend on the
repository's internal modules, so an action directory alone is not a portable
package. Consumers use the actions from the pinned repository.

Duplicating safety checks could let rollback and explicit deletion diverge.
Bundling would require a build and generated artifacts. Neither is justified
for this repository; native GitHub Script and local Node.js continue to load the
same source modules directly.
