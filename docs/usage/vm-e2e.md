# VM end-to-end tests

Commit a Bash script containing your guest assertions, then call the
[reusable workflow](../../.github/workflows/vm-e2e.md) at a reviewed full commit
SHA with `test-script: tests/e2e.sh`. No Makefile is required in the consumer.
The workflow checks out the caller and uses the
[shared action](../../actions/vm-e2e/README.md) from its own pinned revision.

To use the action directly, check out the consumer first and call
`hoverkraft-tech/ci-github-iac/actions/vm-e2e@<reviewed-full-commit-sha>`.
Use an ephemeral Linux x86-64 runner with KVM, Python 3.10+ and `contents: read`.
Allow enough job time for startup, the chosen test timeout and cleanup; the
reusable workflow supplies these runner settings and a 90-minute job budget.

## Configure the scenario

`test-script` is required and must name a nonempty file within the checkout.
The action sends its contents to guest Bash over SSH, with `-euo pipefail`,
standard input and `/tmp` as the working directory. A zero exit means success;
a nonzero exit or timeout fails validation. Put your actual assertions in this
script. Host checkout files and host environment variables are not copied into
the guest. Scripts must be self-contained or obtain synthetic fixtures themselves.

`vm-config` optionally selects a Lima YAML file within the checkout. Use it to
declare the image, resources and guest provisioning scripts. Otherwise the
[bundled template](../../actions/vm-e2e/lima.yml) selects a digest-pinned Ubuntu
image with 2 CPUs, 2 GiB RAM and a 10 GiB disk. Plain mode is enforced, disabling
host mounts, SSH agent forwarding and dynamic port forwarding. Lima provisioning
still runs; treat configuration and scripts as trusted repository code.

`test-timeout-minutes` accepts integers from 1 to 40, defaulting to 10. Startup
has a separate 11-minute subprocess deadline; diagnostics and deletion use
bounded two-minute CLI operations. The shared action attempts collection and
cleanup even after startup, test or collection failures. Cleanup failure fails
the action. Forced runner termination can interrupt these attempts; ephemeral
runner disposal bounds remaining local resources. Cloud resources, credentials,
persistent self-hosted runners and workstation browser recovery are outside this
initial action's scope.

## Reports and cleanup

`artifact-path` defaults to `.reports` and must be a directory inside the checkout.
The action generates one JUnit case for the script exit status and a VM status
record. A successful teardown records `absent` only after verifying deletion.
The action uploads only `e2e.junit.xml` and `vm.json`, with a unique artifact name
and seven-day retention. It never copies guest output, VM disks, keys or state
into these reports. Script output is also suppressed in public action logs.
Missing or empty scripts fail before VM creation; stale reports are cleared
before startup. Startup failures do not produce a passing JUnit report.

Every invocation uses a fresh private `/tmp/iac-<uid>-<random>` Lima directory,
so parallel calls cannot share guests and socket paths stay short. Successful
cleanup removes the guest, runtime directory and SSH identities. If deletion
fails, the printed recovery context identifies the retained runtime for a local
cleanup retry.

## Run locally

Install Lima, QEMU and Python 3.10+ on Linux x86-64, with access to `/dev/kvm` and
outbound network access. Lima's version is maintained in the
[action metadata](../../actions/vm-e2e/action.yml).
From a consumer checkout, run the script from a pinned checkout of this repository:

```sh
python3 /path/to/ci-github-iac/actions/vm-e2e/vm.py run --test-script tests/e2e.sh
```

Use `--vm-config`, `--artifact-path` and `--test-timeout-minutes` for the same
options as the action. The command owns startup, assertions, reporting and cleanup.
To retry failed cleanup, use the context path printed by that invocation:

```sh
python3 /path/to/ci-github-iac/actions/vm-e2e/vm.py down --context /tmp/iac-USER-RUN/context.json
```

Repeated cleanup succeeds after the runtime is removed. In this repository,
`make e2e` runs the reference assertions through the same implementation;
`make test` runs unit contracts without requiring a VM.
