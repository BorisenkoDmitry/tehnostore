import { checkoutRequestFingerprint, checkoutRetryIdempotencyKey, checkoutStoredRetryIdempotencyKey, isPendingCheckoutAttempt, recoverCheckoutExecution } from "../checkout-operation"
import { TransactionStepStatus } from "@medusajs/framework/utils"
const stored = (id: string, flow: any) => ({ workflow_id: "texno-durable-checkout", transaction_id: id, run_id: "synthetic-run", state: flow.state, execution: { ...flow, modelId: "texno-durable-checkout", transactionId: id, runId: "synthetic-run" } })

describe("checkout retry identity", () => {
  it("treats differently ordered JSON objects as the same retry", () => {
    expect(checkoutRequestFingerprint({ city: "QA", address: { street: "A", house: "1" }, services: ["one", "two"] })).toBe(checkoutRequestFingerprint({ services: ["one", "two"], address: { house: "1", street: "A" }, city: "QA" }))
  })
  it("distinguishes a changed order from the interrupted operation", () => {
    expect(checkoutRequestFingerprint({ expected_total: 1 })).not.toBe(checkoutRequestFingerprint({ expected_total: 2 }))
  })
})

describe("allowlisted synchronous checkout recovery", () => {
  const attempt = "checkout-cart_synthetic-abcdef"
  const step = (action = "texno-checkout-ensure-services", state = "invoking", status: string = TransactionStepStatus.WAITING, async = false) => ({ definition: { action, async }, invoke: { state, status } })
  it("selects the actual serialized waiting_response status recorded after process kill", () => {
    const serialized = JSON.parse('{"state":"invoking","steps":{"_root.ensure":{"definition":{"action":"texno-checkout-ensure-services","async":false},"invoke":{"state":"invoking","status":"waiting_response"}}}}')
    expect(checkoutRetryIdempotencyKey(attempt, serialized)).toBe(`texno-durable-checkout:${attempt}:texno-checkout-ensure-services:invoke`)
  })
  it("rejects the unsupported literal waiting instead of mocking a nonexistent SDK state", () => {
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { current: step(undefined, undefined, "waiting") } })).toBeUndefined()
  })
  it.each(["texno-checkout-ensure-services", "texno-checkout-checkpoint", "checkpoint-services", "checkpoint-shipping", "checkpoint-before-collection", "checkpoint-collection", "checkpoint-session"])("builds the exact invoke key for %s", (action) => {
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { current: step(action) } })).toBe(`texno-durable-checkout:${attempt}:${action}:invoke`)
  })
  it.each(["add-to-cart-as-step", "update-cart-as-step", "create-payment-sessions-as-step", "complete-cart-as-step"])("never forces native mutation %s", (action) => {
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { current: step(action) } })).toBeUndefined()
  })
  it("rejects completed, compensating, async and ambiguous executions", () => {
    for (const state of ["done", "reverted", "compensating", "waiting_to_compensate", "failed"]) expect(checkoutRetryIdempotencyKey(attempt, { state, steps: { current: step() } })).toBeUndefined()
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { current: step(undefined, "done", "ok") } })).toBeUndefined()
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { current: step(undefined, undefined, undefined, true) } })).toBeUndefined()
    expect(checkoutRetryIdempotencyKey(attempt, { state: "invoking", steps: { first: step(), second: step("checkpoint-session") } })).toBeUndefined()
  })
  it("cannot inject a different workflow/action through the transaction key", () => {
    expect(checkoutRetryIdempotencyKey("x:y", { state: "invoking", steps: { current: step() } })).toBeUndefined()
    expect(checkoutRetryIdempotencyKey(attempt, undefined)).toBeUndefined()
  })
})

describe("preserving interrupted checkout identity", () => {
  it.each(["running", "not_started", "invoking", "waiting_to_compensate", "compensating", "failed"])("keeps %s attempts pending instead of creating replacements", (state) => {
    expect(isPendingCheckoutAttempt({ state })).toBe(true)
  })
  it("allows a fresh attempt only after a terminal completion or rollback", () => {
    for (const value of [undefined, null, { state: "done" }, { state: "reverted" }]) expect(isPendingCheckoutAttempt(value)).toBe(false)
  })
  it("preserves transaction/plan after retryStep throws and reuses them on the next request", async () => {
    const attempt = { id: "checkout-cart_synthetic-original", state: "invoking", plan: { id: "cart_synthetic", services: [{ id: "synthetic" }] } }
    const baseline = JSON.stringify(attempt)
    const pending = { transaction: { getState: () => "invoking", getFlow: () => ({ state: "invoking", steps: { current: { definition: { action: "texno-checkout-ensure-services" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } }) } }
    const completed = { transaction: { getState: () => "done", getFlow: () => ({ state: "done", steps: {} }) } }
    const run = jest.fn(async (_options: { input: typeof attempt.plan; context: { transactionId: string }; throwOnError: false }) => pending)
    const retryStep = jest.fn().mockRejectedValueOnce(new Error("Synthetic transient retry failure")).mockResolvedValueOnce(completed)
    const readExecutionState = jest.fn(async () => "done")
    const readExecution = jest.fn(async () => stored(attempt.id, pending.transaction.getFlow()))
    await expect(recoverCheckoutExecution(attempt, { run, retryStep, readExecution, readExecutionState })).rejects.toThrow("transient retry failure")
    expect(JSON.stringify(attempt)).toBe(baseline)
    expect(isPendingCheckoutAttempt(attempt)).toBe(true)
    expect(await recoverCheckoutExecution(attempt, { run, retryStep, readExecution, readExecutionState })).toBe(completed)
    expect(run).not.toHaveBeenCalled()
    for (const [options] of run.mock.calls) expect(options.context.transactionId).toBe(attempt.id)
    for (const [options] of retryStep.mock.calls) expect(options.idempotencyKey).toBe(`texno-durable-checkout:${attempt.id}:texno-checkout-ensure-services:invoke`)
  })
  it("waits for the scheduled retry worker to become terminal before reading its result", async () => {
    const events: string[] = []
    const pending = { transaction: { getState: () => "invoking", getFlow: () => ({ state: "invoking", steps: { current: { definition: { action: "texno-checkout-ensure-services" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } }) } }
    const completed = { transaction: { getState: () => "done", getFlow: () => ({ state: "done", steps: {} }) } }
    const attempt = { id: "checkout-cart_synthetic-poll", plan: { id: "cart_synthetic" } }
    const run = jest.fn(async () => { events.push("run"); return completed })
    const readExecution = jest.fn(async () => { events.push("inspect"); return stored(attempt.id, pending.transaction.getFlow()) })
    const retryStep = jest.fn(async () => { events.push("retry"); return pending })
    const states = ["invoking", "compensating", "done"]
    const readExecutionState = jest.fn(async () => { const state = states.shift(); events.push("read:" + state); return state })
    expect(await recoverCheckoutExecution(attempt, { run, retryStep, readExecution, readExecutionState }, { timeoutMs: 1000, pollMs: 0 })).toBe(completed)
    expect(events).toEqual(["inspect", "retry", "read:invoking", "read:compensating", "read:done", "run"])
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("times out without launching a parallel worker or losing the saved attempt", async () => {
    const attempt = { id: "checkout-cart_synthetic-timeout", state: "invoking", plan: { id: "cart_synthetic" } }
    const before = JSON.stringify(attempt)
    const pending = { transaction: { getState: () => "invoking", getFlow: () => ({ state: "invoking", steps: { current: { definition: { action: "texno-checkout-ensure-services" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } }) } }
    const run = jest.fn(async () => pending), retryStep = jest.fn(async () => pending), readExecutionState = jest.fn(async () => "invoking")
    const readExecution = jest.fn(async () => stored(attempt.id, pending.transaction.getFlow()))
    expect(await recoverCheckoutExecution(attempt, { run, retryStep, readExecution, readExecutionState }, { timeoutMs: 0 })).toBe(pending)
    expect(run).not.toHaveBeenCalled()
    expect(retryStep).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(attempt)).toBe(before)
    expect(isPendingCheckoutAttempt(attempt)).toBe(true)
  })
  it("does not force retry without an exact persisted workflow/transaction/run identity", async () => {
    const id = "checkout-cart_synthetic-guard"
    const valid = stored(id, { state: "invoking", steps: { ensure: { definition: { action: "texno-checkout-ensure-services" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } })
    expect(checkoutStoredRetryIdempotencyKey(id, valid)).toContain(":texno-checkout-ensure-services:invoke")
    for (const row of [{ ...valid, workflow_id: "other" }, { ...valid, transaction_id: "other" }, { ...valid, run_id: "other" }, { ...valid, state: "done" }, { ...valid, execution: { ...valid.execution, modelId: "other" } }]) expect(checkoutStoredRetryIdempotencyKey(id, row)).toBeUndefined()
    const run = jest.fn(async () => ({ transaction: { getState: () => "invoking", getFlow: () => valid.execution } })), retryStep = jest.fn()
    await recoverCheckoutExecution({ id, plan: {} }, { run, retryStep, readExecution: async () => ({ ...valid, run_id: "other" }), readExecutionState: async () => "invoking" })
    expect(run).toHaveBeenCalledTimes(1)
    expect(retryStep).not.toHaveBeenCalled()
  })
  it("only polls an existing slow retry worker, including when it advances to a native mutation", async () => {
    const id = "checkout-cart_synthetic-slow"
    const execution = stored(id, { state: "invoking", steps: { old: { hasScheduledRetry: true, invoke: { state: "done", status: "ok" } }, native: { definition: { action: "create-payment-sessions-as-step" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } })
    const complete = { transaction: { getState: () => "done", getFlow: () => ({ state: "done" }) } }
    const events: string[] = [], states = ["invoking", "invoking", "done"]
    const retryStep = jest.fn(), run = jest.fn(async () => { events.push("terminal-run"); return complete })
    const readExecutionState = jest.fn(async () => { const state = states.shift(); events.push(state!); return state })
    expect(await recoverCheckoutExecution({ id, plan: {} }, { run, retryStep, readExecution: async () => execution, readExecutionState }, { timeoutMs: 1000, pollMs: 0 })).toBe(complete)
    expect(events).toEqual(["invoking", "invoking", "done", "terminal-run"])
    expect(retryStep).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })
  it("returns a pending scheduled worker on timeout without entering or forcing its graph", async () => {
    const attempt = { id: "checkout-cart_synthetic-owned", state: "invoking", plan: { id: "cart_synthetic" } }, baseline = JSON.stringify(attempt)
    const execution = stored(attempt.id, { state: "invoking", steps: { ensure: { hasScheduledRetry: true, definition: { action: "texno-checkout-ensure-services" }, invoke: { state: "invoking", status: TransactionStepStatus.WAITING } } } })
    const run = jest.fn(), retryStep = jest.fn()
    const result = await recoverCheckoutExecution(attempt, { run, retryStep, readExecution: async () => execution, readExecutionState: async () => "invoking" }, { timeoutMs: 0 })
    expect(result.transaction.getState()).toBe("invoking")
    expect(run).not.toHaveBeenCalled()
    expect(retryStep).not.toHaveBeenCalled()
    expect(JSON.stringify(attempt)).toBe(baseline)
  })
})
