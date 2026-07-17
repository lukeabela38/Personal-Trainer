variable "cloudflare_account_id" {
  description = "Cloudflare account ID for future account-scoped resources."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for future DNS-managed resources."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudflare_zone_name" {
  description = "Primary zone name for future DNS resources."
  type        = string
  default     = null
  nullable    = true
}
