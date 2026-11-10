const fs = require("node:fs")
const path = require("node:path")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const local = createRequire(path.resolve(__dirname, "../apps/backend/package.json"))
const { Client } = local("@medusajs/framework/pg")

async function main() {
  assert.equal(process.env.CATALOG_PERFORMANCE_TEST, "1")
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    assert.equal((await client.query("SELECT current_setting('catalog_performance.guard',true) AS guard")).rows[0].guard, "catalog-performance-20261110")
    await client.query("BEGIN READ ONLY")
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'search_pg_product_v%' ORDER BY tablename")).rows
    const table = tables.map(({ tablename }) => tablename).filter((name) => /^search_pg_product_v\d+$/.test(name)).sort((a, b) => Number(b.split("_v")[1]) - Number(a.split("_v")[1]))[0]
    assert(table)
    const { scope, channels } = (await client.query(`SELECT indexed->>'catalog_scope' AS scope,indexed->'sales_channel_ids' AS channels FROM "${table}" WHERE indexed->>'catalog_scope' IS NOT NULL AND jsonb_array_length(indexed->'sales_channel_ids')>0 LIMIT 1`)).rows[0]
    const status = { status: "published" }, channel = { sales_channel_ids: [channels[0]] }, catalog = { catalog_scope: scope }
    const explain = async (sql, values) => {
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*) FROM "${table}" WHERE ${sql}`, values)
      return result.rows[0]["QUERY PLAN"][0]
    }
    const before = [], after = []
    for (let i = 0; i < 6; i++) {
      before.push(await explain("indexed @> $1::jsonb AND indexed @> $2::jsonb AND indexed @> $3::jsonb", [status, channel, catalog].map(JSON.stringify)))
      after.push(await explain("indexed @> $1::jsonb", [JSON.stringify({ ...status, ...channel, ...catalog })]))
    }
    const settings = (await client.query("SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','jit') ORDER BY name")).rows
    const connections = (await client.query("SELECT state,count(*)::int FROM pg_stat_activity WHERE datname=current_database() GROUP BY state")).rows
    const sizes = (await client.query("SELECT relname,n_live_tup,n_dead_tup,pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables WHERE relname=$1 OR relname='catalog_variant_search'", [table])).rows
    const projectionCount = (await client.query("SELECT count(*)::int AS count FROM catalog_variant_search WHERE deleted_at IS NULL")).rows[0].count
    const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND (tablename=$1 OR tablename IN ('product','catalog_attribute','catalog_variant_search')) ORDER BY tablename,indexname", [table])).rows
    await client.query("ROLLBACK")
    const median = (values) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)]
    const data = { captured_at: new Date().toISOString(), table, projection_products: projectionCount, median_sql_before_ms: median(before.slice(1).map((plan) => plan["Execution Time"])), median_sql_after_ms: median(after.slice(1).map((plan) => plan["Execution Time"])), settings, connections, sizes, indexes, plans: { before, after } }
    fs.writeFileSync(process.argv[2], JSON.stringify(data, null, 2))
    console.log(JSON.stringify({ status: "PASS", table, projection_products: projectionCount, before_ms: data.median_sql_before_ms, after_ms: data.median_sql_after_ms, connections }))
  } finally { await client.end() }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
