# Public repository audit report

Audit scope: selected source files available in the connected project workspace. This is not a live production-system or database audit.

## Findings

1. **Electron bridge is now aligned in the submitted source set.** The latest launcher HTML calls `window.desktopTabs.*`; the submitted `preload.js` exposes those methods. This still requires Electron runtime validation.
2. **Electron build configuration recovered.** The user supplied the original `package.json` and matching npm lockfile. The manifest specifies Electron `^45.2.1`, Electron Builder `^26.18.0`, `npm start`, and a Windows x64 NSIS build. The lockfile is version 3 and contains 284 package entries.
3. **Incomplete backend source.** Dashboard pages use Supabase tables and authentication, but SQL migrations, RLS policies, triggers, database functions, and Edge Function source were not recovered.
4. **Personal information found.** Kitchen and Manager HTML contained prefilled staff email addresses. Those values were removed from staged public copies.
5. **Production identifiers found.** Dashboard files contained a production Supabase URL, publishable key, and restaurant UUID. Staged copies replace these with placeholders.
6. **Remote dashboard dependency.** The submitted Electron main process loads Kitchen and Billing dashboards from `qrmenu.plateria.in` and restricts navigation to that origin. The app therefore requires internet access; local/offline operation is not established.
7. **Order confirmation limitation.** Existing project documentation describes manual customer confirmation by phone or in person, not OTP or payment verification.
8. **Testing gap.** JavaScript syntax checks passed for staged scripts. No full Electron, authentication, order lifecycle, or physical printer end-to-end test was performed.

## Release blockers

- Confirm the recovered Electron manifest/lockfile against the intended Windows build environment and run an actual packaging test.
- Recover SQL migrations, RLS policies, trigger/function definitions, and Edge Function code.
- Confirm final intended dashboard revisions against deployed versions.
- Configure a staging Supabase project and test with non-production data.
- Validate Electron startup, role-based login, order-state transitions, printing queue, and physical printer hardware.
- Review Git history and all remaining assets for credentials, customer data, staff data, and production records before the public release is treated as complete.

## Scope boundary

The staged source files are selected candidates, not proof that every feature or dependency of the deployed production system has been captured. No production database, hosting configuration, or user records were modified during this audit.


## Backend source recovery update (read-only inspection)

The connected Supabase account contains an active project named `mughal-e-raj-orders`. Its live database currently exposes the restaurant-ordering schema. The project has 19 recorded migrations, including ordering schema, secure order RPC, order history, payment tracking, customer confirmation enforcement, table QR security, idempotency, rate limiting, stale pending-order handling, and optional GPS settings.

Read-only metadata inspection confirmed RLS is enabled on the listed public tables. The visible policy inventory includes public read policies for active restaurants and available menu items, and staff-scoped read/update policies for orders, order items, status history, staff records, and owner business records. Three order triggers were visible: status-flow enforcement, pending dine-in order limits, and status-history logging.

Three active deployed Edge Function source files have now been added under `supabase/functions/`: `create-order`, `create-order-secure`, and `start-table-session` (each retrieved at deployed version 6). The project also has test/validation functions; these are not included in the production function folder pending a separate classification and cleanup review.

**Important boundary:** The Supabase project is the backend serving Mughal E Raj ordering and QR-menu flows (its Edge Function CORS allowlist includes Plateria domains). It should not be silently treated as a separate Plateria SaaS database or merged with another project without a deliberate architecture decision.

The migration API returned migration names and versions, not the SQL bodies. Therefore the original migration SQL has not yet been recovered into this repository. A live schema inventory is not a substitute for the authoritative migration history.


## Additional SQL source recovery

Two SQL files found in the project library have been archived under `supabase/drafts/`:

- `owner-business-records.setup.sql` — creates an owner-only business records table and policies. It is a setup script for an additional owner data-entry feature; it is not confirmed as part of the deployed 19-migration history.
- `table-qr-security.draft.sql` — creates table QR credential and short-lived session tables. The source explicitly states that it has **not** been applied to Supabase.

These are preserved as drafts and must not be run against production simply because they are in this repository. They require review and staging validation.

## Electron build configuration recovery (2026-11-04)

The user supplied the original `package.json` and `package-lock.json`; both are now committed under `desktop/`. The manifest declares Electron `^45.2.1`, Electron Builder `^26.18.0`, `npm start`, and `npm run build:win` (Windows x64 NSIS). The lockfile uses lockfileVersion 3 and contains 284 package entries. Its root package name, version, and declared development dependencies match `package.json`.

The submitted `main.js`, `preload.js`, `kitchen-preload.js`, and `index.html` have been refreshed from the user-provided files. Node syntax checks passed for all three JavaScript files. This does not establish that Electron starts successfully or that the Windows installer builds. The current `main.js` contains the remote dashboard URLs directly and enforces the Plateria dashboard origin; the app remains internet-dependent.


## Read-only live schema metadata snapshot (2026-11-04)

A read-only catalog inspection has now recorded the live public schema in `supabase/snapshots/LIVE_SCHEMA_METADATA.md`. It observed 12 public tables, 9 public database functions, 3 order triggers, and the currently listed public RLS policies. This is descriptive metadata, not a complete SQL backup or restorable migration.

Notable observations requiring a later security/release review:

- The live `restaurants` table still has GPS coordinate/radius/configuration columns. `gps_verification_enabled` currently defaults to false. This audit did not change these settings or columns.
- The live schema includes `owner_business_records`; the matching SQL found in the library is archived as a setup script, but its exact deployment history is not confirmed.
- Three test/validation Edge Functions are still marked ACTIVE in Supabase, and their listed `verify_jwt` setting is false. Their source is archived separately under `supabase/functions-test-archive/`. This is a security-review item; no live function settings were changed.
- The public policy catalog shows staff-scoped policies for orders, order items, order history and staff records; owner-scoped policies for owner business records; and public read policies for active restaurants and available menu items. This metadata inspection does not establish that the overall system has passed security testing.

The original migration SQL bodies remain unavailable. Although the Electron manifest and lockfile are now present, the repository must not yet be described as a production-ready release until the runtime, installer, authentication, order lifecycle, and printer tests pass.
