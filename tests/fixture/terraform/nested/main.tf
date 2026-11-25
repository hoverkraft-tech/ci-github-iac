terraform {
  required_version = ">= 1.17.2"
}

output "nested" {
  description = "Nested module output."
  value       = "synthetic"
}
