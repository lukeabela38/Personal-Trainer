resource "cloudflare_notification_policy" "budget_alert" {
  account_id  = var.cloudflare_account_id
  name        = "${local.project_name} Budget Alert"
  description = "Alert when account-level spend exceeds $1.00"
  enabled     = true
  alert_type  = "billing_usage_alert"

  mechanisms = {
    email = [{
      id = var.alert_email
    }]
  }

  filters = {
    limit = ["1.00"]
  }
}
