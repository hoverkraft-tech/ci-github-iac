# ADR 0002: Shared action owns the VM lifecycle

Date: 2026-10-28

Status: Accepted. Supersedes the four-target interface in
[ADR 0001](0001-vm-extraction.md); workstation migration gates remain unchanged.

Runtime implementation is superseded by [ADR 0005](0005-native-action-scripting.md).

## Context

Calling consumer Make targets delegated VM implementation to every repository.
The workflow provided sequencing but could not guarantee shared startup,
reporting or deletion behavior. The user requested an action that supplies this
implementation while consumers describe their scenario.

## Decision

Provide `actions/vm-e2e` as a composite action. It owns Lima installation, a
private runtime per invocation, startup, bounded guest execution, sanitized
reports and verified cleanup. Consumers supply a Bash assertion script and an
optional Lima configuration. The workflow resolves this action with `$/` at its
own revision, independently of the consumer checkout. Local Make commands call
the action's Python implementation without lifecycle callbacks.

Use the existing Python backend and Lima template. Keep scenario code in each
consumer. Preserve cleanup attempts after failures and require real hosted
success and deliberate-failure scenarios, including a consumer without a Makefile.

## Consequences

Consumers no longer implement VM management or report serialization. The initial
interface executes one self-contained guest script and reports its exit status
as one JUnit case. More detailed scenario reporting and the workstation's
credential-scoped stages remain outside this change. Plain mode and synthetic
fixtures keep this contract limited to disposable runner-local resources.

The Lima version moves into action metadata. Renovate follows that file and no
longer requests workflow-write permission for the Lima pin.

References: [GitHub same-repository action references](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#example-using-an-action-in-the-same-repository-as-the-workflow-at-the-running-commit-recommended),
[Lima guest shell](https://lima-vm.io/docs/reference/limactl_shell/),
[Lima plain mode](https://lima-vm.io/docs/config/plain/).

## Supersession

[ADR 0003](0003-direct-action-consumption.md) replaces the public workflow wrapper
with direct action calls. The action-owned lifecycle remains unchanged.

## Responsibility split

The combined action boundary is superseded by [ADR 0004](0004-focused-vm-actions.md).
