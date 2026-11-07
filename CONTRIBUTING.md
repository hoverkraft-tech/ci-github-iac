# Contributing

Use the [common commit process](https://github.com/hoverkraft-tech/ci-github-common/blob/9e235e87e1da898e33689b346590dfc69b45b0a6/docs/usage/commits.md)
for commit messages, PR titles and dependency updates.

## Make and workflow conventions

Follow the [Hoverkraft Makefile](https://github.com/hoverkraft-tech/ci-github-container/blob/main/Makefile)
and [workflow layout](https://github.com/hoverkraft-tech/ci-github-container/tree/main/.github/workflows).
Use annotated Make targets for generated help and a shared `run_linter` helper
for `lint` and `lint-fix`. The container uses Linux amd64, the caller's UID/GID,
and the checkout's absolute path for its workspace. A failed image build stops
the command before linting.

`make help` lists commands. `make lint-fix` applies supported automatic fixes;
`make lint docs/` limits linting to matching paths. Positional filters are accepted
only for lint commands; unknown standalone targets still fail. `make ci` runs
`lint-fix` and unit tests locally. VM integration tests run in hosted action-test workflows.

Internal `__main-ci.yml` and `__pull-request-ci.yml` call `__shared-ci.yml`.
Main supports pushes and manual runs; PR CI also supports merge queues. Both
cancel superseded runs for the same workflow and ref. Each public action has a
dedicated test workflow, with backend and scenario variants inside it. Other actions
provide fixture setup or cleanup; assertions verify the action named by the workflow.
Consumers compose the same actions in their VM jobs.
Use `test-action-` caller IDs in `__shared-ci.yml`, following ci-github-common.
Keep additional JavaScript unit checks in the owning action's workflow through
`ci-github-nodejs/actions/test`, using the action's directory as `working-directory`,
alongside its integration scenarios. Shared CI
composes those workflows; `make test` is a local convenience.
Name test steps `Arrange - ...`,
`Act - ...` and `Assert - ...`; place assertions next to the behavior they verify.
Use explicit `Cleanup - ...` steps with `always()` for fixture teardown, even when
an action or assertion fails. Repeat Act/Assert pairs for independent cases sharing
the same fixture; repeated calls may form one Act phase when testing report isolation.
Workflows start with `permissions: {}` and grant only the permissions required by
each job. Keep Actions pinned and step names descriptive.

## Repository automation

Keep the five Hoverkraft maintenance workflows alongside the CI entrypoints:

- `__greetings.yml` welcomes first-time contributors on new issues and PRs.
- `__need-fix-to-issue.yml` turns fix markers into issues after main pushes, or
  for a manually selected commit range.
- `__semantic-pull-request.yml` validates Conventional Commit PR titles.
- `__renovate.yml` runs dependency updates weekly and on manual dispatch.
- `__stale.yml` manages inactive issues and PRs daily using shared defaults.

The four collaboration workflows reuse the pinned ci-github-common workflows.
Renovate uses the organization's `CI_BOT_APP_CLIENT_ID` Actions variable and
`CI_BOT_APP_PRIVATE_KEY` Actions secret. Its GitHub App must be installed on this
repository with the permissions requested by the token-generation step.
The internal `tests/fixture/prepare-vm` action prepares synthetic VM configurations
without starting guests or asserting action behavior. Keep its Ubuntu image URL and
checksum aligned with `tests/fixture/lima.yml`.

The Lima version is maintained in `actions/vm/create/action.yml`.
Keep the token scoped to this repository and the repository configuration in
`.github/renovate.json`. Dependabot owns Actions, Dockerfile, Python and action
test-package updates;
Renovate owns Lima, Goss, the documentation image and the action `.node-version`
files, grouping Node.js runtime updates in one pull request.

## Validation

Use Node.js 24.8 or later locally; hosted unit jobs use each action's `.node-version`.
Run `make test` with Node.js's built-in test runner for focused validation and
failure cases, `make lint` for the Hoverkraft containerized linter, and the hosted
action-test workflows for actual
VM behavior. PR CI verifies action outcomes across successful assertions, failed
assertions and failed startup, without a consumer Makefile. It repeats tests on
the same guest to verify independent reports, collects native Goss JUnit
after assertion failures, and verifies action-owned parsing, summaries and
artifact uploads. PR comments reuse stable titles; fork and Dependabot runs skip
comments. Tests inspect native report files and GitHub artifacts directly, and
check published summaries through PR comments when comments are enabled.
Consumer workflows grant comment permissions and always schedule cleanup.
Hosted scenarios are the primary checks for public action behavior. Unit tests
call action modules directly where they add distinct coverage:
input boundaries, process ownership, failed rollback or deletion, corrupted
downloads, incomplete report transfers and report isolation after write failures.
Keep native-format preservation and private-data checks. Avoid repeating successful
or ordinary failed workflows with mocks, and assert outcomes instead of internal
calls unless ordering or deadlines are part of the contract. A unit suite is
justified by these additional cases, not by requiring one for every action.

Group JavaScript cases in named `suite()` blocks from `node:test`, with `test()`
for each case. Mark phases with `// Arrange`, `// Act` and `// Assert`. Prepare
fixtures and mocks before execution, then check results. For expected exceptions,
define the deferred call in Act and evaluate it with `assert.throws` or
`await assert.rejects` in Assert.
Repeat labeled phases when a case verifies a sequence such as failure and recovery.

Each action owns a private `package.json`, lockfile, `.node-version` and `tests/`
directory. Development dependencies supply the same Toolkit helpers injected by
the pinned GitHub Script action; production scripts receive them from the caller.
For example, run `npm --prefix actions/vm/create ci` followed by
`npm --prefix actions/vm/create test` for creation tests. Hosted unit jobs run
`npm run test:ci`: the `pretest:ci` hook creates the
coverage directory, then Node.js writes console results and `coverage/lcov.info`.
Generated coverage files are gitignored. `make test` discovers the action packages,
installs their locked test dependencies and runs each suite, stopping on failure.
Keep reusable test helpers in `tests/helpers/` and synthetic inputs in
`tests/fixture/`. Keep single-use setup beside its tests; avoid adding test harnesses
that parse action YAML or emulate the GitHub Script runtime. The public actions require no npm installation
in consumer workflows.

`__shared-ci.yml` runs all five dedicated workflows:

| Workflow in `.github/workflows/`           | Action                  | Coverage                                                                            |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `__test-actions-ansible-test.yml`          | `ansible/test`          | Playbook and collection sanity success/failure, native reports                      |
| `__test-actions-ansible-test-molecule.yml` | `ansible/test-molecule` | Local success/failure/timeout cleanup; VM deployment, idempotence and reboot        |
| `__test-actions-vm-create.yml`             | `vm/create`             | Lima and QEMU startup, usable SSH outputs, startup rollback before fallback cleanup |
| `__test-actions-vm-test.yml`               | `vm/test`               | Lima and QEMU Goss success, failure, empty suites, timeout and independent reports  |
| `__test-actions-vm-destroy.yml`            | `vm/destroy`            | Lima and QEMU deletion, repeated deletion and unmanaged-data preservation           |

`__test-actions-ansible-test.yml` exercises playbook tests and collection sanity success/failure
scenarios through maintained playbook execution and Ansible community testing actions.
It verifies native report publication after failures. Adjacent JavaScript only
validates inputs and collects reports; upstream actions own test execution,
collection Python setup and containers. Playbook tests use a temporary virtual
environment and the built-in JUnit callback. Consumers supply their Ansible Core pin,
Galaxy requirements and selected targets. Dependabot maintains upstream action
pins and the fixture's requirements file. Linting remains in the separate linter workflow.

## Releases and dependencies

Use Conventional Commits and a reviewed pull request. Publish semantic versions
only after CI and consumer validation pass: major for incompatible contracts,
minor for compatible features, patch for fixes. Consumers pin full commit SHAs;
do not move release tags.

Renovate updates the Goss version and archive SHA-256 together using the
`github-release-attachments` datasource. Review the Ubuntu image URL and SHA-256
together against the official release index when refreshing the fixture; boot the new image before
merging. A dependency proposal is not evidence of compatibility.

Action and public workflow reference docs are generated by `make docs` using the stable
CI Dokumentor Docker image pinned in the Makefile and maintained by Renovate.
Install Docker and authenticate the GitHub CLI with `gh auth login` first.
The container runs with your UID/GID and receives the token from `gh auth token`
through `GITHUB_TOKEN`. Quoted patterns discover `actions/**/action.{yml,yaml}`
and `.github/workflows/!(__*).{yml,yaml}` automatically, excluding internal workflows
whose filenames start with `__`. Change metadata and regenerate;
never hand-edit the generated reference. Keep usage guidance in the leading comments and input
descriptions of each `action.yml`, so the generated action readme is self-contained.

## Action runtime

Use the pinned `actions/github-script` runtime and pass its injected helpers into
adjacent modules: `core` for outputs and status, `exec` for subprocesses, `io` for
ordinary copies, directory creation and cleanup, and `glob` for local report discovery.
Await helper calls so failures reach the action before it publishes outputs.
Keep Node filesystem APIs for private temporary directories, permissions, ownership,
exclusive writes/copies and atomic report publication. `io.cp` with `force: false`
silently skips existing files; it cannot replace a copy that must fail on collision.
VM report collection selects only the native `goss.xml` regular file.
VM commands use GNU `timeout` through `exec.exec`, with silent, bounded output
capture and literal stdin. The deadline also bounds child processes; output beyond
1 MiB is discarded and fails the command when it exits or times out.
Pass inputs through step environment variables. Keep short, straightforward scripts
inline in `action.yml`; retain adjacent modules for substantial code with complex
validation, execution or cleanup behavior. Avoid wrapper files and phase dispatchers
for simple step calls. This is a readability decision, not a fixed line-count rule.
Resolve external imports from `github.action_path`, never the consumer checkout.
Hosted workflows exercise inline action steps; unit tests call action modules
directly with Toolkit helpers. Each action owns its operation:

- `actions/vm/create/` validates configuration, allocates private runtime directories,
  starts guests and rolls back failed startup.
- `actions/vm/test/` owns guest commands and file transfer in `guest.cjs`, executes
  Goss, collects native JUnit and publishes results.
- `actions/vm/_internal/runtime.cjs` validates owned runtimes, identifies running
  guests and verifies deletion for Lima and QEMU. `VmReference` provides identity,
  ownership checks and presence detection. Testing uses that interface;
  `VirtualMachine` adds cleanup for creation rollback and explicit destruction.
  It contains no allocation or guest transport.
- `actions/vm/_internal/command.cjs` bounds subprocess execution; `workspace.cjs`
  validates checkout paths.

Keep code shared only when multiple actions enforce the same safety contract:
runtime ownership and verified cleanup, bounded and redacted command execution,
or checkout-path containment. These rules stay consistent across their callers.
Action-specific behavior stays with its owner, and test transport must not inherit
cleanup. Startup rollback and explicit destruction use the same verified cleanup.
The internal modules are not a public API. Keep modules executable with Node.js 24;
no package installation or build is required.
Dependencies point from action code to shared helpers. Shared helpers do not import
action code; creation and destruction use the same teardown implementation.

Expose inputs and outputs for concrete consumer needs. Test actions publish reports
and communicate success through their step outcome; they expose no report outputs.
Only `vm/create` exports `vm`, `name` and `ssh-config` for subsequent operations.
Use `github.token` for comments and native Ansible configuration for inventory and
collection search paths. Integration tests must verify these effects without adding
public options solely for testing.

## Project artwork

The [project logo](.github/logo.svg) and [social preview](.github/social-preview.svg)
use [Hoverkraft's project template](https://github.com/hoverkraft-tech/branding/blob/c2090278bc389b170ac04dcc7685eabb87eca032/brand/identity/logos/logo-project.svg).
Preserve its square geometry, wave and colors. The white icon combines connected
infrastructure nodes with code brackets. The preview uses outlined Inter lettering
so rendering does not depend on installed fonts. Keep the
[1280 × 640 PNG export](.github/social-preview.png) aligned with the SVG source.
The preview embeds the logo geometry to remain self-contained; it is excluded
from code duplication checks.

## Opinionated VM verification

`vm/test` owns Goss installation, checksum verification, rendering, guest execution
and native reporting. Renovate maintains the release and archive checksum together
in `actions/vm/test/goss.json`; review both against the upstream release.
Its hosted fixtures cover Lima success and QEMU success, failed assertions and
empty suites. Goss state checks should be read-only.

## Molecule scenario validation

`ansible/test-molecule` owns the pinned runtime, bounded execution and report
publication. Consumers own native inventory, playbook locations, resource lifecycle
and test sequence. The action supplies no base configuration or VM dependency.
`__test-actions-ansible-test-molecule.yml` tests a local scenario with custom playbook names,
including native failure cleanup and bounded cleanup after timeout. The fixture
creates only synthetic temporary files on the runner.

Its QEMU job additionally exercises deployment, idempotence, reboot and native
failure reports against a VM created by the workflow. That scenario consumes SSH
outputs and owns its reboot policy; the workflow always destroys the VM.
Dependabot updates Molecule's requirements; validate both native and VM scenarios
before accepting an update.
