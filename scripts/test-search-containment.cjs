const fs = require("node:fs")
const path = require("node:path")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const root = process.env.SEARCH_TEST_ROOT || path.resolve(__dirname, "..")
const local = createRequire(path.join(root, "apps/backend/package.json"))
const { Client } = local("@medusajs/framework/pg")
const providerEntry = local.resolve("@medusajs/search-postgres", { paths: [path.dirname(local.resolve("@medusajs/medusa/search-postgres"))] })
const filterPath = path.join(path.dirname(providerEntry), "utils/filters.js")
const patch = fs.readFileSync(path.join(root, "patches/@medusajs__search-postgres@2.22.3.patch"), "utf8").split("diff --git a/dist/utils/search-containment.cjs")[0].split("\n")
const originalSource = patch.filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1)).join("\n")
const patchedSource = patch.filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n")
const patchedModule = { exports: {} }
const providerRequire = createRequire(filterPath)
const candidateRequire = (name) => name === "./search-containment.cjs" ? require(path.join(root, "patches/search-containment.cjs")) : providerRequire(name)
new Function("require", "module", "exports", patchedSource)(candidateRequire, patchedModule, patchedModule.exports)
const patched = patchedModule.exports.toWhereClause
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
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    // Only JSON parameters are queried. No application tables are read or written.
    await client.query("BEGIN READ ONLY")
    await client.query("SET LOCAL statement_timeout = '5s'")
    const documents = [{ scope: "a", status: "published", tags: ["red", "large"], price: 10, enabled: true, nested: { color: "red" } }, { scope: "a", status: "draft", tags: ["blue"], price: 20, enabled: false, nested: { color: "blue" } }, { scope: "b", tags: [], price: 0 }, {}, { scope: "a", status: "published", tags: ["red", "blue"], price: 25, enabled: true }]
    const atom = [{ scope: "a" }, { scope: "b" }, { scope: null }, { scope: { $eq: null } }, { scope: { $ne: "b" } }, { scope: { $in: ["a", "b"] } }, { scope: { $in: ["a"] } }, { status: "published" }, { status: { $exists: false } }, { tags: "red" }, { tags: ["red", "blue"] }, { tags: { $contains: ["red", "blue"] } }, { tags: { $contains: [] } }, { tags: { $nin: ["red"] } }, { price: { $gte: 10 } }, { price: { $eq: "10" } }, { enabled: true }, { "nested.color": "red" }, { scope: "a' OR TRUE --" }, { scope: { $prefix: "a" } }]
    documents.push({ tags: null }, { tags: "red" }, { tags: { red: true } }, { tags: [1, true, null, ["red"]] })
    atom.push({ tags: { $in: ["red", "blue"] } }, { tags: { $nin: ["red", "blue"] } }, { tags: { $in: ["red", null] } }, { tags: { $overlaps: ["red", "blue"] } }, { tags: { $in: [] } }, { tags: { $in: ["red' OR TRUE --", "blue"] } })
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
    let comparisons = 0
    for (const kind of ["text", "keyword"]) {
      plan.fields.get("tags").kind = kind
      for (const filter of cases) {
        assert.deepEqual(await ids(patched(filter, plan)), await ids(original(filter, plan)), JSON.stringify(filter))
        comparisons++
      }
    }
    const common = { $and: [{ status: "published", tags: ["red"] }, { scope: "a" }] }
    assert.equal((patched(common, plan).sql.match(/@>/g) || []).length, 1)
    assert.equal((original(common, plan).sql.match(/@>/g) || []).length, 3)
    assert(patched({ tags: { $in: ["red", "blue"] } }, plan).sql.includes("jsonb_exists_any"))
    if (process.env.SEARCH_ASSERT_INSTALLED === "1") {
      assert.equal(fs.readFileSync(filterPath, "utf8").trim(), patchedSource.trim(), "Installed provider must match the reviewed patch")
    }
    await client.query("ROLLBACK")
    console.log(JSON.stringify({ status: "PASS", postgres_equivalence_cases: comparisons, predicates_before: 3, predicates_after: 1 }))
  } finally { await client.end() }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
