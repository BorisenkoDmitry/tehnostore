const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "../../..")
try { process.loadEnvFile(path.join(root, ".env")) } catch {}
const result = { generated_at: new Date().toISOString(), safety: "Read-only unauthenticated order access checks", checks: [] }
const known = ["order_01M6SVH6XT4ZPVP213CTTNKAXM", "order_01M6SVJNV5E0MRRNE24AJ8QXXX"]
async function main() {
  for (const id of known) {
    for (const suffix of ["", "?fields=*"]) {
      const response = await fetch(`http://localhost:9000/store/orders/${id}${suffix}`, { headers: { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY } })
      const body = await response.json().catch(() => ({}))
      const blocked = [400, 401, 403, 404].includes(response.status) && !body.order && !body.email && !body.shipping_address
      result.checks.push({ name: `native order read${suffix ? " with expanded fields" : ""} cannot expose guest order`, order_id: id, status: blocked ? "PASS" : "FAIL", evidence: { status: response.status, no_order_or_contact_data: !body.order && !body.email && !body.shipping_address } })
    }
  }
}
main().catch(error => { result.error = error.message; process.exitCode = 1 }).finally(() => {
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  fs.writeFileSync(path.join(root, "output/cart-qa-order-security.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ summary: result.summary, ...(result.error ? { error: result.error } : {}) }))
})
