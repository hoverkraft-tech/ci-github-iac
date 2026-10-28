# Repository instructions

Follow the [Hoverkraft engineering guidance](https://github.com/hoverkraft-tech/.github/blob/main/AGENTS.md).

- Follow the [Make and workflow conventions](docs/development/contributing.md#make-and-workflow-conventions)
  from ci-github-container and workstation-manager when changing tooling.
- Keep environment scenarios in consumers. This repository owns reusable validation
  and focused disposable VM operations; workflows own orchestration and publication, while OCI publication remains in ci-github-container.
- Use synthetic fixtures without account credentials. Never upload VM disks, state,
  environment dumps, private keys or unsanitized logs.
- Preserve cleanup after startup, assertion and report-generation failures. Never turn a
  failed or missing assertion into a successful run.
- Run `make test` and `make lint` for changes. VM behavior also needs `make e2e` on
  a Linux x86-64 host with KVM, Lima and QEMU.
- Generate action reference docs with `make docs`; never edit generated output.
- Keep user guidance in docs/usage and contributor guidance in docs/development.
  Record important decisions in ADRs. Use Conventional Commits and review before merging.
