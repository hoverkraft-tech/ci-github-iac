# ADR 0001: Focused VM actions

Date: 2026-10-29

Status: Accepted

## Context

Infrastructure repositories need reusable disposable VM tests without implementing
VM management or reporting themselves. Their scenarios, guest configurations and
deployment credentials remain consumer concerns. This repository provides a
runner-local Lima and QEMU implementation for ephemeral Linux x86-64 runners
with KVM. Persistent runners, cloud resources and nested virtualization require
separate qualification; production deployment is outside this contract.

## Decision

Expose three GitHub Actions, pinned together to one reviewed revision:

| Action       | Responsibility                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `vm/create`  | Install Lima and QEMU, validate the required consumer configuration, allocate a private runtime and roll back failed startup. |
| `vm/test`    | Execute supplied Bash commands or a script, collect selected guest reports and compose report publication.                    |
| `vm/destroy` | Verify guest deletion before removing the owned runtime and SSH keys.                                                         |

Workflows own sequencing and VM lifetime. They pass the runtime explicitly,
can run multiple tests against one guest and schedule destruction with `always()`
after testing and reporting. Creation exports its runtime before startup so
explicit destruction can retry failed rollback. Failed cleanup retains recovery
access and fails the job; repeated destruction is safe.

Require a checkout-local Lima YAML configuration without a default. Enforce
plain mode to disable host mounts, SSH agent forwarding and dynamic port
forwarding. Consumers own their images, resource sizing and trusted provisioning.
Tests receive exactly one command or script and run with a bounded timeout.

Each test invocation owns an isolated host report directory and a sanitized
command-status JUnit result. Optional report patterns select files from a fresh
guest `REPORTS_DIR`. Collection validates paths, file types, count and size,
runs after command failure and exports only completed files. Tool reports retain
their original contents and must be suitable for public CI.

The test action composes Hoverkraft's report parser and PR comment action by
default. Optional Codecov mode uploads explicitly collected files through OIDC;
empty coverage mode disables both reporters. All modes retain completed report
artifacts. Stable report names identify comments, and fork and Dependabot PRs
skip comments. Test, collection, reporting and cleanup failures remain failures.

Use native `actions/github-script` with an adjacent `index.cjs` entrypoint for
each action. Keep creation logic under `create/`, assertion and report logic
under `test/`, and only bounded Lima commands, runtime ownership, verified cleanup
and checkout path validation under `_internal/`. These internals are not a public
API. Startup rollback and explicit destruction share the same safety checks.

Keep the public execution interface in GitHub Actions. Local Make targets cover
unit tests, linting and documentation. Maintain Node.js unit contracts and hosted
VM scenarios for success, assertion failure, report failures and startup rollback.
Keep action usage in metadata and generated readmes, and contributor instructions
in root `CONTRIBUTING.md`.

## Consequences

Consumers supply scenarios and permissions while the actions implement VM and
report operations. Workflow authors remain responsible for cleanup scheduling;
ephemeral runner disposal bounds resources left by forced termination.

Actions are consumed from the pinned repository: individual action directories
depend on its private modules. Sharing safety primitives avoids divergent cleanup
implementations without introducing a build or bundling step. Operation-specific
logic stays beside its owning action.

Hosted synthetic tests validate this contract, not a consumer's production service
or complete workstation scenario. Each consumer must validate its own behavior
before adopting the actions for deployment gates.
