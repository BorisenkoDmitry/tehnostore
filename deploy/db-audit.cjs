const fs = require('node:fs')
const { createRequire } = require('node:module')
const { Client } = createRequire('/server/apps/storefront/package.json')('pg')
const quote = value => '"' + value.replaceAll('"', '""') + '"'
async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const identity = (await db.query('SELECT current_database() database,current_user username')).rows[0]
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows
  const report = { identity, tables: {}, foreign_keys: {}, logical_links: {}, active_logical_links: {} }
  for (const { tablename } of tables) {
    const name = quote(tablename)
    const row = (await db.query(`SELECT count(*)::int count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) digest FROM (SELECT md5(row_to_json(t)::text) h FROM public.${name} t) x`)).rows[0]
    report.tables[tablename] = row
  }
  const fks = (await db.query(`SELECT c.conname,c.conrelid::regclass::text child,c.confrelid::regclass::text parent,
    array_agg(a.attname::text ORDER BY k.ord) child_columns,array_agg(b.attname::text ORDER BY k.ord) parent_columns
    FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(a,b,ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.a
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.b
    WHERE c.contype='f' AND c.connamespace='public'::regnamespace GROUP BY c.oid`)).rows
  for (const fk of fks) {
    const condition = fk.child_columns.map((col,i) => `p.${quote(fk.parent_columns[i])}=c.${quote(col)}`).join(' AND ')
    const nonnull = fk.child_columns.map(col => `c.${quote(col)} IS NOT NULL`).join(' AND ')
    report.foreign_keys[fk.child + '.' + fk.conname] = Number((await db.query(`SELECT count(*) FROM ${fk.child} c WHERE ${nonnull} AND NOT EXISTS(SELECT 1 FROM ${fk.parent} p WHERE ${condition})`)).rows[0].count)
  }
  const links = [
    ['product_variant','product_id','product'],
    ['product_variant_price_set','variant_id','product_variant'],
    ['product_variant_price_set','price_set_id','price_set'],
    ['price','price_set_id','price_set'],
    ['product_variant_inventory_item','variant_id','product_variant'],
    ['product_variant_inventory_item','inventory_item_id','inventory_item'],
    ['inventory_level','inventory_item_id','inventory_item'],
    ['inventory_level','location_id','stock_location'],
    ['order','customer_id','customer'],
    ['order_item','order_id','order'],
    ['order_item','item_id','order_line_item'],
    ['order_payment_collection','order_id','order'],
    ['order_payment_collection','payment_collection_id','payment_collection'],
    ['product_sales_channel','product_id','product'],
    ['product_sales_channel','sales_channel_id','sales_channel'],
  ]
  for (const [table,column,parent] of links) {
    report.logical_links[`${table}.${column}->${parent}`] = Number((await db.query(`SELECT count(*) FROM ${quote(table)} c WHERE c.${quote(column)} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ${quote(parent)} p WHERE p.id=c.${quote(column)})`)).rows[0].count)
    report.active_logical_links[`${table}.${column}->${parent}`] = Number((await db.query(`SELECT count(*) FROM ${quote(table)} c WHERE c.deleted_at IS NULL AND c.${quote(column)} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ${quote(parent)} p WHERE p.id=c.${quote(column)})`)).rows[0].count)
  }
  await db.query('ROLLBACK')
  await db.end()
  const output = process.argv[2] || '/tmp/db-audit.json'
  fs.writeFileSync(output, JSON.stringify(report,null,2))
  console.log(JSON.stringify({output,identity,tables:tables.length,counts:Object.fromEntries(['product','product_variant','price','inventory_item','inventory_level','customer','order','store','region','content_settings','content_page','site_navigation'].map(x=>[x,report.tables[x]?.count])),foreign_key_orphans:Object.values(report.foreign_keys).reduce((a,b)=>a+b,0),logical_orphans:report.logical_links}))
}
main().catch(error => { console.error(error.message); process.exit(1) })
