<!-- header:start -->

# GitHub Reusable Workflow: Terraform - Continuous Integration

<div align="center">
  <img src="../logo.svg" width="60px" align="center" alt="Terraform - Continuous Integration" />
</div>

---

<!-- header:end -->
<!-- overview:start -->

## Overview

Validate Terraform modules on pull requests, main pushes and before releases.
Call this workflow with contents: read. It checks formatting and runs init with
backend access disabled, then validate for every tracked module. No credentials,
plans or applies are required. Runtime failures remain failed checks.

### Permissions

- **`contents`**: `read`

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
name: Terraform - Continuous Integration
on:
  push:
    branches:
      - main
permissions: {}
jobs:
  terraform-ci:
    uses: hoverkraft-tech/ci-github-iac/.github/workflows/terraform-ci.yml@e47f0d620e50ca1755e868189c563449c9adefd9 # feat/terraform-ci-and-docs
    permissions:
      contents: read
    with:
      # Checkout-relative root containing Terraform modules.
      # Default: `.`
      working-directory: .

      # Terraform runtime version.
      # Default: `1.17.2`
      terraform-version: 1.17.2
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

### Workflow Call Inputs

| **Input**               | **Description**                                      | **Required** | **Type**   | **Default** |
| ----------------------- | ---------------------------------------------------- | ------------ | ---------- | ----------- |
| **`working-directory`** | Checkout-relative root containing Terraform modules. | **false**    | **string** | `.`         |
| **`terraform-version`** | Terraform runtime version.                           | **false**    | **string** | `1.17.2`    |

<!-- inputs:end -->
<!-- outputs:start -->
<!-- outputs:end -->
