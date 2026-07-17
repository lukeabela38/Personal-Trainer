# Workers route strategy
#
# Workers deploy to *.workers.dev subdomains via wrangler.
# No Terraform resources needed for the current workers_dev setup.
#
# Future: custom domain route
#   When a Cloudflare DNS zone is configured, add:
#
#   resource "cloudflare_worker_route" "webhook" {
#     zone_id     = var.cloudflare_zone_id
#     pattern     = "workers.example.com/webhook/*"
#     script_name = "personal-trainer-webhook"
#   }
#
#   resource "cloudflare_worker_route" "weather" {
#     zone_id     = var.cloudflare_zone_id
#     pattern     = "workers.example.com/weather/*"
#     script_name = "personal-trainer-weather"
#   }
#
# Steps to switch from workers_dev to custom domain:
#   1. Add Cloudflare DNS zone (var.cloudflare_zone_id)
#   2. Uncomment and apply the route resources above
#   3. Set workers_dev = false in each worker's wrangler.toml
#   4. Update wrangler.toml routes to match the terraform patterns
#   5. wrangler deploy (routes are managed by terraform, wrangler owns script content)
