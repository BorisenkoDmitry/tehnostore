const fs = require("node:fs")
const path = require("node:path")
const { performance } = require("node:perf_hooks")
const { createHash } = require("node:crypto")

const root = path.resolve(__dirname, "..")
const env = fs.readFileSync(path.join(root, ".env"), "utf8")
const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=["']?([^\r\n"']+)/m)?.[1]
if (!key) throw new Error("A publishable key is required")
const api = process.env.BENCHMARK_API || "http://localhost:9100"
const site = process.env.BENCHMARK_SITE || "http://localhost:8100"
const headers = { "x-publishable-api-key": key, "content-type": "application/json" }
const count = Number(process.env.BENCHMARK_RUNS || 20)

async function request(url, body) {
  const start = performance.now()
  const response = await fetch(url, { headers, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url.split("?")[0]}: ${response.status} ${text.slice(0, 200)}`)
  return { ms: performance.now() - start, bytes: Buffer.byteLength(text), text, sha256: createHash("sha256").update(text).digest("hex") }
}
const quantile = (values, q) => values[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)]

async function main() {
  for (const url of [`${api}/health`, `${site}/robots.txt`]) {
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!ready) throw new Error(`Benchmark service is not ready: ${url}`)
  }
  const config = JSON.parse((await request(`${api}/store/catalog-config`)).text)
  const products = JSON.parse((await request(`${api}/store/products?limit=100&fields=id,handle,title,metadata`)).text).products
  const product = products.find((product) => product.metadata?.insales_product_id && !product.metadata?.is_catalog_example && !product.metadata?.catalog_example)
  if (!product?.id) throw new Error("No imported merchant product in benchmark database")
  const search = { entity: "product", filters: { catalog_scope: config.scope }, pagination: { take: 12 }, search_options: { count: "exact", facets: [{ field: "option_values", limit: 5000 }] } }
  const discovery = JSON.parse((await request(`${api}/store/search`, search)).text)
  const facet = discovery.results[0].facets?.option_values
  const entries = Array.isArray(facet) ? facet : facet?.values || []
  const tokens = entries.map((entry) => typeof entry === "string" ? entry : entry.value)
  const canonical = (value) => value.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim().replace(/\s*:\s*/g, ":").replace(/^объем встроенной памяти(?=:|$)/, "встроенная память").replace(/(\d+(?:[.,]\d+)?)\s*(гб|gb|мб|mb|тб|tb)(?=$|[\s,;/)])/g, (_, a, u) => `${a.replace(",", ".")} ${{гб:"gb",gb:"gb",мб:"mb",mb:"mb",тб:"tb",tb:"tb"}[u]}`)
  const groups = new Map()
  for (const token of tokens.filter(Boolean)) {
    const value = canonical(token)
    const field = value.split(":")[0]
    if (!groups.has(field)) groups.set(field, value)
  }
  const chosen = [groups.get("цвет"), groups.get("встроенная память") || groups.get("размер")].filter(Boolean)
  if (chosen.length < 2) chosen.splice(0, chosen.length, ...[...groups.values()].slice(0, 2))
  const filtered = { ...search, filters: { catalog_scope: config.scope, $and: chosen.map((value) => ({ filter_values: value })) } }
  const cases = [
    ["catalog_config", `${api}/store/catalog-config`],
    ["product_details", `${api}/store/catalog-products/${product.id}`],
    ["catalog_search", `${api}/store/search`, { ...search, search_options: { count: "exact" } }],
    ["catalog_facets", `${api}/store/search`, search],
    ["catalog_two_filters", `${api}/store/search`, filtered],
    ["product_page", `${site}/ru/products/${product.handle}`],
    ["catalog_page", `${site}/ru/store`],
  ]
  const results = []
  for (const [name, url, body] of cases) {
    const cold = await request(url, body)
    for (let i = 0; i < 3; i++) await request(url, body)
    const samples = []
    let bytes
    let firstBody
    let sha256
    for (let i = 0; i < count; i++) {
      const sample = await request(url, body)
      samples.push(sample.ms)
      bytes = sample.bytes
      sha256 = sample.sha256
      if (i === 0 && body) firstBody = JSON.parse(sample.text).results.map((result) => ({ ids: result.hits.map((hit) => hit.id), count: result.metadata?.count, facets: result.facets }))
    }
    const sorted = [...samples].sort((a, b) => a - b)
    const result = { name, first_ms: cold.ms, median_ms: quantile(sorted, 0.5), p95_ms: quantile(sorted, 0.95), bytes, sha256, samples_ms: samples, ...(firstBody ? { result: firstBody } : {}) }
    results.push(result)
    console.log(`${name}: median=${result.median_ms.toFixed(1)}ms p95=${result.p95_ms.toFixed(1)}ms bytes=${bytes}`)
  }
  const output = path.resolve(process.argv[2] || path.join(root, ".local/performance-20261110/benchmark.json"))
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify({ captured_at: new Date().toISOString(), api, site, runs: count, product: { id: product.id, handle: product.handle }, filters: chosen, results }, null, 2))
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
