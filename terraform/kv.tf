# KV namespaces for Workers persistence.
#
# Terraform owns the namespace lifecycle; Wrangler owns the Worker deploy.
# After `tofu apply`, copy the namespace IDs into each worker's wrangler.toml
# under [[kv_namespaces]]. This is a one-time manual step per namespace.
#
# Namespace design:
#   WEBHOOK_EVENTS  — deduplicate Hevy webhook deliveries (24h TTL, eventual consistency ok)
#   CACHED_WEATHER  — cache OpenWeatherMap API responses (30min TTL, stale data tolerable)
#   USER_SETTINGS   — (future) per-user preferences, no TTL
#
# See issue #204 for full access pattern documentation.

resource "cloudflare_workers_kv_namespace" "webhook_events" {
  account_id = var.cloudflare_account_id
  title      = "WEBHOOK_EVENTS"
}

resource "cloudflare_workers_kv_namespace" "cached_weather" {
  account_id = var.cloudflare_account_id
  title      = "CACHED_WEATHER"
}

output "webhook_events_kv_id" {
  value       = cloudflare_workers_kv_namespace.webhook_events.id
  description = "KV namespace ID for WEBHOOK_EVENTS — copy into workers/webhook/wrangler.toml"
}

output "cached_weather_kv_id" {
  value       = cloudflare_workers_kv_namespace.cached_weather.id
  description = "KV namespace ID for CACHED_WEATHER — copy into workers/weather/wrangler.toml"
}
