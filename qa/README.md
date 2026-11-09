# Remediation regression runner

The runner targets only the three exact remediation project/database pairs in
`qa/lib/context.cjs`. Preflight checks the backend health, current source
manifest, mounted instance-config hash, database identity, and read-only SQL
connection before allowing any fixture write. Each created fixture is recorded
by its exact ID in the JSON result. Do not run it against the live TEXNO store.

Use the pinned Node 24 / pnpm 10.11.1 container. From the repository root in
PowerShell:

```powershell
$compose = '.local/cms-remediation-fixed-20261109/compose.qa.json'
docker compose -f $compose exec -T backend sh -lc 'cd /server && pnpm exec node qa/run.cjs list'
docker compose -f $compose exec -T backend sh -lc 'cd /server && QA_RESULT_FILE=/tmp/preflight.json pnpm exec node qa/run.cjs preflight'
docker compose -f $compose exec -T backend sh -lc 'cd /server && QA_RESULT_FILE=/tmp/smoke.json pnpm exec node qa/run.cjs smoke'
docker compose -f $compose exec -T backend sh -lc 'cd /server && QA_RESULT_FILE=/tmp/regression.json pnpm exec node qa/run.cjs regression inventory security catalog access'
docker compose -f $compose exec -T backend sh -lc 'cd /server/apps/backend && pnpm test:unit'
docker compose -f $compose exec -T backend sh -lc 'cd /server/apps/backend && pnpm test:integration:modules'
```

`qa/run.cjs full` includes the browser-backed `interfaces` suite. First run
`regression interfaces` to create a source-bound fixture, then run
`qa/ui/run.cjs` on Windows with the installed Playwright CLI. Copy its result
into the backend's private `/tmp`, then rerun `regression interfaces` with
`QA_UI_RESULT_FILE` pointing to that result. See [UI steps](UI.md).

The durable checkout suite is `regression durable`. Its default run injects
reversible failures and checks compensation/retry. Real process-crash recovery
uses `QA_CHECKOUT_PHASE=prepare-crash`, a valid `QA_CHECKOUT_STAGE`, a restart of
the fixed backend only, then `QA_CHECKOUT_PHASE=retry-only`. The private crash
state contains a guest capability: keep it in `.local` and never copy it into
reports. Follow [inventory and checkout procedures](INVENTORY.md).

The F6 log verifier is a separate, independent step because response codes do
not prove logging redaction. Use [security log procedures](SECURITY.md); it
stores marker counts and request IDs, never raw logs.

Every test command writes a JSON result with `PASS`, `FAIL`, `BLOCKED`, or
`NOT TESTED` cases. Non-PASS cases return a nonzero exit code and must remain
visible in the final report. Do not convert expected failures into green
checks.
