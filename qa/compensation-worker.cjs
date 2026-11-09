// Run only through qa/compensation-restart.cjs in an allowlisted isolated shop.
const fs = require("node:fs")
const { createRequire } = require("node:module")
const req = createRequire("/server/apps/backend/package.json")
const { assertTarget } = require("./lib/context.cjs")
const { createStep, createWorkflow, StepResponse, WorkflowResponse } = req("@medusajs/framework/workflows-sdk")
const { adjustInventoryLevelsStep } = req("@medusajs/medusa/core-flows")
const { Modules } = req("@medusajs/framework/utils")
const statePath = "/tmp/cms-remediation-compensation-probe.private.json"
const childName = "qa-nested-compensation-child"
const parentName = "qa-nested-compensation-parent"

exports.default = async ({ container }) => {
  const target = assertTarget()
  if (target.database === "cms_remediation_baseline_20261109") throw Error("Compensation probe refuses baseline")
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"))
  if (state.project !== target.project || state.database !== target.database) throw Error("Compensation state target mismatch")
  const phase = process.env.QA_COMPENSATION_PHASE
  if (!["prepare", "after-first-crash", "after-middle-crash", "after-second-crash"].includes(phase)) throw Error("Invalid compensation worker phase")
  const child = createWorkflow(childName, function (input) {
    adjustInventoryLevelsStep(input).config({ name: "qa-debit-first" })
    return new WorkflowResponse(adjustInventoryLevelsStep(input).config({ name: "qa-debit-second" }))
  })
  const interrupt = createStep({ name: "qa-nested-interrupt", store: true }, async () => {
    if (phase === "prepare") {
      fs.writeFileSync(statePath, JSON.stringify({ ...state, reached: "after-forward", first_pid: process.pid }), { mode: 0o600 })
      process.exit(86)
    }
    throw new Error("Controlled post-restart compensation")
  })
  const parent = createWorkflow({ name: parentName, store: true, idempotent: true, retentionTime: 86400 }, function (input) {
    child.runAsStep({ input })
    return new WorkflowResponse(interrupt(input))
  })
  const engine = container.resolve(Modules.WORKFLOW_ENGINE)
  const find = async (workflow, transaction) => (await engine.listWorkflowExecutions({ workflow_id: workflow, transaction_id: transaction }, { order: { created_at: "DESC" }, take: 1 }))[0]
  if (phase === "prepare") {
    await parent(container).run({ input: [{ inventory_item_id: state.inventory_id, location_id: state.location_id, adjustment: -1 }], context: { transactionId: state.parent_id }, throwOnError: false })
    throw Error("Expected first controlled process exit did not occur")
  }
  if (phase === "after-first-crash") {
    global[Symbol.for("medusa.workflow.afterRecoveredCheckpoint")] = async (checkpoint) => {
      if (checkpoint.flow.modelId !== childName || checkpoint.flow.transactionId !== state.child_id || checkpoint.flow.state !== "compensating") return
      const steps = Object.values(checkpoint.flow.steps).filter((step) => step.id !== "_root")
      if (steps.filter((step) => step.compensate?.state === "reverted").length !== 1 || steps.some((step) => step.compensate?.status === "waiting_response")) return
      const committed = await find(childName, state.child_id)
      const committedSteps = Object.values(committed?.execution?.steps || {}).filter((step) => step.id !== "_root")
      if (committed?.state !== "compensating" || committedSteps.filter((step) => step.compensate?.state === "reverted").length !== 1) throw Error("Intermediate inverse checkpoint was not durable")
      fs.writeFileSync(statePath, JSON.stringify({ ...state, reached: "during-child-inverse", middle_pid: process.pid }), { mode: 0o600 })
      process.exit(88)
    }
    await parent(container).retryStep({ idempotencyKey: `${parentName}:${state.parent_id}:qa-nested-interrupt:invoke`, throwOnError: false })
  } else if (phase === "after-middle-crash") {
    global[Symbol.for("medusa.workflow.afterChildCompensation")] = async (event) => {
      if (event.workflowId !== childName || event.transactionId !== state.child_id || event.state !== "reverted") return
      const committed = await find(childName, state.child_id)
      if (committed?.state !== "reverted") throw Error("Child inverse was not durably terminal before second crash")
      fs.writeFileSync(statePath, JSON.stringify({ ...state, reached: "after-child-inverse", second_pid: process.pid }), { mode: 0o600 })
      process.exit(87)
    }
    if (state.reached !== "during-child-inverse") throw Error("Middle restart requires a proved durable inverse checkpoint")
    await parent(container).retryStep({ idempotencyKey: `${parentName}:${state.parent_id}:${childName}-as-step:compensate`, throwOnError: false })
  } else {
    const childExecution = await find(childName, state.child_id)
    if (childExecution?.state !== "reverted" || state.reached !== "after-child-inverse") throw Error("Second-restart retry requires a proved committed child inverse")
    await parent(container).retryStep({ idempotencyKey: `${parentName}:${state.parent_id}:${childName}-as-step:compensate`, throwOnError: false })
  }
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const execution = await find(parentName, state.parent_id)
    if (execution?.state === "failed") throw Error("Compensation probe parent failed")
    if (execution?.state === "reverted") {
      if (phase !== "after-second-crash") throw Error("Expected second controlled process exit did not occur")
      console.log("QA_COMPENSATION_RESULT " + JSON.stringify({ parent_id: state.parent_id, child_id: state.child_id, state: "reverted", third_pid: process.pid }))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw Error("Compensation probe timed out; retained state requires inspection")
}
