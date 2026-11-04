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
