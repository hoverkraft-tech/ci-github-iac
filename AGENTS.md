# Repository instructions

Follow the [Hoverkraft engineering guidance](https://github.com/hoverkraft-tech/.github/blob/main/AGENTS.md).

- Follow the [Make and workflow conventions](CONTRIBUTING.md#make-and-workflow-conventions)
  from ci-github-container and workstation-manager when changing tooling.
- Keep environment scenarios in consumers. This repository owns reusable validation
  and focused disposable VM operations. Workflows own VM lifetime; vm/test composes
  test execution and report publication. OCI publication remains in ci-github-container.
- Expose VM operations through GitHub Actions. Keep local Make targets for unit
  tests, linting and documentation.
- Use `actions/github-script` and its native helpers. Keep short, straightforward
  scripts inline in `action.yml`. Use adjacent script files only for substantial,
  complex code; do not add entrypoint wrappers or phase dispatchers just to move
  small steps out of YAML. Resolve module imports from `github.action_path`.
  Keep runtime allocation and startup under create/. Keep guest commands, file
  transfer, assertions and report collection under test/. Limit _internal/ to
  private runtime ownership and process checks, verified cleanup, bounded command
  execution and checkout path validation. Shared modules must not import action-specific code.
  Share only safety contracts enforced by multiple actions. Guest transport uses
  `VmReference` for identity and presence; only creation and destruction use the
  cleanup-capable `VirtualMachine`. The test action must not expose lifecycle teardown.
  Validate public behavior through hosted workflows. Keep focused unit tests for
  additional validation rules and failure paths that are difficult to reproduce
  reliably in those workflows. Avoid mocked copies of hosted scenarios and checks
  of internal call sequences unless the sequence protects a required contract.
- Use synthetic fixtures without account credentials. Never upload VM disks, state,
  environment dumps, private keys or unsanitized logs.
- Dedicate one test workflow to each public action. Keep backend and scenario variants
  within that workflow; use other actions only for fixture setup or cleanup.
  Prefix shared-CI test jobs with `test-`. Follow Arrange, Act, Assert with explicit
  step names, and keep unconditional fixture cleanup separate.
  Where an action needs unit checks, run them through `ci-github-nodejs/actions/test`
  inside its workflow, using that action's working directory. Keep its unit
  tests, package manifest, lockfile and Node version file beside the action.
  Organize JavaScript tests with native `suite()` and `test()` blocks. Label each
  test's phases with `// Arrange`, `// Act` and `// Assert`; keep fixture setup,
  execution and outcome checks in their respective sections.
  Keep shared CI limited to composing those workflows;
  keep `make test` as a local convenience.
- Preserve cleanup after startup, assertion and report-generation failures. Never turn a
  failed or missing assertion into a successful run.
- Run `make test` and `make lint` for changes. Validate VM behavior through the
  hosted action-test workflow on a Linux x86-64 runner with KVM.
- Generate action reference docs with `make docs`; never edit generated output.
- Keep action usage guidance in action metadata and generated readmes, and contributor
  guidance in CONTRIBUTING.md. Record architecture decisions in docs/development/adr.
  Use Conventional Commits and review before merging.
