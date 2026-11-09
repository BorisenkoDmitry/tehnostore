const fs = require("node:fs")
const fixture = require("../lib/fixture.cjs")
const waitForCheckoutLease = require("../lib/checkout-lease.cjs")
const controlPath = "/tmp/cms-remediation-checkout-fault.json"
const reachedPath = "/tmp/cms-remediation-checkout-reached.json"
const privateStatePath = "/tmp/cms-remediation-checkout-crash-state.json"
const stages = ["contacts", "service_commit", "services", "shipping", "collection", "session"]

async function snapshot(C, id) {
  return (await C.db.query(`SELECT c.shipping_address_id,c.billing_address_id,c.email,c.completed_at IS NOT NULL completed,
    (SELECT count(*)::int FROM order_cart WHERE cart_id=c.id AND deleted_at IS NULL) orders,
    (SELECT count(*)::int FROM cart_payment_collection cp JOIN payment_collection pc ON pc.id=cp.payment_collection_id WHERE cp.cart_id=c.id AND cp.deleted_at IS NULL AND pc.deleted_at IS NULL) collections,
    (SELECT count(*)::int FROM cart_payment_collection cp JOIN payment_session ps ON ps.payment_collection_id=cp.payment_collection_id WHERE cp.cart_id=c.id AND cp.deleted_at IS NULL AND ps.deleted_at IS NULL) sessions,
    (SELECT count(*)::int FROM cart_line_item l WHERE l.cart_id=c.id AND l.variant_id IS NULL AND l.deleted_at IS NULL) services,
    (SELECT coalesce(sum(r.quantity),0)::text FROM reservation_item r JOIN order_line_item l ON l.id=r.line_item_id JOIN order_item oi ON oi.item_id=l.id JOIN order_cart oc ON oc.order_id=oi.order_id WHERE oc.cart_id=c.id AND oc.deleted_at IS NULL AND r.deleted_at IS NULL AND oi.deleted_at IS NULL) reserved
    FROM cart c WHERE c.id=$1`, [id])).rows[0]
}

async function prepare(C) {
  const F = await fixture(C)
  const variant = F.variants[2]
  await F.stock(variant.id, [100, 100])
  const service = F.config.services.find((row) => row.enabled !== false)
  if (!service) throw Error("Configured synthetic service required for checkout compensation")
  const cart = await F.cart(variant.id)
  const quote = C.ok(await C.sr("/texno-cart/" + cart.id + "/quote", "POST", { delivery_method: F.delivery.id, services: [service.id] }, cart.h))
  const body = { ...F.checkoutBody(quote.quote.total), services: [service.id] }
  return { cart, body, before: await snapshot(C, cart.id), product_id: F.product.id, variant_id: variant.id }
}

async function retryAndAssert(C, state, label) {
  const route = "/texno-cart/" + state.cart.id + "/checkout"
  const first = await C.sr(route, "POST", state.body, state.cart.h)
  const orderId = first.data.order?.id
  if (orderId) C.track("order", orderId)
  C.check(label + "-RECOVERS", first.status === 200 && Boolean(orderId), { http: first.status })
  const repeat = await C.sr(route, "POST", state.body, state.cart.h)
  const after = await snapshot(C, state.cart.id)
  const invariant = repeat.status === 200 && repeat.data.order?.id === orderId && after.orders === 1 && after.collections === 1 && after.sessions === 1 && after.services === 1 && Number(after.reserved) === 1
  C.check(label + "-RETRY-NO-DUPLICATES", invariant, { http: repeat.status, after: { ...after, email: Boolean(after.email) } })
  return first.status === 200 && Boolean(orderId) && invariant
}

module.exports = async function durableCheckout(C) {
  const phase = process.env.QA_CHECKOUT_PHASE || "throw"
  if (C.target.database === "cms_remediation_baseline_20261109") throw Error("Durable failpoints require the fixed or restored isolated runtime")
  if (phase === "resume-slow-worker") {
    const state = JSON.parse(fs.readFileSync(privateStatePath, "utf8"))
    if (state.project !== C.target.project || state.database !== C.target.database) throw Error("Slow-worker state belongs to another target")
    await waitForCheckoutLease(C, state)
    const original = (await C.db.query("SELECT metadata->'texno_checkout_attempt'->>'id' id FROM cart WHERE id=$1", [state.cart.id])).rows[0]?.id
    if (!original) throw Error("Slow-worker probe requires the saved original attempt")
    const execution = async () => (await C.db.query("SELECT state,execution FROM workflow_execution WHERE workflow_id=$1 AND transaction_id=$2 ORDER BY created_at DESC LIMIT 1", ["texno-durable-checkout", original])).rows[0]
    const shippingStep = (row) => Object.values(row?.execution?.steps || {}).find((step) => step.definition?.action === "checkpoint-shipping")
    fs.writeFileSync(controlPath, JSON.stringify({ cart_id: state.cart.id, stage: "shipping", action: "pause" }), { mode: 0o600 })
    let release, recovered = false
    try {
      const first = await C.sr("/texno-cart/" + state.cart.id + "/checkout", "POST", state.body, state.cart.h)
      const pending = await execution(), step = shippingStep(pending)
      const paused = first.status === 409 && pending?.state === "invoking" && step?.invoke?.status === "waiting_response" && step.attempts === 1 && Object.values(pending.execution.steps).some((row) => row.hasScheduledRetry === true)
      C.check("F3-SLOW-WORKER-TIMEOUT-PRESERVES-OWNER", paused, { http: first.status, original_attempt_id: original, shipping_attempts: step?.attempts })
      if (paused) {
        // Re-enter while the previous retry worker is still paused. Release its
        // OS-local checkpoint only after the second HTTP request has begun.
        release = setTimeout(() => fs.rmSync(controlPath, { force: true }), 1000)
        const second = await C.sr("/texno-cart/" + state.cart.id + "/checkout", "POST", state.body, state.cart.h)
        const done = await execution(), afterStep = shippingStep(done)
        const owned = second.status === 200 && done?.state === "done" && afterStep?.attempts === 1
        C.check("F3-SLOW-WORKER-REENTRY-DOES-NOT-RETRY-OR-RUN", owned, { http: second.status, workflow_state: done?.state, shipping_attempts: afterStep?.attempts })
        if (owned) recovered = await retryAndAssert(C, state, "F3-SLOW-WORKER")
      }
    } finally {
      clearTimeout(release)
      fs.rmSync(controlPath, { force: true })
    }
    C.report.recovery = { stage: state.stage, slow_worker: true, original_attempt_id: original, private_state_retained: !recovered }
    if (recovered) { fs.rmSync(privateStatePath); fs.rmSync(reachedPath, { force: true }) }
    return
  }
  if (phase === "resume-with-fault") {
    if (!fs.existsSync(privateStatePath)) throw Error("Missing private crash preparation state")
    const state = JSON.parse(fs.readFileSync(privateStatePath, "utf8"))
    if (state.project !== C.target.project || state.database !== C.target.database) throw Error("Crash state belongs to another target")
    await waitForCheckoutLease(C, state)
    const stage = process.env.QA_CHECKOUT_RESUME_FAULT_STAGE || "shipping"
    if (!["services", "shipping", "collection", "session"].includes(stage)) throw Error("Invalid post-restart fault stage")
    const original = (await C.db.query("SELECT metadata->'texno_checkout_attempt'->>'id' id FROM cart WHERE id=$1", [state.cart.id])).rows[0]?.id
    if (!original) throw Error("Post-restart compensation requires the original attempt")
    fs.writeFileSync(controlPath, JSON.stringify({ cart_id: state.cart.id, stage, action: "throw" }), { mode: 0o600 })
    let response
    try { response = await C.sr("/texno-cart/" + state.cart.id + "/checkout", "POST", state.body, state.cart.h) }
    finally { fs.rmSync(controlPath, { force: true }) }
    const after = await snapshot(C, state.cart.id)
    const execution = (await C.db.query("SELECT state FROM workflow_execution WHERE workflow_id=$1 AND transaction_id=$2 ORDER BY created_at DESC LIMIT 1", ["texno-durable-checkout", original])).rows[0]
    const unchanged = ["shipping_address_id", "billing_address_id", "email", "completed", "orders", "collections", "sessions", "services", "reserved"].every((key) => String(after[key]) === String(state.before[key]))
    const compensated = response.status >= 400 && unchanged && execution?.state === "reverted"
    C.check("F3-POST-RESTART-COMPENSATES-" + stage.toUpperCase(), compensated, { http: response.status, original_attempt_id: original, workflow_state: execution?.state, business_state_restored: unchanged })
    let recovered = false
    if (compensated) recovered = await retryAndAssert(C, state, "F3-POST-RESTART-COMPENSATION-RETRY")
    C.report.recovery = { stage: state.stage, fault_after_restart: stage, original_attempt_id: original, private_state_retained: !recovered }
    if (recovered) {
      fs.rmSync(privateStatePath, { force: true })
      fs.rmSync(reachedPath, { force: true })
    }
    return
  }
  if (phase === "resume-crash" || phase === "retry-only") {
    if (!fs.existsSync(privateStatePath)) throw Error("Missing private crash preparation state")
    const state = JSON.parse(fs.readFileSync(privateStatePath, "utf8"))
    if (state.project !== C.target.project || state.database !== C.target.database) throw Error("Crash state belongs to another target")
    await waitForCheckoutLease(C, state)
    const previousAttempt = (await C.db.query("SELECT metadata->'texno_checkout_attempt'->>'id' id FROM cart WHERE id=$1", [state.cart.id])).rows[0]?.id
    if (!previousAttempt) throw Error("Retry-only recovery requires the existing saved checkout attempt")
    fs.rmSync(controlPath, { force: true })
    const successful = await retryAndAssert(C, state, "F3-CRASH-" + state.stage.toUpperCase())
    const currentAttempt = (await C.db.query("SELECT metadata->'texno_checkout_attempt'->>'id' id FROM cart WHERE id=$1", [state.cart.id])).rows[0]?.id
    const sameAttempt = previousAttempt === currentAttempt
    C.check("F3-CRASH-REUSES-ORIGINAL-ATTEMPT", sameAttempt, { previous_attempt_id: previousAttempt, current_attempt_id: currentAttempt })
    const recovered = successful && sameAttempt
    C.report.recovery = { stage: state.stage, retry_only: phase === "retry-only", original_attempt_id: previousAttempt, private_state_retained: !recovered }
    if (recovered) {
      fs.rmSync(privateStatePath, { force: true })
      fs.rmSync(reachedPath, { force: true })
    }
    return
  }
  if (phase === "prepare-crash") {
    if (fs.existsSync(privateStatePath)) throw Error("An unfinished crash test already owns private recovery state; resume it first")
    const stage = process.env.QA_CHECKOUT_STAGE
    if (!stages.includes(stage)) throw Error("Explicit valid QA_CHECKOUT_STAGE required")
    const state = { ...(await prepare(C)), stage, project: C.target.project, database: C.target.database }
    // Contains a guest capability: this file is private controller state and must
    // never be copied into reports, screenshots or source snapshots.
    fs.writeFileSync(privateStatePath, JSON.stringify(state), { mode: 0o600 })
    fs.rmSync(reachedPath, { force: true })
    fs.writeFileSync(controlPath, JSON.stringify({ cart_id: state.cart.id, stage, action: "pause" }), { mode: 0o600 })
    const controller = new AbortController()
    const pending = fetch("http://127.0.0.1:9000/store/texno-cart/" + state.cart.id + "/checkout", { method: "POST", headers: { ...C.storeHeaders(), ...state.cart.h, "content-type": "application/json" }, body: JSON.stringify(state.body), signal: controller.signal }).catch(() => undefined)
    let reached = false
    for (let attempt = 0; attempt < 300; attempt++) {
      if (fs.existsSync(reachedPath)) {
        const value = JSON.parse(fs.readFileSync(reachedPath, "utf8"))
        if (value.cart_id === state.cart.id && value.stage === stage) { reached = true; break }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    controller.abort()
    await pending
    C.check("F3-CRASH-PREPARED-" + stage.toUpperCase(), reached, { stage, next: "Restart only this isolated backend, then run resume-crash. This case proves checkpoint reach only." })
    if (!reached) fs.rmSync(controlPath, { force: true })
    return
  }
  if (phase !== "throw") throw Error("Unknown QA_CHECKOUT_PHASE")
  await C.runCase("F3 normal checkout first response", async () => {
    const state = await prepare(C)
    await retryAndAssert(C, state, "F3-NORMAL-FIRST-RESPONSE")
    const marker = (await C.db.query("SELECT metadata->'texno_checkout_attempt'->>'state' state,metadata->'texno_checkout_attempt' ? 'plan' has_plan FROM cart WHERE id=$1", [state.cart.id])).rows[0]
    C.check("F3-NORMAL-COMPLETION-SAVES-DONE-MARKER", marker.state === "done" && marker.has_plan === false, { state: marker.state, retained_operation_plan: marker.has_plan })
  })
  for (const stage of stages) {
    await C.runCase("F3-FAULT-" + stage.toUpperCase(), async () => {
      const state = await prepare(C)
      fs.writeFileSync(controlPath, JSON.stringify({ cart_id: state.cart.id, stage, action: "throw" }), { mode: 0o600 })
      let response
      try { response = await C.sr("/texno-cart/" + state.cart.id + "/checkout", "POST", state.body, state.cart.h) }
      finally { fs.rmSync(controlPath, { force: true }) }
      const after = await snapshot(C, state.cart.id)
      const unchanged = ["shipping_address_id", "billing_address_id", "email", "completed", "orders", "collections", "sessions", "services", "reserved"].every((key) => String(after[key]) === String(state.before[key]))
      C.check("F3-FAULT-" + stage.toUpperCase() + "-COMPENSATES", response.status >= 400 && unchanged, { http: response.status, unchanged, counts: { orders: after.orders, collections: after.collections, sessions: after.sessions, services: after.services, reserved: after.reserved }, address_links_restored: after.shipping_address_id === state.before.shipping_address_id && after.billing_address_id === state.before.billing_address_id })
      await retryAndAssert(C, state, "F3-FAULT-" + stage.toUpperCase())
    })
  }
  fs.rmSync(reachedPath, { force: true })
}
