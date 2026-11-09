const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")
const { createContext } = require("./lib/context.cjs")
const C = createContext()
const statePath = "/tmp/cms-remediation-compensation-probe.private.json"
const phase = process.env.QA_COMPENSATION_PHASE || "prepare"
const destination = process.env.QA_RESULT_FILE || `/tmp/compensation-${phase}-${C.runId}.json`
async function worker() {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "medusa", "exec", "/server/qa/compensation-worker.cjs"], { cwd: "/server/apps/backend", env: { ...process.env, QA_COMPENSATION_PHASE: phase }, stdio: ["ignore", "pipe", "pipe"] })
    // Raw framework logs stay in memory and are deliberately not exported.
    child.stdout.on("data", () => {})
    child.stderr.on("data", () => {})
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000)
    child.on("error", reject)
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
  })
}
async function main() {
  await C.init()
  if (C.target.database === "cms_remediation_baseline_20261109") throw Error("Compensation probe refuses baseline")
  if (!["prepare", "after-first-crash", "after-middle-crash", "after-second-crash"].includes(phase)) throw Error("Invalid compensation phase")
  let state
  if (phase === "prepare") {
    if (fs.existsSync(statePath)) throw Error("An unfinished compensation probe owns the state file")
    const locations = C.ok(await C.ar("/stock-locations")).stock_locations
    const inventory = C.ok(await C.ar("/inventory-items", "POST", { sku: "QA-COMP-" + C.runId, title: "Synthetic compensation counter" })).inventory_item
    C.track("inventory_item", inventory.id)
    C.ok(await C.ar(`/inventory-items/${inventory.id}/location-levels`, "POST", { location_id: locations[0].id, stocked_quantity: 4 }))
    const parent = "qa-compensation-" + C.runId
    state = { project: C.target.project, database: C.target.database, inventory_id: inventory.id, location_id: locations[0].id, parent_id: parent, child_id: "qa-nested-compensation-child-as-step-" + parent, reached: "new" }
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 })
  } else {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"))
    if (state.project !== C.target.project || state.database !== C.target.database) throw Error("Compensation state target mismatch")
  }
  C.track("workflow_transaction", state.parent_id)
  const result = await worker()
  const current = JSON.parse(fs.readFileSync(statePath, "utf8"))
  const level = (await C.db.query("SELECT stocked_quantity::text stocked,reserved_quantity::text reserved FROM inventory_level WHERE inventory_item_id=$1 AND location_id=$2 AND deleted_at IS NULL", [state.inventory_id, state.location_id])).rows[0]
  const executions = (await C.db.query("SELECT workflow_id,transaction_id,state FROM workflow_execution WHERE (workflow_id=$1 AND transaction_id=$2) OR (workflow_id=$3 AND transaction_id=$4)", ["qa-nested-compensation-parent", state.parent_id, "qa-nested-compensation-child", state.child_id])).rows
  const parent = executions.find((row) => row.workflow_id === "qa-nested-compensation-parent")
  const child = executions.find((row) => row.workflow_id === "qa-nested-compensation-child")
  C.report.process_probe = { phase, process: result, reached: current.reached, level, executions }
  if (phase === "prepare") C.check("F3-COMPENSATION-FIRST-PROCESS-EXIT", result.code === 86 && current.reached === "after-forward" && Number(level.stocked) === 2 && Number(level.reserved) === 0 && parent?.state === "invoking")
  else if (phase === "after-first-crash") C.check("F3-COMPENSATION-MID-INVERSE-EXIT", result.code === 88 && current.reached === "during-child-inverse" && Number(level.stocked) === 3 && child?.state === "compensating" && parent?.state === "compensating")
  else if (phase === "after-middle-crash") C.check("F3-COMPENSATION-SECOND-PROCESS-EXIT", result.code === 87 && current.reached === "after-child-inverse" && Number(level.stocked) === 4 && child?.state === "reverted" && parent?.state === "compensating")
  else {
    const passed = result.code === 0 && Number(level.stocked) === 4 && Number(level.reserved) === 0 && parent?.state === "reverted" && child?.state === "reverted"
    C.check("F3-COMPENSATION-SECOND-RESTART-NO-DOUBLE-INVERSE", passed, { physical_stock: level.stocked, expected_physical_stock: 4 })
    if (passed) fs.rmSync(statePath)
  }
}
main().catch((error) => C.blocked("compensation-process-probe", error.message)).finally(() => C.finish(destination))
