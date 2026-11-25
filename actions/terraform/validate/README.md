<!-- header:start -->

# ![Icon](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItY2hlY2stY2lyY2xlIiBjb2xvcj0icHVycGxlIj48cGF0aCBkPSJNMjIgMTEuMDhWMTJhMTAgMTAgMCAxIDEtNS45My05LjE0Ij48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz0iMjIgNCAxMiAxNC4wMSA5IDExLjAxIj48L3BvbHlsaW5lPjwvc3ZnPg==) GitHub Action: Terraform - Validate

<div align="center">
  <img src="../../../.github/logo.svg" width="60px" align="center" alt="Terraform - Validate" />
</div>

---

<!-- header:end -->
<!-- overview:start -->

## Overview

Check formatting and validate tracked Terraform modules without initializing their backends.

Check formatting and validate every tracked Terraform module below the selected directory.
Initialization disables the backend and never plans or applies infrastructure.
Provider and module downloads use the consumer configuration and lockfiles.
Run on a fresh Linux checkout without production credentials. Invalid modules,
formatting drift, initialization errors and an empty module selection fail the action.

<!-- overview:end -->
<!-- usage:start -->

## Usage

```yaml
- uses: hoverkraft-tech/ci-github-iac/actions/terraform/validate@80192f805627fba4ad50752f72c5793a8efe5b8e # feat/terraform-ci-and-docs
  with:
    # Checkout-relative root containing one or more Terraform modules.
    # Default: `.`
    working-directory: .

    # Terraform version used for formatting, initialization and validation.
    # Default: `1.17.2`
    terraform-version: 1.17.2
```

<!-- usage:end -->
<!-- inputs:start -->

## Inputs

| **Input**               | **Description**                                                       | **Required** | **Default** |
| ----------------------- | --------------------------------------------------------------------- | ------------ | ----------- |
| **`working-directory`** | Checkout-relative root containing one or more Terraform modules.      | **false**    | `.`         |
| **`terraform-version`** | Terraform version used for formatting, initialization and validation. | **false**    | `1.17.2`    |

<!-- inputs:end -->
<!-- outputs:start -->
<!-- outputs:end -->
