# ADR 0011: Expose VM operations through GitHub Actions

Date: 2026-10-29

Status: Accepted. Supersedes the local CLI interface in
[ADR 0005](0005-native-action-scripting.md) and
[ADR 0010](0010-action-module-ownership.md).

## Decision

Expose VM creation, testing and destruction through the three GitHub Actions.
Remove `bin/vm.cjs`, its command-line options and the local `make e2e` targets.
Consumers no longer fetch a source checkout through `make setup`.

Keep Node.js unit tests for action entrypoints and internal modules. Keep hosted
VM integration scenarios for success, assertion failure, reporting failure and
startup rollback. Consumer workflows pin all three actions to the same revision.

## Consequences

The repository maintains one public execution interface. VM scenarios run on
GitHub Actions runners; local development uses unit tests and static checks.
Workflow composition owns cleanup attempts, including retries on the same runner.
Action inputs, outputs, report handling and verified deletion remain unchanged.

Remove CLI-specific tests and current usage instructions. Preserve action-level
coverage for failed report writes, checkout boundaries and repeated destruction.
