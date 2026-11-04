# Release checklist

- [ ] Confirm exact final dashboard versions with the client
- [x] Recover and commit Electron package manifest and lockfile
- [ ] Recover Supabase SQL migrations and RLS policies
- [x] Recover selected deployed Edge Function source
- [ ] Confirm staging Supabase project and configure placeholders
- [ ] Validate Electron preload bridge in runtime
- [ ] Test role-based sign-in for owner, manager, kitchen, billing
- [ ] Test order lifecycle and cancellation
- [ ] Test customer-confirmation metadata and database enforcement
- [ ] Test kitchen print queue, retry/failure handling, and billing copy
- [ ] Test physical printer hardware on Windows
- [ ] Run secret and personal-data scan over all files and Git history
- [ ] Confirm license/ownership terms for all included assets/dependencies
- [ ] Approve public release
