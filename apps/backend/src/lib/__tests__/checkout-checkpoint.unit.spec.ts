import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { DistributedTransaction } from "@medusajs/framework/orchestration"

const medusaRequire = createRequire(require.resolve("@medusajs/medusa"))
const engineRoot = dirname(medusaRequire.resolve("@medusajs/workflow-engine-inmemory"))
const { InMemoryDistributedTransactionStorage } = require(join(engineRoot, "utils/workflow-orchestrator-storage.js"))

describe("installed synchronous compensation checkpoint persistence", () => {
  it.each([true, false])("persists a committed inverse even when native step store is %s", async (store) => {
    const upsert = jest.fn()
    const data = { flow: { modelId: "synthetic-parent", transactionId: "synthetic-attempt", runId: "synthetic-run", state: "compensating", _v: 0, steps: { _root: { id: "_root" }, inverse: { id: "inverse", depth: 1, definition: { store }, invoke: { state: "done" }, compensate: { state: "reverted", status: "ok" } } } }, context: {}, errors: [] }
    await InMemoryDistributedTransactionStorage.prototype.saveToDb.call({ workflowExecutionService_: { upsert } }, data, 86400)
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ state: "compensating", execution: data.flow, retention_time: 86400 })])
  })
  it("keeps the original explicit-store rule for ordinary synchronous invoke", async () => {
    const upsert = jest.fn()
    await InMemoryDistributedTransactionStorage.prototype.saveToDb.call({ workflowExecutionService_: { upsert } }, { flow: { state: "invoking", _v: 0, steps: { _root: { id: "_root" }, invoke: { id: "invoke", depth: 1, definition: { store: false }, invoke: { state: "done" } } } } }, 86400)
    expect(upsert).not.toHaveBeenCalled()
  })
  it.each([false, true])("keeps original workflow store=%s and retention options at the checkpoint boundary", async (store) => {
    const runtime = DistributedTransaction as any
    const original = runtime.keyValueStore, save = jest.fn()
    runtime.setStorage({ save })
    try {
      const transaction = new DistributedTransaction({ modelId: "qa-unregistered-storage-options", transactionId: "synthetic", runId: "synthetic", state: "compensating", steps: {}, options: { store, idempotent: false, retentionTime: 1234 } } as any, jest.fn())
      await transaction.saveCheckpoint()
      expect(save).toHaveBeenCalledTimes(store ? 1 : 0)
      if (store) expect(save).toHaveBeenCalledWith(expect.any(String), expect.anything(), 0, expect.objectContaining({ store: true, idempotent: false, retentionTime: 1234 }))
    } finally { runtime.setStorage(original) }
  })
})
