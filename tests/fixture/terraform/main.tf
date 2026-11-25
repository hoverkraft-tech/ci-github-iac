variable "name" {
  description = "Synthetic module input."
  type        = string
  default     = "fixture"
}

output "name" {
  description = "Synthetic module output."
  value       = var.name
}
