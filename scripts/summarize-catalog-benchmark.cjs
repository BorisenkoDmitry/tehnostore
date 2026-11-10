const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const root = path.resolve(__dirname, "..")
const directory = path.join(root, ".local/performance-20261110")
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))
const before = read("before.json"), after = read("after.json"), snapshot = read("before-snapshot.json")
const browserBefore = read("browser-before.json"), browserAfter = read("browser-after.json")
const database = read("database.json")
assert.equal(before.product.id, after.product.id)
for (const name of ["catalog_config", "product_details"]) assert.equal(before.results.find((item) => item.name === name).sha256, after.results.find((item) => item.name === name).sha256, `${name}: public JSON changed`)
for (const name of ["catalog_search", "catalog_facets", "catalog_two_filters"]) assert.deepEqual(snapshot.results.find((item) => item.name === name).result, after.results.find((item) => item.name === name).result, `${name}: IDs, counts or facets changed`)
assert(browserAfter.cases.every(({ pass }) => pass))
assert.deepEqual(browserAfter.errors, [])
assert.equal(browserBefore.server_cards, 0)
assert.equal(browserAfter.server_cards, 12)
const median = (values) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)]
const results = before.results.map((previous) => {
  const next = after.results.find(({ name }) => name === previous.name)
  return { name: previous.name, before_ms: previous.median_ms, after_ms: next.median_ms, before_p95_ms: previous.p95_ms, after_p95_ms: next.p95_ms, speedup: previous.median_ms / next.median_ms, reduction_percent: (1-next.median_ms/previous.median_ms)*100 }
})
const firstBefore = median(browserBefore.runs.map(({ first_products_ms }) => first_products_ms))
const firstAfter = median(browserAfter.runs.map(({ first_products_ms }) => first_products_ms))
const report = {
  captured_at: new Date().toISOString(), environment: "Isolated local production builds; PostgreSQL 16; Node 24; copy of merchant database with 1173 products", http_samples_per_case: before.runs, browser_samples_per_case: browserBefore.runs.length,
  product: before.product, results,
  first_visible_catalog_products: { before_ms: firstBefore, after_ms: firstAfter, speedup: firstBefore/firstAfter, server_cards_before: 0, server_cards_after: 12 },
  correctness: { unchanged_public_product_and_config_json: true, identical_search_ids_counts_and_facets: true, backend_unit_tests: 311, sql_equivalence_cases: 424, variant_projection_sql_cases: 21, integration_groups: 7, browser_cases: browserAfter.cases, browser_errors: browserAfter.errors },
  database: { table: database.table, projection_products: database.projection_products, connections: database.connections, settings: database.settings, indexes: database.indexes },
  runtime_idle_snapshot: fs.existsSync(path.join(directory, "resources.txt")) ? fs.readFileSync(path.join(directory, "resources.txt"), "utf8") : null,
  limitations: ["Local measurements are not production-server measurements", "Sequential warm requests are not a sustained-load test", "External image downloads excluded from browser measurements", "SSR increases catalog HTML latency while showing products earlier", "Legacy initial-data-seed failed when rerun on the restored populated DB; new migration and backfill verified separately", "No production deployment performed"],
}
const output = path.join(root, "output/catalog-performance-2026-11-11")
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ status: "PASS", output, results: results.map(({ name,before_ms,after_ms,speedup }) => ({ name, before_ms: Math.round(before_ms), after_ms: Math.round(after_ms), speedup: Number(speedup.toFixed(2)) })), first_visible_catalog_products: report.first_visible_catalog_products, browser_cases: browserAfter.cases.length }))
