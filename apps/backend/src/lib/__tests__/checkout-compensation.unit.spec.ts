import { LocalWorkflow } from "@medusajs/framework/orchestration"
import { MedusaError } from "@medusajs/framework/utils"

describe("installed nested workflow compensation after process restart", () => {
  const snapshot = () => ({
    flow: { modelId: "synthetic-child", transactionId: "child-transaction", runId: "synthetic-run", state: "done", metadata: { parentStepIdempotencyKey: "parent:attempt:child:invoke" }, definition: { action: "synthetic-action" }, steps: { "_root.synthetic-action": { id: "_root.synthetic-action", depth: 1, definition: { action: "synthetic-action" }, invoke: { state: "done", status: "ok" }, compensate: { state: "dormant", status: "idle" }, next: [], attempts: 1, failures: 0 } } },
    context: { payload: {}, invoke: { "synthetic-action": { output: { compensateInput: { id: "created-fixture" } } } }, compensate: {} }, errors: [],
  })
  const context = { transactionId: "child-transaction", cancelingFromParentStep: true }
  const harness = (error = new MedusaError(MedusaError.Types.NOT_FOUND, "Transaction no longer stored")) => {
    const cancelTransaction = jest.fn(async (transaction) => transaction)
    const resume = jest.fn(async (transaction) => transaction)
    const cleanup = jest.fn()
    const listWorkflowExecutions = jest.fn(async (...args: any[]) => [] as any[])
    return { cancelTransaction, resume, cleanup, listWorkflowExecutions, workflow: { orchestrator: { cancelTransaction, resume }, handler: jest.fn(() => jest.fn()) }, workflowId: "synthetic-child", container_: { resolve: () => ({ listWorkflowExecutions }) }, medusaContext: undefined, getRunningTransaction: jest.fn(async () => { throw error }), registerEventCallbacks: jest.fn(() => ({ cleanUpEventListeners: cleanup })) }
  }
  it("reconstructs only a matching completed child's saved compensation context", async () => {
    const saved = snapshot(), fake = harness()
    const result = await LocalWorkflow.prototype.cancel.call(fake, saved, undefined, context)
    expect(result.getFlow().transactionId).toBe("child-transaction")
    expect(result.getContext()).toEqual(saved.context)
    expect(typeof result.getFlow().steps["_root.synthetic-action"].getStates).toBe("function")
    expect(fake.cancelTransaction).toHaveBeenCalledWith(result)
    expect(fake.cleanup).toHaveBeenCalledTimes(1)
  })
  it.each([
    { transactionId: "wrong-child", cancelingFromParentStep: true },
    { transactionId: "child-transaction", cancelingFromParentStep: false },
  ])("does not recover an unrelated or externally supplied transaction", async (untrusted) => {
    const fake = harness()
    await expect(LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, untrusted)).rejects.toThrow("no longer stored")
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it("does not swallow database failures or resurrect a failed child", async () => {
    const fake = harness(new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Synthetic database failure"))
    await expect(LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, context)).rejects.toThrow("database failure")
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
    const saved = snapshot(), failed = harness()
    saved.flow.state = "failed"
    await expect(LocalWorkflow.prototype.cancel.call(failed, saved, undefined, context)).rejects.toThrow("no longer stored")
  })
  it("does not reapply an inverse already committed before the parent checkpoint", async () => {
    const saved = snapshot(), fake = harness(), persisted = snapshot()
    persisted.flow.state = "reverted"
    fake.listWorkflowExecutions.mockResolvedValueOnce([{ state: "reverted", execution: persisted.flow, context: { data: persisted.context, errors: [] } }])
    const result = await LocalWorkflow.prototype.cancel.call(fake, saved, undefined, context)
    expect(result.getState()).toBe("reverted")
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it("distinguishes a storage-filtered FAILED record from true absence", async () => {
    const fake = harness(), persisted = snapshot()
    persisted.flow.state = "failed"
    fake.listWorkflowExecutions.mockResolvedValueOnce([{ state: "failed", execution: persisted.flow, context: { data: persisted.context } }])
    await expect(LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, context)).rejects.toThrow("requires review")
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it("binds a retry-suffixed compensation context to the original parent's exact child checkpoint", async () => {
    const fake = harness(), saved = snapshot()
    saved.flow.transactionId = "synthetic-child-as-step-parent-attempt"
    saved.flow.metadata.parentStepIdempotencyKey = "parent:parent-attempt:synthetic-child-as-step:invoke"
    const persisted = JSON.parse(JSON.stringify(saved)); persisted.flow.state = "reverted"
    fake.listWorkflowExecutions.mockResolvedValueOnce([{ state: "reverted", execution: persisted.flow, context: { data: persisted.context } }])
    const result = await LocalWorkflow.prototype.cancel.call(fake, saved, undefined, { transactionId: saved.flow.transactionId + "-attempt-3", cancelingFromParentStep: true, parentStepIdempotencyKey: "parent:parent-attempt:synthetic-child-as-step:compensate" })
    expect(result.getState()).toBe("reverted")
    expect(fake.listWorkflowExecutions).toHaveBeenCalledWith({ workflow_id: "synthetic-child", transaction_id: saved.flow.transactionId }, expect.anything())
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it.each([
    ["synthetic-child-as-step-parent-attempt-attempt-3", "other:parent-attempt:synthetic-child-as-step:compensate"],
    ["other-child-parent-attempt-attempt-3", "parent:parent-attempt:synthetic-child-as-step:compensate"],
    ["synthetic-child-as-step-parent-attempt-attempt-1", "parent:parent-attempt:synthetic-child-as-step:compensate"],
  ])("rejects a suffix without exact deterministic parent/child binding", async (transactionId, parentStepIdempotencyKey) => {
    const fake = harness(), saved = snapshot()
    saved.flow.transactionId = "synthetic-child-as-step-parent-attempt"
    saved.flow.metadata.parentStepIdempotencyKey = "parent:parent-attempt:synthetic-child-as-step:invoke"
    await expect(LocalWorkflow.prototype.cancel.call(fake, saved, undefined, { transactionId, parentStepIdempotencyKey, cancelingFromParentStep: true })).rejects.toThrow("no longer stored")
    expect(fake.listWorkflowExecutions).not.toHaveBeenCalled()
  })
  it("propagates an explicit database lookup error even if storage hid it as NOT_FOUND", async () => {
    const fake = harness()
    fake.listWorkflowExecutions.mockRejectedValueOnce(new Error("Synthetic direct database lookup failed"))
    await expect(LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, context)).rejects.toThrow("direct database lookup failed")
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it("resumes a recovered child only between durably recorded inverse steps", async () => {
    const fake = harness()
    const flow = { ...snapshot().flow, state: "compensating", metadata: { parentSnapshotRecovery: true } }
    const transaction = { getFlow: () => flow, getState: () => flow.state }
    fake.getRunningTransaction.mockResolvedValueOnce(transaction as never)
    await LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, context)
    expect(fake.resume).toHaveBeenCalledWith(transaction)
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
  it("refuses to replay an inverse whose commit/checkpoint boundary is ambiguous", async () => {
    const fake = harness(), flow = snapshot().flow
    Object.assign(flow, { state: "compensating", metadata: { parentSnapshotRecovery: true } })
    Object.assign(flow.steps["_root.synthetic-action"].compensate, { state: "compensating", status: "waiting_response" })
    fake.getRunningTransaction.mockResolvedValueOnce({ getFlow: () => flow, getState: () => flow.state } as never)
    await expect(LocalWorkflow.prototype.cancel.call(fake, snapshot(), undefined, context)).rejects.toThrow("requires review")
    expect(fake.resume).not.toHaveBeenCalled()
    expect(fake.cancelTransaction).not.toHaveBeenCalled()
  })
})
