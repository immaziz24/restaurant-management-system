# Public repository audit report

Audit scope: selected source files available in the connected project workspace. This is not a live production-system or database audit.

## Findings

1. **Electron renderer/preload mismatch.** The latest launcher HTML calls `window.desktopTabs.*`, while the located legacy `preload.js` does not expose that object. A narrow preload bridge was reconstructed for the staged draft and still requires Electron runtime validation.
2. **Missing Electron package manifest.** No authoritative `package.json` or lockfile was located. Electron version, scripts, packaging configuration, and dependency tree remain unverified.
3. **Incomplete backend source.** Dashboard pages use Supabase tables and authentication, but SQL migrations, RLS policies, triggers, database functions, and Edge Function source were not recovered.
4. **Personal information found.** Kitchen and Manager HTML contained prefilled staff email addresses. Those values were removed from staged public copies.
5. **Production identifiers found.** Dashboard files contained a production Supabase URL, publishable key, and restaurant UUID. Staged copies replace these with placeholders.
6. **Remote dashboard dependency.** The Electron launcher loads Kitchen and Billing dashboards from a remote host. The staged main process makes that host configurable; local/offline operation is not established.
7. **Order confirmation limitation.** Existing project documentation describes manual customer confirmation by phone or in person, not OTP or payment verification.
8. **Testing gap.** JavaScript syntax checks passed for staged scripts. No full Electron, authentication, order lifecycle, or physical printer end-to-end test was performed.

## Release blockers

- Recover/confirm the authoritative Electron `package.json` and lockfile.
- Recover SQL migrations, RLS policies, trigger/function definitions, and Edge Function code.
- Confirm final intended dashboard revisions against deployed versions.
- Configure a staging Supabase project and test with non-production data.
- Validate Electron startup, role-based login, order-state transitions, printing queue, and physical printer hardware.
- Review Git history and all remaining assets for credentials, customer data, staff data, and production records before the public release is treated as complete.

## Scope boundary

The staged source files are selected candidates, not proof that every feature or dependency of the deployed production system has been captured. No production database, hosting configuration, or user records were modified during this audit.
