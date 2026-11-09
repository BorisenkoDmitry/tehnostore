const path = require("node:path")
const fs = require("node:fs")
const { createContext } = require("./lib/context.cjs")
const suites = {
  inventory: { file: "inventory.cjs", findings: ["F1","F2","F3","F4","F9","F15"] },
  durable: { file: "durable-checkout.cjs", findings: ["F3"] },
  security: { file: "security.cjs", findings: ["F5","F6","F7"] },
  catalog: { file: "catalog.cjs", findings: ["F8","F10","F11"] },
  interfaces: { file: "interfaces.cjs", findings: ["F12","F13","F14","F16","F17"] },
  access: { file: "access.cjs", findings: ["cart/order/payment regression"] },
}
const command = process.argv[2] || "list"
if (command === "list") console.log(JSON.stringify(suites, null, 2))
else {
  const C = createContext()
  const destination = process.env.QA_RESULT_FILE || path.join("/tmp/remediation-results", command + "-" + C.runId + ".json")
  async function main() {
    await C.init()
    C.check("PREFLIGHT", true, { runtime: C.report.runtime, read_only_sql: true })
    if (command === "preflight") return
    if (!["smoke","regression","full"].includes(command)) throw Error("Use list, preflight, smoke, regression [suite...], full")
    if (command === "smoke") {
      const config = C.ok(await C.sr("/catalog-config"))
      C.check("SMOKE-RUB-CATALOG", config.currency === "rub" && config.categories.length > 0)
      C.check("SMOKE-ADMIN", (await C.ar("/users/me")).status === 200)
      const created = C.ok(await C.sr("/texno-cart", "POST", {}))
      C.track("cart", created.cart.id)
      C.check("SMOKE-GUEST-CART", (await C.sr("/texno-cart/" + created.cart.id, "GET", undefined, { "x-texno-cart-token": created.token })).status === 200)
      return
    }
    const selected = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(suites)
    if (selected.some(name => !suites[name])) throw Error("Unknown regression suite")
    for (const name of selected) {
      const file = path.join(__dirname,"suites",suites[name].file)
      if (!fs.existsSync(file)) { C.blocked(name, "Mandatory suite is not implemented"); continue }
      await C.runCase(name, async () => require(file)(C))
    }
  }
  main().catch(error => C.blocked("HARNESS", error.message)).finally(() => C.finish(destination))
}
