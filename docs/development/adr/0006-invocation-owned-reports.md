# ADR 0006: Give each test invocation its own report

Date: 2026-10-28

Status: Accepted. Refines reporting for the focused actions in
[ADR 0004](0004-focused-vm-actions.md).

## Context

Multiple test steps can share a VM. Writing every result to the same checkout
file overwrites earlier evidence and makes consumers manage collision avoidance.
Checking whether that file exists cannot establish that the current write succeeded.

## Decision

Let `vm/test` allocate a private report directory under `runner.temp` for each
invocation. Remove its `report-directory` input. Export the exact file path only
after writing the complete sanitized JUnit result, including assertion failures.
Report write failures fail the step, remove partial output and expose no report.
Preserve earlier results. Workflows still own artifact publication and retention.

The local CLI retains its checkout-scoped `--report-directory` option, defaulting
to `.reports`, and prints each completed report path. Both entrypoints use the
same unique-directory and completed-output behavior.

## Consequences

CI callers consume the `report` output without selecting or scanning a directory.
Multiple results can be uploaded together or with distinct artifact names.
Reports survive VM cleanup. Runner temp bounds CI file lifetime; local reports
remain available until the user removes them. No raw guest output is collected.
