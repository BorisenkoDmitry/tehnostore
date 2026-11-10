const fs = require("node:fs")
const path = require("node:path")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const root = path.resolve(__dirname, "..")
const local = createRequire(path.join(root, "apps/backend/package.json"))
const { Client } = local("@medusajs/framework/pg")
const providerEntry = local.resolve("@medusajs/search-postgres", { paths: [path.dirname(local.resolve("@medusajs/medusa/search-postgres"))] })
const filterPath = path.join(path.dirname(providerEntry), "utils/filters.js")
const patched = local(filterPath).toWhereClause
const originalSource = fs.readFileSync(path.join(root, "patches/@medusajs__search-postgres@2.22.3.patch"), "utf8").split("diff --git a/dist/utils/search-containment.cjs")[0].split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1)).join("\n")
const originalModule = { exports: {} }
new Function("require", "module", "exports", originalSource)(createRequire(filterPath), originalModule, originalModule.exports)
const original = originalModule.exports.toWhereClause
const plan = { fields: new Map([
  ["scope", { path: "scope", kind: "text", is_array: false }],
  ["status", { path: "status", kind: "text", is_array: false }],
  ["tags", { path: "tags", kind: "text", is_array: true }],
  ["price", { path: "price", kind: "number", is_array: false }],
  ["enabled", { path: "enabled", kind: "boolean", is_array: false }],
  ["nested.color", { path: "nested.color", kind: "text", is_array: false }],
]) }

async function main() {
  assert.equal(process.env.CATALOG_PERFORMANCE_TEST, "1", "Only the disposable benchmark stack may run this test")
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    assert.equal((await client.query("SELECT current_setting('catalog_performance.guard', true) AS guard")).rows[0].guard, "catalog-performance-20261110")
    const documents = [{ scope: "a", status: "published", tags: ["red", "large"], price: 10, enabled: true, nested: { color: "red" } }, { scope: "a", status: "draft", tags: ["blue"], price: 20, enabled: false, nested: { color: "blue" } }, { scope: "b", tags: [], price: 0 }, {}, { scope: "a", status: "published", tags: ["red", "blue"], price: 25, enabled: true }]
    const atom = [{ scope: "a" }, { scope: "b" }, { scope: null }, { scope: { $eq: null } }, { scope: { $ne: "b" } }, { scope: { $in: ["a", "b"] } }, { scope: { $in: ["a"] } }, { status: "published" }, { status: { $exists: false } }, { tags: "red" }, { tags: ["red", "blue"] }, { tags: { $contains: ["red", "blue"] } }, { tags: { $contains: [] } }, { tags: { $nin: ["red"] } }, { price: { $gte: 10 } }, { price: { $eq: "10" } }, { enabled: true }, { "nested.color": "red" }, { scope: "a' OR TRUE --" }, { scope: { $prefix: "a" } }]
    const cases = [...atom, ...atom.flatMap((first, i) => atom.filter((_, j) => j % 3 === i % 3).flatMap((second) => [{ $and: [first, second] }, { $or: [first, second] }, { $not: { $and: [first, second] } }]))]
    cases.push({ $and: [{ scope: "a", tags: ["red"] }, { scope: "b", tags: { $contains: ["blue"] } }] }, { $and: [{ scope: "a" }, { $or: [{ status: "draft" }, { tags: "red" }] }, { enabled: true }] })
    const ids = async (compiled) => {
      if (!compiled) return documents.map((_, index) => index)
      let index = 1
      const predicate = compiled.sql.replace(/\?/g, () => `$${index++}`)
      const documentParameter = `$${index}`
      const result = await client.query(`SELECT ordinal::int AS id FROM jsonb_array_elements(${documentParameter}::jsonb) WITH ORDINALITY AS d(indexed, ordinal) WHERE ${predicate} ORDER BY ordinal`, [...compiled.params, JSON.stringify(documents)])
      return result.rows.map(({ id }) => id)
    }
    for (const filter of cases) assert.deepEqual(await ids(patched(filter, plan)), await ids(original(filter, plan)), JSON.stringify(filter))
    const common = { $and: [{ status: "published", tags: ["red"] }, { scope: "a" }] }
    assert.equal((patched(common, plan).sql.match(/@>/g) || []).length, 1)
    assert.equal((original(common, plan).sql.match(/@>/g) || []).length, 3)
    console.log(JSON.stringify({ status: "PASS", postgres_equivalence_cases: cases.length, predicates_before: 3, predicates_after: 1 }))
  } finally { await client.end() }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
