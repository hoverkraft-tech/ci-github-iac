# VM end-to-end tests

Implement `make e2e-up`, `make e2e-test`, `make e2e-collect` and `make e2e-down`
in the consumer repository. Call `.github/workflows/vm-e2e.yml` from this
repository at a reviewed full commit SHA. The workflow checks out the caller's
revision and calls those targets unchanged.

The workflow uses an ephemeral Ubuntu GitHub runner, Lima and QEMU with KVM.
It requests only `contents: read` and has no secret inputs. Consumer code owns
assertions and cleanup. Collect diagnostics and destroy the VM even when startup,
assertions or collection fail. Every operation has a separate timeout; runner
termination also removes runner-local resources. Cloud resources and persistent
self-hosted runners are outside this workflow's contract.

Write at least one non-skipped passing assertion in `*.junit.xml` under `.reports`.
Missing assertions fail validation. The directory is uploaded for seven days.
Only write sanitized synthetic reports there. Never include environment dumps,
VM images, keys, account data or raw guest logs. GitHub log masking does not redact
artifact files. The included fixture writes fixed assertion names and a VM status
selected from a fixed list, without copying subprocess output.

## Run the reference fixture

Use Linux x86-64, Python 3.10+, GNU Make, Lima and QEMU. Your user must have access
to `/dev/kvm`. The [workflow](../../.github/workflows/vm-e2e.yml) pins Lima; the
[template](../../tests/fixture/lima.yml) pins the official Ubuntu image and digest.

```sh
make test
make e2e
```

`make e2e` always attempts collection and teardown after failure. To inspect each
operation, use the four individual targets and run `make e2e-down` afterward.
The fixture refuses to reuse an existing VM for cold-start assertions. Teardown
is idempotent and verifies the instance disappeared.

The VM has 2 CPUs, 2 GiB RAM and a 10 GiB disk. Lima plain mode disables host
filesystem mounts, agent forwarding and dynamic port forwarding. It still needs
outbound network access for image download and initial boot. This test does not
qualify nested Proxmox virtualization or application recovery.

Lima runtime files use a private `/tmp/iac-<uid>-<checkout-hash>` directory to
stay within Unix socket path limits. `.cache/e2e/lima-home` records its location.
Each checkout has its own runtime; symlinks and shared directories are rejected.
Teardown removes the VM disk. Small Lima configuration files can remain in the
private temporary directory until the host cleans it or the CI runner expires.
