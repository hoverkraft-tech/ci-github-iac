<!-- header:start -->

# GitHub Reusable Workflow: Terraform - Update documentation

<div align="center">
  <img src="../logo.svg" width="60px" align="center" alt="Terraform - Update documentation" />
</div>

---

<!-- header:end -->
<!-- overview:start -->

## Overview

Regenerate module references after successful CI on a trusted default-branch push.
The GitHub App needs contents and pull request write permissions. The shared
documentation PR action commits only module readme files and requests a squash
merge. Callers retain control of when this write workflow runs.

### Permissions

- **`contents`**: `read`

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
name: Terraform - Update documentation
on:
  push:
    branches:
      - main
permissions: {}
jobs:
  terraform-docs:
    uses: hoverkraft-tech/ci-github-iac/.github/workflows/terraform-docs.yml@e47f0d620e50ca1755e868189c563449c9adefd9 # feat/terraform-ci-and-docs
    permissions:
      contents: read
    secrets:
      # GitHub App private key for documentation updates.
      # This input is required.
      github-app-key: ""
    with:
      # Checkout-relative root containing Terraform modules.
      # Default: `.`
      working-directory: .

      # GitHub App client ID for documentation updates.
      # This input is required.
      github-app-client-id: ""
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

### Workflow Call Inputs

| **Input**                  | **Description**                                      | **Required** | **Type**   | **Default** |
| -------------------------- | ---------------------------------------------------- | ------------ | ---------- | ----------- |
| **`working-directory`**    | Checkout-relative root containing Terraform modules. | **false**    | **string** | `.`         |
| **`github-app-client-id`** | GitHub App client ID for documentation updates.      | **true**     | **string** | -           |

<!-- inputs:end -->
<!-- outputs:start -->
<!-- outputs:end -->
