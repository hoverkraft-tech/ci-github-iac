# ADR 0002: Infrastructure test actions and native scenarios

Date: 2026-11-03. Amended: 2026-11-04.

Status: Accepted. Implementation is under review in
[PR #8](https://github.com/hoverkraft-tech/ci-github-iac/pull/8).

Extends the backend and test execution contracts in
[ADR 0001](0001-vm-actions.md) and supersedes its mandatory external entrypoints.

## Context

The Proxmox installation consumer needs direct QEMU because installation inside
Lima timed out on GitHub-hosted runners. Its working direct-QEMU implementation
duplicates VM lifecycle and reporting already owned by this repository.

Arbitrary test commands also leave consumers to repeat tool installation, SSH
setup and reporting. Shared actions should provide those operations while consumers
retain their assertions and deployment policy. Ansible scenarios can target several
environments; requiring a VM or supplying a reboot sequence couples the test
framework to one kind of deployment.

## Decision

### Action responsibilities

Keep actions focused on lifecycle operations or the test framework they execute:

- `vm/create` creates a guest using the selected Lima or QEMU backend, validates
  required configuration and rolls back failed startup. Lima remains the default.
- `vm/test` requires a Goss suite, verifies guest state and publishes native JUnit.
- `vm/destroy` verifies guest termination before removing its private runtime.
- `ansible/test` runs test playbooks and collection sanity checks through maintained
  upstream actions. It does not require a VM or perform linting.
- `ansible/test-molecule` installs the pinned runtime, executes one native scenario
  with a bounded timeout and publishes native JUnit and scenario status reports.

Workflows own sequencing and the lifetime of VMs they create. They consume the
private SSH outputs consistently across backends and schedule destruction with
`always()`. Consumers own platform assertions, readiness expectations, provisioning
and synthetic installation inputs. The shared actions contain no Proxmox policy.

### Direct QEMU

Require explicit JSON configuration for QEMU and YAML configuration for Lima.
QEMU supports unattended ISO installation followed by system-disk boot and SSH
readiness, or a QCOW2 image with a cloud-init seed. Consumers own image authenticity
and provisioning; the hosted fixture verifies its pinned image checksum.

Reuse Lima's maintained setup action for host packages, including QEMU and UEFI
firmware. Direct QEMU starts no Lima guest. Expose no arbitrary QEMU flags, host
disks or host mounts; forward SSH only over loopback. Validate process ownership
and termination before removing private runtime files. Failed cleanup retains
recovery access and fails the job; repeated destruction remains safe.

### Native tests and reports

Use Goss for declarative guest-state verification in `vm/test`. Pin its release
and archive checksum, render the consumer suite and variables, execute in the
guest and publish native JUnit. Empty or fully skipped suites fail. Goss command
resources can invoke focused consumer probes for complex assertions. The action
exposes no arbitrary command, script, runner execution or report selection mode.

Keep Molecule separate from playbook and collection tests. Its native scenario
defines inventory, playbook paths, dependencies, resource lifecycle and sequence.
The action supplies no base configuration, VM requirement or reboot policy, and
imports no VM modules. Native Molecule handles ordinary failure cleanup. After an
interrupted process, the action retries native destruction with a two-minute bound
and retains failure. Scenarios using workflow-created VMs consume their SSH outputs;
the workflow remains responsible for destroying those VMs.

Each test invocation owns its reports. Preserve native tool reports, publish
completed files after test failures and keep execution, collection and publication
failures visible. Report parsing, summaries, PR comments and artifacts are part of
VM testing. Goss produces test results rather than application code coverage;
there is no Codecov mode. Linting stays separate.

Keep public interfaces tied to consumer needs. Test actions expose no outputs;
their outcome, summaries, comments and artifacts communicate results. Only
`vm/create` exports `vm`, `name` and `ssh-config` for subsequent operations. Retain
the `name` output even with a fixed SSH alias so consumers do not duplicate it.
Use `github.token` for comments and native `ansible-config` for inventory and
collection search paths. Hosted tests inspect report files, uploaded artifacts and
published comments without requiring test-only outputs.

### Implementation and validation

Write short, straightforward logic inline in `actions/github-script`. Keep adjacent
modules for substantial validation, execution, report transfer and VM lifecycle
code, resolving imports from the action directory. Allocate runtimes in `vm/create`
and keep guest command execution and file transfer in `vm/test/guest.cjs`.
Shared `runtime.cjs` owns only runtime validation, process identity, presence checks
and verified teardown for both backends. Narrow its interfaces: `VmReference` owns
identity, ownership and presence checks; `VirtualMachine` adds cleanup for creation
rollback and explicit destruction. Guest transport inherits only `VmReference`,
so testing does not acquire lifecycle teardown. Keep bounded subprocess execution in `command.cjs`
and checkout validation in `workspace.cjs`. Shared modules do not import action code;
there is no circular backend dependency. This narrows the earlier shared backend
scope while preserving the VM reference format and public action interfaces.
Mandatory wrappers and phase dispatchers add no useful boundary.
Retain sharing only for safety contracts enforced by multiple actions: runtime
ownership and cleanup, command deadlines/output protection and checkout containment.
These callers need consistent rules. Keep action-specific policy local; add no
shared packaging or generic action framework.

Inject GitHub Script's `core`, `exec`, `io` and `glob` helpers into adjacent code.
Use asynchronous Toolkit execution with GNU `timeout` for process-group deadlines
and bounded, silent output capture. Retain low-level filesystem operations where
Toolkit helpers do not provide private allocation, ownership checks, exclusive
writes/copies or atomic report publication. Runner report discovery uses `glob`
without following symlinks; guest manifests remain independent of the runner's
filesystem. Unit packages use Toolkit development dependencies matching the pinned
GitHub Script runtime, maintained by grouped Dependabot updates. Consumer workflows
need no npm installation. This replaces custom subprocess execution while keeping
cleanup and report contracts.

Dedicate one hosted test workflow to each public action, keeping backend variants
within it. Use Arrange, Act, Assert steps and unconditional cleanup. Hosted scenarios
are the primary checks for success, failure and cleanup behavior. Add unit tests
for distinct input boundaries, data protection and injected failures that are
difficult to reproduce reliably in integration tests. Avoid mocked duplicates of
hosted scenarios; a unit suite is not mandatory for every action. Where needed,
run it through the shared Node.js test action in the owning workflow. Shared CI
composes the linter and those workflows; local Make targets remain development
conveniences. Unit tests call retained modules directly; hosted workflows verify
inline steps and action outputs. Keep shared test helpers in `tests/helpers/` and
synthetic inputs in `tests/fixture/`, without a YAML-extracting execution harness.

## Alternatives considered

- Separate public create actions for Lima and QEMU would expose backend selection
  through different action paths. One selector preserves a consistent lifecycle
  interface while allowing backend-specific configuration.
- Arbitrary commands alone preserve flexibility but require consumers to implement
  their own test harness. Native Goss and Molecule support provides shared execution
  and reporting without introducing another scenario language.
- Combining Molecule with `ansible/test`, or requiring an owned VM and generated
  inventory, mixes test frameworks with environment policy. Native scenarios keep
  target selection and deployment sequences explicit in each consumer.
- Testinfra was considered during the initial tool review. Its upstream
  [maintenance notice](https://github.com/pytest-dev/pytest-testinfra), recorded on
  2026-10-31, informed the choice of Goss as the shared state verifier. The initial
  proposal retained procedural suites; the 2026-11-04 amendment below removes
  that alternative. This is historical selection evidence.
- A separate script for every step adds navigation and dispatch code. Inlining
  simple orchestration preserves readability while complex modules remain testable.

## Goss-only amendment, 2026-11-04

The user selected Goss as the single VM assertion framework across all three
consumers. This supersedes the procedural execution choice in the earlier draft
of this record and the test-command contract in ADR 0001. Remove `command`,
`test-script`, `execution`, `report-file`, `coverage` and `path-mapping` from
`vm/test`, and require `goss-file`. Infrastructure coverage remains consumer-owned
Goss resources and focused probes; pytest continues to serve Python unit and
integration tests, while Molecule owns deployment lifecycle checks.

The workstation consumer migrates backup, setup and cleanup assertions from
Testinfra. Preserve recovery completeness, permissions, archive exclusions,
local changes, browser state and verified external-device teardown. Move the
Docker restart to the Act phase so parallel Goss checks see a stable daemon.

Guest assertions use fresh SSH logins for both backends. Reusing a connection
opened before provisioning retains its old supplementary groups, even after
the account database changes. The shared action owns this transport behavior;
consumers should not need elevated assertions or connection-reset workarounds.

## Consequences

The 2026-11-04 development-branch interface audit removed five inputs and eighteen outputs: optional
`inventory` and `collections-path` from `ansible/test`; `github-token` from all
three test actions; all test-action outputs; `vm/create.id`; and `vm/destroy.removed`.
That earlier inventory included the unreleased Molecule action. Comparing that audit
with base revision `8cb45605599e06183c110a8cdff7beebebe15809` identifies four removed
published inputs and thirteen removed outputs: `inventory`, `collections-path`
and `github-token` from `ansible/test`; `github-token` from `vm/test`; both actions'
outputs; `vm/create.id`; and `vm/destroy.removed`. The Goss-only amendment adds
the VM input removals listed above and its required suite input.
Known consumers do not use these overrides or outputs. The published removals
require a breaking release under repository
policy, replacing the earlier assumption that this work was entirely additive.
Consumers pin related actions to one reviewed revision. Unreleased Molecule
interfaces are consolidated into `ansible/test-molecule` without compatibility aliases.

Direct QEMU requires an ephemeral Linux x86-64 runner with KVM, UEFI firmware and
disk-backed storage. Reusing host setup installs an unused Lima binary for direct
QEMU consumers, avoiding another package installation implementation. Forced runner
termination still relies on ephemeral runner disposal for cleanup.

Goss requires guest file transfer. Molecule runs in an isolated Python environment
on the runner; consumers must define their native scenario policy and clean up
resources they create. Neither tool turns synthetic CI into qualification of a
production host or every possible Molecule target or plugin.

## Validation evidence

On 2026-11-03, [shared CI](https://github.com/hoverkraft-tech/ci-github-iac/actions/runs/41656205593)
passed at `e4a6f4cba532409ee8119fdd5f7db472567efb66`, covering the five action
workflows, unit contracts, Lima/QEMU behavior, Goss, native Molecule scenarios
without a VM, failure reporting, timeout cleanup and reboot scenarios.

The [Proxmox consumer run](https://github.com/neilime/digital-household/actions/runs/41615037775)
passed at `c5482db6d1d790bea5d9b2578c89a766240a5912`, using shared action revision
`a752dd6e1d27d80e510ae533ca71c2cb045cabb9`. It validated installation, idempotence,
reboot, reports and cleanup. Later shared commits changed test organization and
documentation before the 2026-11-04 interface cleanup. These runs are evidence for
the cited revisions, not validation of that cleanup; review, release and the final
consumer pin remain pending for those revisions.

On 2026-11-04, [shared CI](https://github.com/hoverkraft-tech/ci-github-iac/actions/runs/41837608802)
passed all 24 jobs at `3f6dd9f0bf375e3deec90083ab07ded0c7777f3a` after the interface
cleanup and runtime separation. The [consumer run](https://github.com/neilime/digital-household/actions/runs/41837758273)
passed all six jobs at `495941a2c42dfc33769cea215246c4d228badfc2`, using that shared
revision. These results cover installation, deployment, idempotence, reboot,
reports and cleanup before documentation cleanup and commit consolidation.
