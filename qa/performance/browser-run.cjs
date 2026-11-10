const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const phase = process.argv[2]
if (!["before", "after"].includes(phase)) throw new Error("Expected before or after")
const root = path.resolve(__dirname, "../..")
const cli = process.env.PLAYWRIGHT_CLI || "C:/Users/Дмитрий/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core/lib/tools/cli-client/cli.js"
async function main() {
for (const url of ["http://localhost:9100/health", "http://localhost:8100/robots.txt"]) {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error(`Browser test service is not ready: ${url}`)
}
const file = path.join(root, ".local/performance-20261110/browser-current.js")
fs.writeFileSync(file, fs.readFileSync(path.join(__dirname, "browser.js"), "utf8").replace("__FUNCTIONAL__", String(phase === "after")))
const result = spawnSync(process.execPath, [cli, "-s=catalog-performance", "--raw", "run-code", "--filename", file], { cwd: root, encoding: "utf8", timeout: 120000, windowsHide: true })
if (result.status !== 0) throw new Error(result.stdout || result.stderr)
let data
try { data = JSON.parse(result.stdout) } catch { console.error(result.stdout); throw new Error("Browser CLI did not return JSON") }
fs.writeFileSync(path.join(root, `.local/performance-20261110/browser-${phase}.json`), JSON.stringify(data, null, 2))
console.log(JSON.stringify({ ...data, prefetch_requests: data.prefetch_requests.length }))
if (data.errors.length || data.cases.some(({ pass }) => !pass)) process.exitCode = 1
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
