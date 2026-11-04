# Source inventory

## Selected files staged for review

| Staged path | Workspace source | Notes |
|---|---|---|
| `desktop/index.html` | `index(20261102-134212).html` | Latest identified Electron launcher renderer |
| `desktop/main.js` | `main(4).js` | Latest identified Electron main process; dashboard origin made configurable |
| `desktop/preload.js` | Reconstructed during audit | Narrow `contextBridge` matching `window.desktopTabs` calls in launcher |
| `desktop/kitchen-preload.js` | Extracted from `MughalERaj_DirectPrint_Fix.zip` | Kitchen-only print bridge |
| `dashboards/kitchen.html` | `mughal-e-raj-kitchen-dashboard-fixed.html` | Latest identified kitchen dashboard; prefilled staff email removed |
| `dashboards/billing.html` | `mughal-e-raj-billing-dashboard(5).html` | Latest identified billing dashboard |
| `dashboards/manager.html` | `mughal-e-raj-manager-dashboard(4).html` | Latest identified manager dashboard; prefilled staff email removed |
| `dashboards/owner.html` | `mughal-e-raj-owner-dashboard-auto-refresh(3).html` | Latest identified owner dashboard |

The direct-print ZIP is a focused fix bundle, not a complete Electron application. A separate Firebase starter document was identified as an older/alternate backend and was not mixed into the selected Supabase source set.


## Supabase backend sources

- `supabase/functions/create-order/index.ts` — deployed Edge Function version 6
- `supabase/functions/create-order-secure/index.ts` — deployed Edge Function version 6
- `supabase/functions/start-table-session/index.ts` — deployed Edge Function version 6

The active Supabase project is `mughal-e-raj-orders`. Its schema/migration inventory is documented in `AUDIT_REPORT.md`. Original migration SQL bodies were not returned by the migration-list API and remain a recovery item.


## Additional SQL files archived as drafts

- `supabase/drafts/owner-business-records.setup.sql` — owner business-records table and RLS setup script; not confirmed as deployed migration history.
- `supabase/drafts/table-qr-security.draft.sql` — QR-token and table-session schema draft; source explicitly says it has not been applied.

No authoritative `package.json` or lockfile was found in the connected project library, so none has been fabricated.


## Remaining deployed test/validation Edge Functions

The connected Supabase project also has three ACTIVE functions whose names identify them as test/validation utilities. Their source has been archived separately; they are not mixed into the production function folder and have not been deployed or changed:

- `supabase/functions-test-archive/verify-gps-test/index.ts` — version 2
- `supabase/functions-test-archive/validate-shared-qr-order-test/index.ts` — version 1
- `supabase/functions-test-archive/create-shared-qr-order-test/index.ts` — version 1

These are source archives only. Their continued ACTIVE status in Supabase should be reviewed before a production security sign-off. No Edge Function deployment, deletion, or configuration change was performed.
