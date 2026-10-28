# ADR 0007: Collect guest reports and reuse Hoverkraft reporting

Date: 2026-10-28

Status: Accepted. Extends [ADR 0006](0006-invocation-owned-reports.md).
The bundled guest assumption is superseded by [ADR 0008](0008-required-vm-configuration.md).

Reporting ownership is superseded by [ADR 0009](0009-test-action-reporting.md).

## Decision

Follow the report-selection and shared-parser pattern in
[Hoverkraft's Node.js test action](https://github.com/hoverkraft-tech/ci-github-nodejs/blob/1f81dd00d941680ab227a6eae5378790d6242e02/actions/test/action.yml).
Add optional `report-file` selection to `vm/test` and the local CLI. Allocate a
fresh guest `REPORTS_DIR`, collect explicitly matched regular files even when
assertions fail, and export completed files through `report-files`. Preserve the
separate sanitized command-status `report` output.

Keep selection, bounded transfers and guest report cleanup in `GuestReports`.
VM lifecycle stays in its existing actions. Workflows use the existing
`parse-ci-reports` action after VM destruction for summaries and annotations,
then upload both status and framework reports. Parse framework reports when
available to avoid counting the command wrapper as another framework test.

## Consequences

Consumers configure test tools to write into `REPORTS_DIR`. Selection is scoped
to that directory, excludes symlinks and fails on missing or empty matches.
Transfers are limited to 100 files, 20 MiB and two minutes. Failed collections
publish no partial file set; completed reports survive subsequent status-write
failures. The bundled guest supplies GNU find and SSH file copying.

Framework reports retain their original contents and must be suitable for public
CI. This extends the previously generated-only artifact contract; raw command
logs remain suppressed. Path mapping belongs to the shared parser. No custom
report parser, coverage service or automatic PR comment publisher is introduced.
