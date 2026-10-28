# ADR 0005: Use the GitHub Script runtime

Date: 2026-10-28

Status: Accepted. Supersedes the Python implementation choice in
[ADR 0004](0004-focused-vm-actions.md); the three action responsibilities remain.

Reporting ownership is superseded by [ADR 0009](0009-test-action-reporting.md).
Module ownership is refined by [ADR 0010](0010-action-module-ownership.md).
The local CLI interface is superseded by [ADR 0011](0011-github-actions-interface.md).

## Decision

Use pinned `actions/github-script` steps for VM creation, assertion execution and
destruction. Steps use the provided `core` helpers to publish outputs and fail
validation. Inputs pass through environment variables. Small CommonJS modules,
loaded from the action's own path, contain the reusable resource and assertion
logic. Local Make commands use those same modules through a Node.js CLI.

Use Node's built-in test runner and standard library. No npm install, dependency
bundle or compilation step is needed. Replace Python workflow checks as well, so
the validation path uses one scripting runtime.

## Consequences

CI uses the Node runtime supplied by GitHub Script; local runs require Node.js 24.
The supported script-loading and environment-input patterns come from
[GitHub Script's reference](https://github.com/actions/github-script/blob/v9.0.0/README.md).
Creation still exports its recovery directory before startup, and rolls back
partial resources. Failed assertions still export sanitized JUnit. Destruction
still verifies absence before removing keys. Workflows retain sequencing and
artifact publication.

VM commands use argument arrays without a shell, captured output, finite timeouts
and a forced kill signal. A 1 MiB output limit per stream prevents unbounded
buffering; excess output fails the operation. Raw command output and exceptions
never reach public logs or reports. Focused tests exercise the actual action script
entrypoints with injected Actions helpers and preserve the existing failure and
resource-ownership contracts.
