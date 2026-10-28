# VM end-to-end tests

Compose three actions in your CI job:

| Action                                           | Responsibility                            | Handoff                                             |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| [vm/create](../../actions/vm/create/README.md)   | Install Lima and create an isolated guest | `vm` runtime directory and unique `id`              |
| [vm/test](../../actions/vm/test/README.md)       | Run tests and publish reports             | `report` command status and optional `report-files` |
| [vm/destroy](../../actions/vm/destroy/README.md) | Delete the guest and verify cleanup       | `removed: true` after successful cleanup            |

Use an ephemeral Linux x86-64 runner with KVM and `contents: read`.
Default GitHub reporting also needs `pull-requests: write` for PR comments.
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
  with:
    vm-config: tests/lima.yml
- name: Execute guest assertions
  id: test
  uses: hoverkraft-tech/ci-github-iac/actions/vm/test@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
    command: |
      test -d /run/systemd/system
      test "$(uname -s)" = Linux
    report-name: Infrastructure VM tests
- name: Destroy VM
  if: ${{ always() && steps.vm.outputs.vm != '' }}
  uses: hoverkraft-tech/ci-github-iac/actions/vm/destroy@<same-reviewed-full-commit-sha>
  with:
    vm: ${{ steps.vm.outputs.vm }}
# jscpd:ignore-end
```

Keep the `always()` cleanup condition and do not suppress cleanup failures.
Creation rolls back partial startup itself; explicit destruction also retries
cleanup when creation has exported its runtime directory. The test action owns
report parsing, PR comments and upload. These steps run even after test failure;
workflow destruction follows the action and still runs if reporting fails. Testing
never destroys the guest, so callers can execute more test steps before cleanup.
Do not upload the VM directory.

## Configure the scenario

`vm/create` requires `vm-config`, the path to an existing Lima YAML file within
your checkout. Missing or blank input fails before allocating a VM runtime.
The consumer owns the image and resource settings; the action supplies no default
configuration. Copy the [test fixture](../../tests/fixture/lima.yml) into your
repository as a starting point. It uses a digest-pinned Ubuntu image with 2 CPUs,
2 GiB RAM and a 10 GiB disk. Plain mode is always enforced and disables host mounts,
SSH agent forwarding and dynamic port forwarding. Lima provisioning still runs;
treat configuration and scripts as trusted repository code.

`vm/test` accepts `vm` and exactly one of `command` or `test-script`. Use
`command` for one or more Bash commands, including a YAML multiline block. Use
`test-script` to send a nonempty Bash file from the checkout to the guest. Both
run in guest Bash with `-euo pipefail`,
standard input and `/tmp` as its working directory. Checkout files and host
environment variables are not copied into the guest. Scripts must be self-contained
or obtain synthetic fixtures themselves. A command may change directory to
guest code prepared through the VM configuration. `test-timeout-minutes` is an
integer from 1 to 40 (default 10). Nonzero exit and timeout fail the action.

Testing leaves the VM running, allowing additional assertions or diagnostics
before destruction. Each invocation keeps its own host reports under `runner.temp`;
earlier results survive later calls. `report` is a sanitized JUnit file describing
the command and collection outcome. It contains no raw command output or exceptions.
Only completed files are exported. Failed writes remove partial output while
preserving any completed guest reports. Startup failures skip testing and emit no report.

## Collect test and coverage reports

The reporting pattern follows [Hoverkraft's Node.js test action](https://github.com/hoverkraft-tech/ci-github-nodejs/tree/main/actions/test):
select report files and compose parsing, PR comments and uploads in the test action.
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
to 100 files, 20 MiB total and two minutes. Guests need Bash, GNU find and
an SSH file-copy service; the Ubuntu test fixture provides them. Collection is
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

## Publish results

The `coverage` input selects the reporter:

| Value              | Behavior                                                                                    | Job permission                      |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `github` (default) | Parse collected reports, write summaries and annotations, and create or update a PR comment | `pull-requests: write` for comments |
| `codecov`          | Upload explicitly collected reports to Codecov using OIDC                                   | `id-token: write`                   |
| `""`               | Skip coverage parsing, comments and Codecov                                                 | No additional permission            |

GitHub mode reuses Hoverkraft's `parse-ci-reports` and
`create-or-update-comment` actions. It parses collected `report-files`, falling
back to the command-status `report` when none are available. Set `path-mapping`
to translate guest paths to checkout paths. Outputs `summary`, `markdown` and
`parsed-files` expose the parser results.

Set a distinct, stable `report-name` for every test step and matrix scenario; it
is the summary heading and comment lookup key. Reruns update that comment.
Comments run only on same-repository pull requests, excluding Dependabot;
fork PRs still receive summaries and artifacts. `github-token` defaults to
`github.token`. Do not use `pull_request_target` to execute untrusted tests.

Codecov mode requires explicit `report-file` selection and a repository enabled
in Codecov. It uses the same pinned Codecov action as the Node.js reference, with
file discovery disabled so only collected guest reports are sent. It does not
upload the generated command-status wrapper. Configure Codecov path fixes if guest
source paths differ from repository paths. Upload errors fail the action.

Every mode uploads completed status and guest reports as a GitHub artifact with
an invocation-specific name and seven-day retention. `artifact-id` identifies
that upload. Artifact upload still runs after parser, comment or Codecov errors;
earlier test failures remain failures. Reports contain original tool output, so
choose only public-safe files. No extra reporting steps are needed in the workflow.

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
node /path/to/ci-github-iac/actions/vm/cli.cjs run --vm-config tests/lima.yml --test-script tests/e2e.sh
```

This local command composes the same implementations with guaranteed cleanup
attempts. Each test writes to a separate subdirectory of `.reports` and prints
all completed report paths, including on assertion failure. `--vm-config` is
required, together with exactly one of `--command` or `--test-script`. Local runs
execute tests and collect files; GitHub reporting and uploads run only in CI.
Optional arguments are `--report-file`, `--report-directory` (a directory within the checkout) and
`--test-timeout-minutes`. Retained local reports can be removed when no longer
needed. To retry failed cleanup, use the printed runtime path:

```sh
node /path/to/ci-github-iac/actions/vm/cli.cjs destroy --vm /tmp/iac-USER-RUN
```

Repeated destruction succeeds after removal. In this repository, `make e2e`
runs the reference scenario; `make test` checks contracts without a VM.
