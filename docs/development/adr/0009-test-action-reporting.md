# ADR 0009: Compose test execution and reporting in vm/test

Date: 2026-10-28

Status: Accepted. Supersedes workflow-owned reporting in ADRs 0004–0007.

## Decision

Follow [Hoverkraft's Node.js test action](https://github.com/hoverkraft-tech/ci-github-nodejs/blob/1f81dd00d941680ab227a6eae5378790d6242e02/actions/test/action.yml):
the test action runs tests and composes existing report actions. Accept either
multiline guest `command` input or a checkout `test-script`, with no default test.
Keep guest execution, file collection and VM lifecycle in their focused modules.

Default `coverage: github` reuses Hoverkraft parsing and comment actions. Optional
`coverage: codecov` uses the same pinned Codecov uploader as the reference, passing
only explicitly collected files with discovery disabled. The Node.js wrapper
cannot accept an explicit file list, so the uploader is composed directly.
Empty coverage mode skips both reporters. All modes retain completed report
artifacts under unique invocation names for seven days.

## Consequences

Consumers configure tests and permissions without duplicating reporting steps.
Stable, distinct report names identify PR comments across reruns and matrix jobs.
Fork and Dependabot comments are skipped because their tokens lack write access.
Codecov requires report selection, an enabled Codecov repository and OIDC access.

Parsing, comments and upload run after test failure. Failures remain visible;
artifact upload is attempted even if another reporter fails. Workflows still own
creation and `always()` destruction, which now follows reporting. The VM remains
available for subsequent test steps. Local CLI runs collect files without CI
publication. Existing isolation, collection limits and public-safe report
requirements remain in force.
