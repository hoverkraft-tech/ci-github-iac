<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItYm9vay1vcGVuIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMiAzaDZhNCA0IDAgMCAxIDQgNHYxNGEzIDMgMCAwIDAtMy0zSDJ6Ij48L3BhdGg+PHBhdGggZD0iTTIyIDNoLTZhNCA0IDAgMCAwLTQgNHYxNGEzIDMgMCAwIDEgMy0zaDd6Ij48L3BhdGg+PC9zdmc+) GitHub Action: Terraform - Generate documentation

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="Terraform - Generate documentation" />
</div>

---

<!-- header:end -->
<!-- overview:start -->

## Overview

Generate and inject Terraform module references into readme files.

Generate Terraform module reference sections using the official terraform-docs CLI.
Existing readme content outside BEGIN_TF_DOCS/END_TF_DOCS markers is preserved.
Tracked modules are discovered recursively below working-directory. Lockfile data is
excluded so documentation does not depend on prior provider initialization.
This action only edits the checkout; callers own committing or publishing changes.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/terraform/generate-docs@e47f0d620e50ca1755e868189c563449c9adefd9 # feat/terraform-ci-and-docs
  with:
    # Checkout-relative root containing Terraform modules to document.
    # Default: `.`
    working-directory: .
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**               | **Description**                                                  | **Required** | **Default** |
| ----------------------- | ---------------------------------------------------------------- | ------------ | ----------- |
| **`working-directory`** | Checkout-relative root containing Terraform modules to document. | **false**    | `.`         |

<!-- inputs:end -->
<!-- outputs:start -->
<!-- outputs:end -->
