Security regressions (F5, F6, F7)
===============================

`suites/security.cjs` is run through the allowlisted remediation runner. It
creates synthetic staff by the native invite/registration flow, verifies both
session and bearer requests while active, deletes only that exact user ID and
then requires 401 from native and custom Admin routes for both credentials.
An existing administrator must still work. Fixtures are recorded by exact ID.

Public upload policy accepts raster images. Native uploads of CSV/document
formats use private storage, retaining the native CSV import flow. Private
downloads are authenticated Admin URLs, not bearer capabilities. They send
attachment, nosniff, sandbox and no-store headers. `localfs_local` is retained
for existing file rows. Historical private exports in static are blocked at
the earliest framework static handler and can be read by current staff at
the private download endpoint. No historical files are bulk deleted.

The pinned framework patch is necessary: 2.22.3 registers its static handler
before application middleware, and production Morgan writes directly to stdout.
The patch removes all query strings/referrers/user agents from access logs and
redacts preview capabilities in paths. The app logger also redacts structured
secrets/emails and error text. Gateway logging keeps method, route surface,
status, bytes, time and upstream status, without raw URLs. Nginx raw error output
is disabled because it appends the unsanitized request URI.

The HTTP log probes are not themselves a redaction PASS. The outer runner must
read backend/gateway logs after the probes and check every exact `C.logMarkers`
value is absent. Check application and upstream failure cases as well. Never
save the raw logs or capability URLs in a report.

The suite emits BLOCKED when `C.verifyLogs` is unavailable. A runner integration
must supply `async verifyLogs(markers)` returning `backend`, `proxy` and `error`
proofs, each with `{ captured: true, marker_matches: 0 }`. Capture must cover
the exact probe time window; an empty or missing log is not evidence of safety.
Do not turn BLOCKED into PASS merely because the API requests completed.

Targeted source unit checks (PowerShell, from `apps/backend`):

```powershell
$env:TEST_TYPE = 'unit'
node node_modules/jest/bin/jest.js src/api/__tests__/admin-user-guard.unit.spec.ts src/lib/__tests__/log-redaction.unit.spec.ts src/lib/__tests__/secure-local-file.unit.spec.ts --runInBand --forceExit --cacheDirectory=.cache/jest-security
```

After a clean pinned install, the ordinary backend unit suite also runs
`framework-security-patch.unit.spec.ts`. It requires the actual installed
framework helper and compares its bytes with the committed helper. It fails
if the dependency patch has not been applied; the test does not skip it.

Persist `PRIVATE_UPLOAD_DIR` (default `../private-files`) with a separate volume
and include it in backup/restore. Set `FILE_PUBLIC_URL` for each installation.
Use a location outside the application tree (for example
`/var/lib/medusa-private`) when running `medusa develop`: its watcher restarts
the HTTP server when documents are written inside the app directory.
Do not replace the secure provider with the upstream local-file provider in
an instance override. Check the pinned patch using a clean pnpm 10.11.1 install
before starting the runtime. Existing production data is outside this task.

Independent log verification (PowerShell, from repository root):

```powershell
# The fixed/restored gateway must mount qa/nginx.conf; validate with nginx -t.
# Run qa/probe-logs.cjs inside the verified backend (CMS_QA_ROOT=/server).
# Copy its JSON proof out, then inspect Docker logs without writing raw logs:
./qa/verify-logs.ps1 -Report <probe-proof.json> -Output <safe-log-proof.json>
```

The verifier checks container project labels, exact probe timestamps, all
gateway-generated request IDs, a public backend correlation marker, redacted
preview entries, and absence of the exact synthetic secret. It compares the
active proxy configuration with committed `qa/nginx.conf`. A controlled QA-only
upstream 502 confirms diagnostics survive while raw Nginx error output stays
disabled. Empty/incomplete logs or a different config produce BLOCKED; a
secret match produces FAIL. Only counts and hashes are written to the proof.
