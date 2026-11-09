# Inventory and durable checkout regression

These suites require the pinned Medusa 2.22.3 inventory/core-flows patches. A
missing patch is a failure. No test edits installed `node_modules`.

The API runner accepts only the exact remediation project/database pairs in
`qa/lib/context.cjs`. Its SQL connection is read-only; fixtures use Admin/Store
APIs, have unique run + fixture sequence IDs, and are tracked in the report.
Never point these commands at the original clothing QA or TEXNO installation.

## Commands

From the repository root:

```powershell
pnpm --dir apps/backend run test:unit -- inventory-native texno-cart-inventory checkout-operation
pnpm --dir apps/backend run test:integration:modules -- inventory-remediation
```

For the prepared isolated container, use its own Node/pnpm and environment:

```powershell
$f = '.local/cms-remediation-fixed-20261109/compose.qa.json'
docker compose -f $f run --rm -T --no-deps backend pnpm run test:unit -- inventory-native texno-cart-inventory checkout-operation
docker compose -f $f run --rm -T --no-deps backend pnpm run test:integration:modules -- inventory-remediation
```

The module runner refuses unapproved `DATABASE_URL`/`QA_PROJECT` pairs before
creating its database. It derives DB connection settings from that verified
target, creates a unique `medusa-remediation-inventory-<uuid>` database, and lets
Medusa create/clean only that suite's schema. It never runs schema changes on the
shop database. Missing Postgres/permissions are test errors, not skips. The
module runner owns schema cleanup; its generated empty test database can remain
after completion and must not be confused with the application database.

The module suite checks aggregate batch reservations, negative quantities,
twenty concurrent last-unit reservation writers, concurrent moves/deletes/
restores/physical decrements, restore after replacement reservation, and explicit
backorders. Independent SQL checks the actual reservation sum against both saved
location counters in `BEGIN READ ONLY` transactions.

## Checkout failure and process interruption

`qa/suites/durable-checkout.cjs` uses the shared runner/context/fixtures. Register
it in `qa/run.cjs` as `durable` before invoking:

```powershell
docker compose -f $f exec -T backend node /server/qa/run.cjs regression durable
```

Its default mode throws a controlled error after contacts, service lines,
shipping, payment collection and payment session. Each case checks compensation,
then retries twice and verifies one order/reservation/service/session/collection.
The private checkout operation plan may retain useful submitted draft data;
linked addresses/contact fields and active commerce records must match their
preparation baseline after compensation.

Real process interruption has two phases, for each stage separately:

```powershell
docker compose -f $f exec -T -e QA_CHECKOUT_PHASE=prepare-crash -e QA_CHECKOUT_STAGE=session backend node /server/qa/run.cjs regression durable
docker compose -f $f restart backend
# Wait for this backend's /health to return 200 before continuing.
docker compose -f $f exec -T -e QA_CHECKOUT_PHASE=resume-crash backend node /server/qa/run.cjs regression durable
```

Repeat with `contacts`, `service_commit`, `services`, `shipping`, `collection`, `session`. `service_commit` pauses after the non-idempotent child add-to-cart commits and before the ensure-services step returns, exercising the commit/checkpoint gap. The first
phase proves only that the checkpoint was reached. Only the second phase checks
recovery and absence of duplicates. Do not count preparation alone as PASS for
crash recovery. Do not recreate the container between these phases: `restart`
preserves its private controller state in `/tmp`.

The Redis cart mutex has a 120-second lease and survives backend process death.
Resume modes first poll only `PTTL` for their exact synthetic cart until its key
expires naturally (bounded at 130 seconds), recording initial/final TTL and wait
duration without the key or ownership value. An immediate API retry may return
409 after its 30-second acquisition timeout, before checkout recovery executes.
The harness never clears locks or changes the business lease to make tests pass.

The failpoint controller is an OS-local file read only for the exact fixed or
restored database name. It cannot be selected by Store/Admin request parameters.
`/tmp/cms-remediation-checkout-crash-state.json` contains a guest capability:
never copy it into reports, screenshots, source archives or logs. The successful
resume removes it and the controller files.

If recovery fails, the private state remains available. After rebuilding/restarting
the isolated backend, restore that same private file into its `/tmp` and use
`QA_CHECKOUT_PHASE=retry-only` with the same runner command. This mode creates no
new fixture, verifies that the original attempt ID is retained, and removes the
private state only after successful order/replay/invariant checks. Keep any
temporary backup of the file solely in the protected instance directory, never
in reports or the source snapshot.

To test rollback after restart, prepare a separate fresh `service_commit` crash
fixture, restart only the isolated backend, then run with
`QA_CHECKOUT_PHASE=resume-with-fault` and
`QA_CHECKOUT_RESUME_FAULT_STAGE=shipping` (also accepts services/collection/session).
This expects an error, the original workflow to become `reverted`, and exact
restoration of the original commerce/contact/address state. Only after those
checks pass does it try a new checkout after the completed rollback. A missing
native child transaction or `failed` compensation is FAIL, never an expected
failure counted as PASS.

For the detached-worker timeout/re-entry probe, prepare a separate fresh
`service_commit` crash fixture, restart the fixed backend, and invoke
`QA_CHECKOUT_PHASE=resume-slow-worker`. It pauses the resumed worker at shipping
until the first HTTP request returns its bounded 409, re-enters checkout while
that worker is still alive, then releases it after one second. The second
request must only poll, return the same completed order, and leave the shipping
checkpoint at one attempt. Counts/replay checks still require one order,
reservation, service, collection and session. An existing scheduled worker is
never force-retried or entered through `run` before its terminal checkpoint.

The SDK fallback has a separate real-process replay test:

```powershell
docker compose -f $f exec -T -e QA_COMPENSATION_PHASE=prepare backend node /server/qa/compensation-restart.cjs
docker compose -f $f exec -T -e QA_COMPENSATION_PHASE=after-first-crash backend node /server/qa/compensation-restart.cjs

docker compose -f $f exec -T -e QA_COMPENSATION_PHASE=after-middle-crash backend node /server/qa/compensation-restart.cjs
docker compose -f $f exec -T -e QA_COMPENSATION_PHASE=after-second-crash backend node /server/qa/compensation-restart.cjs
```

Each command starts a new Medusa CLI process. The first exits abruptly with code
86 after two forward stock debits. The second restores the parent and exits with
code 88 after exactly one inverse is durably recorded. The third resumes between
inverse steps, verifies the child is durably `reverted`, and exits with code 87
before the parent compensation checkpoint. The fourth retries the parent
compensation against that persisted child terminal record. Independent read-only
SQL must show stock 4 → 2 → 3 → 4 → 4, zero reservations, and both workflows reverted.
An inverse replay would exceed stock 4 and fail. The driver translates only the
exact intentional exit plus its database/state assertions into stage success;
unexpected crashes and failed assertions remain failures. These subprocess
interruptions do not restart the public backend or touch unrelated records.
An interruption inside an inverse's own commit/checkpoint boundary remains
ambiguous for non-idempotent external mutations. Recovery refuses that state
for manual review rather than blindly applying the inverse again.

## Interpretation

Delivery can reserve inventory across both eligible locations. Pickup restricts
reservation to the selected shipping option's pickup location. Explicit
fulfillment locations must have physical stock; ordinary negative physical
adjustments remain legal while physical underflow is rejected. With no explicit
location, dispatch consumes actual reservation component sources and records
them in fulfillment metadata `inventory_sources`.

Unit/module successes do not replace API/UI order lifecycle tests or establish
that old forensic data has been repaired. Never zero existing reservations or
clamp negative physical balances as fixture cleanup.
