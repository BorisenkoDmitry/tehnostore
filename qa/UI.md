The browser regression uses only the exact remediation projects. It refuses other Compose/database identities, validates the fixture's runtime source-manifest hash, restricts browser requests to that installation's three loopback origins, and keeps administrator credentials in a temporary script inside the private `.local` installation directory. The script is deleted in `finally`; credentials and preview capabilities are excluded from results.

Run `qa/run.cjs regression interfaces` inside the isolated backend first. Its report is intentionally BLOCKED until browser evidence is supplied. It creates a fresh tracked product, three orders, and content pages and writes the `ui_fixture` path. Copy that JSON to the Windows host. This fixture contains IDs and hashes, with no credentials. Then, from the repository root:

```powershell
$env:PLAYWRIGHT_CLI = '<installed playwright-core/lib/tools/cli-client/cli.js>'
node qa/ui/run.cjs <ui-fixture.json> <ui-results.json>
```

Copy the result JSON into the same backend and run `qa/run.cjs regression interfaces` with `QA_UI_RESULT_FILE` set to that path. The suite rejects evidence from a different source manifest/project. It imports the browser outcomes and independently reads pending drafts, claim/exchange counts, the contact lead and retained customer carts from PostgreSQL. SQL remains read-only. Lead status changes use the verified Admin API.

The browser submits contact, registration, login, cart clearing/selection, malformed/valid import preview, 20 Edit cancellations, 20 Exchange confirmations and 20 Claim confirmations. It also opens a genuine preview, checks configured legal links, adds slow preview responses and periodically refreshes the Edit wizard. These actions do not cover every administrative control or every network failure mode.

A fixture is consumed once. The runner creates an exclusive marker before login. Replaying a partly submitted fixture is refused and no draft is deleted as cleanup. To repeat on the same installation, run the preparation suite again for fresh IDs, then use its new UI fixture. Confirmed operations and failed drafts remain available as evidence.

Focused component checks:

```powershell
# Requires a complete dependency installation and its pinned patches.
node apps/backend/scripts/test-dashboard-remediation.cjs
cd apps/storefront
node --test src/lib/util/__tests__/remediation.test.cjs
```

The component harness executes actual TS/TSX modules with small substitutes for the network/React host. The dashboard harness executes installed source, ESM and CJS wizard implementations. These checks complement the browser and database suite; they do not replace it.
