const fs = require("node:fs")
const path = require("node:path")
const { createHash, randomUUID } = require("node:crypto")
const { createRequire } = require("node:module")
const allowed = Object.freeze({
  cms_remediation_baseline_20261109: "cms-remediation-baseline-20261109",
  cms_remediation_fixed_20261109: "cms-remediation-fixed-20261109",
  cms_remediation_restored_20261109: "cms-remediation-restored-20261109",
})
function assertTarget(env = process.env) {
  const database = new URL(env.DATABASE_URL || "http://invalid")
  const name = database.pathname.slice(1)
  if (database.protocol !== "postgresql:" || database.hostname !== "db" || database.username !== "clothing_runner" || allowed[name] !== env.QA_PROJECT) throw Error("Isolation guard: only exact remediation project/database pairs are allowed")
  return { database: name, project: env.QA_PROJECT, url: database.toString() }
}
function createContext() {
  const target = assertTarget()
  const root = path.resolve(__dirname, "../..")
  const { Client } = createRequire(path.join(root, "apps/storefront/package.json"))("pg")
  const db = new Client({ connectionString: target.url })
  const runId = randomUUID().replaceAll("-", "").slice(0, 12)
  const report = { runId, target: { project: target.project, database: target.database }, started_at: new Date().toISOString(), cases: [], calls: [], fixtures: [], runtime: {} }
  let token, key, ready = false
  const check = (id, condition, evidence = {}) => report.cases.push({ ...evidence, id, status: condition ? "PASS" : "FAIL" })
  const blocked = (id, reason) => report.cases.push({ id, status: "BLOCKED", reason })
  const ok = (response, label = "request") => {
    if (response.status < 200 || response.status >= 300) throw Error(`${label}: HTTP ${response.status}`)
    return response.data
  }
  const track = (type, id) => { if (!id) throw Error("Missing tracked fixture ID"); report.fixtures.push({ type, id }); return id }
  async function request(route, method = "GET", body, headers = {}, mode = "store") {
    if (!ready && method !== "GET" && route !== "/auth/user/emailpass") throw Error("Preflight must complete before first write")
    if (!route.startsWith("/") || route.startsWith("//")) throw Error("Only relative API paths allowed")
    const form = typeof FormData !== "undefined" && body instanceof FormData
    const response = await fetch("http://127.0.0.1:9000" + route, {
      method, redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { ...(body !== undefined && !form ? { "content-type": "application/json" } : {}), ...(mode === "admin" && token ? { authorization: "Bearer " + token } : {}), ...(mode === "store" && key ? { "x-publishable-api-key": key } : {}), ...headers },
      ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    let data = {}
    try { data = JSON.parse(text) } catch { /* Keep raw HTML out of reports. */ }
    report.calls.push({ method, path: route.split("?")[0].replace(/(\/preview\/)[^/]+/gi, "$1[REDACTED]"), status: response.status })
    return { status: response.status, data, headers: response.headers, text }
  }
  const ar = (route, method, body) => request("/admin" + route, method, body, {}, "admin")
  const sr = (route, method, body, headers) => request("/store" + route, method, body, headers)
  const auth = (route, body) => request("/auth" + route, "POST", body, {}, "auth")
  async function init() {
    await db.connect()
    await db.query("SET default_transaction_read_only = on")
    const identity = (await db.query("SELECT current_database() database,current_user username,current_setting('default_transaction_read_only') read_only")).rows[0]
    if (identity.database !== target.database || identity.username !== "clothing_runner" || identity.read_only !== "on") throw Error("Database identity/read-only guard failed")
    if ((await request("/health")).status !== 200) throw Error("Backend health check failed")
    const manifestPath = path.join(root, "qa-source-manifest.json")
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""))
      const mismatches = []
      const overlays = []
      for (const file of manifest) {
        const targetPath = path.join(root, file.path)
        // Isolated fixed/restored compose projects mount a private per-instance
        // Medusa config over this source file. Record that exact runtime hash
        // instead of misreporting the intentional target-specific overlay.
        if (file.path === "apps/backend/medusa-config.ts" && ["cms_remediation_fixed_20261109", "cms_remediation_restored_20261109"].includes(target.database)) {
          if (fs.existsSync(targetPath)) overlays.push({ path: file.path, sha256: createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex") })
          else mismatches.push(file.path)
          continue
        }
        if (!fs.existsSync(targetPath) || createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex") !== file.sha256) mismatches.push(file.path)
      }
      report.runtime.source_files = manifest.length
      report.runtime.source_manifest_sha256 = createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex")
      report.runtime.source_overlays = overlays
      report.runtime.mismatches = mismatches
      if (mismatches.length) throw Error("Runtime source differs from immutable snapshot")
    } else if (target.database !== "cms_remediation_baseline_20261109") throw Error("Missing runtime source manifest")
    report.runtime.node = process.version
    report.runtime.medusa = require(path.join(root, "apps/backend/node_modules/@medusajs/medusa/package.json")).version
    report.runtime.lock_sha256 = createHash("sha256").update(fs.readFileSync(path.join(root, "pnpm-lock.yaml"))).digest("hex")
    ready = true
    token = ok(await auth("/user/emailpass", { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD }), "admin login").token
    key = ok(await ar("/api-keys?type=publishable"), "publishable key").api_keys.find(item => item.type === "publishable")?.token
    if (!key) throw Error("Missing publishable API key")
    report.target.read_only_sql = true
  }
  async function runCase(id, fn) {
    try { await fn() } catch (error) { blocked(id, error.message?.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")) }
  }
  async function finish(destination) {
    report.finished_at = new Date().toISOString()
    report.summary = report.cases.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {})
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, JSON.stringify(report, null, 2))
    await db.end().catch(() => {})
    const unsuccessful = report.cases.length === 0 || report.cases.some(item => item.status !== "PASS")
    console.log(JSON.stringify({ file: destination, runId, summary: report.summary, exit_code: unsuccessful ? 1 : 0 }))
    process.exitCode = unsuccessful ? 1 : 0
  }
  return { root, target, runId, marker: runId, report, db, fs, randomUUID, createHash, request, ar, sr, auth, ok, check, blocked, track, init, runCase, finish, adminHeaders: () => ({ authorization: "Bearer " + token }), storeHeaders: () => ({ "x-publishable-api-key": key }), deny: response => [400,401,403,404,409,422].includes(response.status) }
}
module.exports = { assertTarget, createContext }
