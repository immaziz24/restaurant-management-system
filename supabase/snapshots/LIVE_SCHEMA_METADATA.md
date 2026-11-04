# Live Supabase schema snapshot (metadata)

**Purpose:** A read-only inventory of the deployed database as inspected on 2026-11-04.

**Important:** This is a metadata snapshot, not a migration file, backup, or complete restore script. The original 19 migration SQL bodies were not available through the project migration listing. Do not use this document as a production restore procedure.

## Public tables observed

- `restaurants`
- `menu_items`
- `orders`
- `order_items`
- `staff_members`
- `order_status_history`
- `restaurant_tables`
- `table_sessions`
- `order_idempotency_keys`
- `order_rate_limit_buckets`
- `order_security_events`
- `owner_business_records`

## Security metadata observed

RLS policies were present for public active-restaurant/menu reads, staff-scoped order/order-item/order-history access, own staff-record reads, and owner-only read/insert access to `owner_business_records`. No browser-facing policies were observed for `restaurant_tables`, `table_sessions`, `order_idempotency_keys`, `order_rate_limit_buckets`, or `order_security_events` in the public policy listing.

This is a catalog observation only; it is not a penetration test or a certification that every policy is correct.

## Triggers observed

- `trg_log_order_status_change` on `orders`
- `trg_enforce_order_status_flow` on `orders`
- `trg_limit_pending_dine_in_orders` on `orders`

## Public database functions observed

- `consume_order_rate_limit(...)`
- `create_customer_order(...)`
- `create_customer_order_idempotent(...)`
- `detect_stale_pending_orders(...)`
- `edit_staff_order_items(...)`
- `enforce_order_status_flow()`
- `enforce_pending_dine_in_order_limit()`
- `log_order_security_event(...)`
- `log_order_status_change()`

## GPS-related schema note

The deployed `restaurants` table still contains `latitude`, `longitude`, `gps_radius_meters` (default 150), and `gps_verification_enabled` (default false). This snapshot records their presence only. No production schema change was made as part of this audit.

## Known source gap

The migration history lists 19 migration names, but the original SQL bodies were not recovered. The Electron `package.json` and lockfile were also not found in the connected project files. These remain release-readiness blockers.
