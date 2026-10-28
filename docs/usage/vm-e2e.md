# VM end-to-end tests

Compose three actions in your CI job:

| Action                                           | Responsibility                            | Handoff                                             |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| [vm/create](../../actions/vm/create/README.md)   | Install Lima and create an isolated guest | `vm` runtime directory and unique `id`              |
| [vm/test](../../actions/vm/test/README.md)       | Run assertions and collect test reports   | `report` command status and optional `report-files` |
| [vm/destroy](../../actions/vm/destroy/README.md) | Delete the guest and verify cleanup       | `removed: true` after successful cleanup            |

Use an ephemeral Linux x86-64 runner with KVM and `contents: read`.
The VM actions use the Node runtime provided by `actions/github-script`; no Python
or consumer package installation is needed. The shared report parser manages its own dependencies.
Check out your repository with `persist-credentials: false`. Reserve a 90-minute
job timeout for installation, startup, assertions and cleanup. Pin all three
actions to the same reviewed full commit SHA. No consumer Makefile is required.

The [internal VM tests](../../.github/workflows/__test-actions-vm.yml) show complete
composition and failure assertions. A consumer job uses this sequence after checkout:

```yaml
# This example intentionally matches the maintained workflow.
# jscpd:ignore-start
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
- name: Summarize assertion reports
  if: ${{ always() && (steps.test.outputs.report != '' || steps.test.outputs.report-files != '') }}
  uses: hoverkraft-tech/ci-github-common/actions/parse-ci-reports@44f6108cef0e9884ea7735f3d62932c2310745d4 # 0.39.1
  with:
    report-name: VM assertions
    report-paths: ${{ steps.test.outputs.report-files || steps.test.outputs.report }}
    output-format: summary,annotations
- name: Upload assertion reports
  if: ${{ always() && (steps.test.outputs.report != '' || steps.test.outputs.report-files != '') }}
  uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  with:
    name: vm-${{ github.job }}-${{ steps.vm.outputs.id }}
    path: |
      ${{ steps.test.outputs.report }}
      ${{ steps.test.outputs.report-files }}
    if-no-files-found: error
    retention-days: 7
# jscpd:ignore-end
```

Keep the `always()` cleanup condition and do not suppress cleanup failures.
Creation rolls back partial startup itself; explicit destruction also retries
cleanup when creation has exported its runtime directory. Report parsing and upload
run after destruction, so reporting failures cannot prevent cleanup. The workflow
owns summaries, annotations, upload conditions, naming and retention. Test execution
and collection determine the action's outcome; report rendering does not suppress failures.
Do not upload the VM directory.

## Configure the scenario

`vm/create` accepts an optional `vm-config` YAML file within the checkout.
The [bundled template](../../actions/vm/create/lima.yml) uses a digest-pinned Ubuntu
image with 2 CPUs, 2 GiB RAM and a 10 GiB disk. Plain mode disables host mounts,
SSH agent forwarding and dynamic port forwarding. Lima provisioning still runs;
treat configuration and scripts as trusted repository code.

`vm/test` accepts `vm`, a required `test-script`, `test-timeout-minutes` from 1 to
40 (default 10), and optional `report-file` patterns. The script must be
nonempty and inside the checkout. It runs in guest Bash with `-euo pipefail`,
standard input and `/tmp` as its working directory. Checkout files and host
environment variables are not copied into the guest. Scripts must be self-contained
or obtain synthetic fixtures themselves. Nonzero exit and timeout fail the action.

Testing leaves the VM running, allowing additional assertions or diagnostics
before destruction. Each invocation keeps its own host reports under `runner.temp`;
earlier results survive later calls. `report` is a sanitized JUnit file describing
the command and collection outcome. It contains no raw command output or exceptions.
Only completed files are exported. Failed writes remove partial output while
preserving any completed guest reports. Startup failures skip testing and emit no report.

## Collect test and coverage reports

The reporting pattern follows [Hoverkraft's Node.js test action](https://github.com/hoverkraft-tech/ci-github-nodejs/tree/main/actions/test):
select report files and delegate parsing to `ci-github-common/actions/parse-ci-reports`.
To collect files produced by your test tools, set `report-file` on `vm/test`:

```yaml
report-file: |
  junit.xml
  coverage/*.info
```

The action gives the script a fresh, private guest directory in `REPORTS_DIR`.
Configure the test tool to write there, for example `$REPORTS_DIR/junit.xml` and
`$REPORTS_DIR/coverage/lcov.info`. Paths and glob patterns are relative to that
directory. Lists accept newlines, commas or semicolons; basic `*`, `**`, `?` and
character-class globs are supported. Use portable filenames containing letters,
digits, spaces, dots, underscores or hyphens. Absolute paths and parent traversal
are rejected, and symbolic links are excluded.

Every requested pattern must match a nonempty regular file. Collection is limited
to 100 files, 20 MiB total and two minutes. Custom guests need Bash, GNU find and
an SSH file-copy service; the bundled Ubuntu guest provides them. Collection is
attempted after assertion failure or timeout, before removing the guest report
directory. Missing files, incomplete transfers and cleanup errors fail the action.
An incomplete collection exports no guest files; the command-status report records
the failure. Completed guest files are returned as newline-separated absolute
paths in `report-files`, preserving relative names in an isolated host directory.

Collected files retain their original contents, including any failure details.
Use synthetic data and configure test tools to exclude credentials, environment
dumps and private logs from reports published by these public workflows. Raw VM
command output is never collected. See the maintained [success fixture](../../tests/fixture/assert.sh)
and [failure fixture](../../tests/fixture/fail.sh) for examples.

Feed `report-files` to the shared parser, falling back to `report` when no guest
reports are available, as shown above. This avoids counting the command wrapper
as an extra framework test. Keep both outputs in the uploaded artifact. The parser
supports JUnit, coverage and other standard CI formats; set its `path-mapping`
input when reports reference guest paths that differ from checkout paths.
When combining test steps, pass their explicit paths together; separate uploads
need distinct artifact names. No report-directory scan is needed on the host.

## Cleanup and local runs

Each creation allocates a fresh private `/tmp/iac-<uid>-<random>` Lima directory.
Destruction verifies guest absence, then removes that directory and its SSH keys.
Cleanup failure fails the step and retains the runtime for recovery. No report
file is needed to destroy a guest. Startup has an 11-minute subprocess deadline;
deletion and verification use bounded two-minute CLI calls. CLI output is captured
with a 1 MiB limit per stream; exceeding it fails the operation. Forced runner
termination can interrupt cleanup; ephemeral runner disposal bounds remaining
local resources. Persistent runners and cloud resource cleanup are outside scope.

For local validation, install Lima, QEMU and Node.js 24.8 or later on Linux x86-64 with
access to `/dev/kvm` and outbound network access. Lima's version is maintained in
[creation metadata](../../actions/vm/create/action.yml). From a consumer checkout:

```sh
node /path/to/ci-github-iac/actions/vm/cli.cjs run --test-script tests/e2e.sh
```

This local command composes the same implementations with guaranteed cleanup
attempts. Each test writes to a separate subdirectory of `.reports` and prints
all completed report paths, including on assertion failure. Options are
`--vm-config`, `--report-file`, `--report-directory` (a directory within the checkout) and
`--test-timeout-minutes`. Retained local reports can be removed when no longer
needed. To retry failed cleanup, use the printed runtime path:

```sh
node /path/to/ci-github-iac/actions/vm/cli.cjs destroy --vm /tmp/iac-USER-RUN
```

Repeated destruction succeeds after removal. In this repository, `make e2e`
runs the reference scenario; `make test` checks contracts without a VM.
