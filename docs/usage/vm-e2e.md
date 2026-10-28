# VM end-to-end tests

Compose three actions in your CI job:

| Action | Responsibility | Handoff |
| --- | --- | --- |
| [vm/create](../../actions/vm/create/README.md) | Install Lima and create an isolated guest | `vm` runtime directory and unique `id` |
| [vm/test](../../actions/vm/test/README.md) | Run guest assertions and write their JUnit result | `report` file path, including on assertion failure |
| [vm/destroy](../../actions/vm/destroy/README.md) | Delete the guest and verify cleanup | `removed: true` after successful cleanup |

Use an ephemeral Linux x86-64 runner with KVM, Python 3.10+ and `contents: read`.
Check out your repository with `persist-credentials: false`. Reserve a 90-minute
job timeout for installation, startup, assertions and cleanup. Pin all three
actions to the same reviewed full commit SHA. No consumer Makefile is required.

The [internal VM tests](../../.github/workflows/__test-actions-vm.yml) show complete
composition and failure assertions. A consumer job uses this sequence after checkout:

```yaml
- name: Create VM
  id: vm
  uses: hoverkraft-tech/ci-github-iac/actions/vm/create@<reviewed-full-commit-sha>
- name: Execute guest assertions
  id: test
  uses: hoverkraft-tech/ci-github-iac/actions/vm/test@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
    test-script: tests/e2e.sh
- name: Destroy VM
  if: ${{ always() && steps.vm.outputs.vm != '' }}
  uses: hoverkraft-tech/ci-github-iac/actions/vm/destroy@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
- name: Upload assertion report
  if: ${{ always() && steps.test.outputs.report != '' }}
  uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  with:
    name: vm-${{ github.job }}-${{ steps.vm.outputs.id }}
    path: ${{ steps.test.outputs.report }}
    include-hidden-files: true
    if-no-files-found: error
    retention-days: 7
```

Keep the `always()` cleanup condition and do not suppress cleanup failures.
Creation rolls back partial startup itself; explicit destruction also retries
cleanup when creation has exported its runtime directory. Artifact publication
runs after destruction, so an upload failure cannot prevent cleanup. The workflow
owns upload conditions, naming and retention. Do not upload the VM directory.

## Configure the scenario

`vm/create` accepts an optional `vm-config` YAML file within the checkout.
The [bundled template](../../actions/vm/create/lima.yml) uses a digest-pinned Ubuntu
image with 2 CPUs, 2 GiB RAM and a 10 GiB disk. Plain mode disables host mounts,
SSH agent forwarding and dynamic port forwarding. Lima provisioning still runs;
treat configuration and scripts as trusted repository code.

`vm/test` accepts `vm`, a required `test-script`, `test-timeout-minutes` from 1 to
40 (default 10), and `report-directory` (default `.reports`). The script must be
nonempty and inside the checkout. It runs in guest Bash with `-euo pipefail`,
standard input and `/tmp` as its working directory. Checkout files and host
environment variables are not copied into the guest. Scripts must be self-contained
or obtain synthetic fixtures themselves. Nonzero exit and timeout fail the action.

Testing leaves the VM running, allowing additional assertions or diagnostics
before destruction. Each test call replaces `e2e.junit.xml` in its report directory;
use different directories when retaining multiple results. The report contains
one case for the script exit status. Guest output and exception details are
suppressed in both the report and public logs. Startup failures skip testing and
do not emit a report; publication uses only the current test action's output.

## Cleanup and local runs

Each creation allocates a fresh private `/tmp/iac-<uid>-<random>` Lima directory.
Destruction verifies guest absence, then removes that directory and its SSH keys.
Cleanup failure fails the step and retains the runtime for recovery. No report
file is needed to destroy a guest. Startup has an 11-minute subprocess deadline;
deletion and verification use bounded two-minute CLI calls. Forced runner
termination can interrupt cleanup; ephemeral runner disposal bounds remaining
local resources. Persistent runners and cloud resource cleanup are outside scope.

For local validation, install Lima, QEMU and Python 3.10+ on Linux x86-64 with
access to `/dev/kvm` and outbound network access. Lima's version is maintained in
[creation metadata](../../actions/vm/create/action.yml). From a consumer checkout:

```sh
python3 /path/to/ci-github-iac/actions/vm/cli.py run --test-script tests/e2e.sh
```

This local command composes the same implementations with guaranteed cleanup
attempts. Options are `--vm-config`, `--report-directory` and
`--test-timeout-minutes`. To retry failed cleanup, use the printed runtime path:

```sh
python3 /path/to/ci-github-iac/actions/vm/cli.py destroy --vm /tmp/iac-USER-RUN
```

Repeated destruction succeeds after removal. In this repository, `make e2e`
runs the reference scenario; `make test` checks contracts without a VM.
