const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")

const root = path.resolve(__dirname, "../..")
const fixtureFile = path.resolve(process.argv[2] || "")
const destination = path.resolve(process.argv[3] || "")
if (!process.argv[2] || !process.argv[3]) throw Error("Usage: node qa/ui/run.cjs <UI fixture JSON> <result JSON> [private compose config]")
const f = JSON.parse(fs.readFileSync(fixtureFile, "utf8").replace(/^\uFEFF/, ""))
const targets = {
  "cms-remediation-fixed-20261109": { database: "cms_remediation_fixed_20261109", host: "remediation-fixed.localhost", admin: 19169, store: 18169, hmr: 15169 },
  "cms-remediation-restored-20261109": { database: "cms_remediation_restored_20261109", host: "remediation-restored.localhost", admin: 19179, store: 18179, hmr: 15179 },
}
const target = targets[f.project]
if (!target || !/^[a-f0-9]{12}$/.test(f.fixtureRunId) || !/^[a-f0-9]{64}$/.test(f.source_manifest_sha256)) throw Error("Browser fixture isolation/source guard failed")
const privateDirectory = path.join(root, ".local", f.project)
const configFile = path.resolve(process.argv[4] || path.join(privateDirectory, "compose.qa.json"))
if (configFile !== path.join(privateDirectory, "compose.qa.json")) throw Error("Only the exact isolated private compose config is allowed")
const config = JSON.parse(fs.readFileSync(configFile, "utf8").replace(/^\uFEFF/, ""))
const env = config.services.backend.environment
const db = new URL(env.DATABASE_URL)
if (config.name !== f.project || db.hostname !== "db" || db.pathname !== "/" + target.database) throw Error("Compose target identity mismatch")
if (!env.QA_ADMIN_PASSWORD || !env.QA_ADMIN_EMAIL) throw Error("Missing synthetic QA administrator credentials")
const cli = process.env.PLAYWRIGHT_CLI
if (!cli || !fs.existsSync(cli)) throw Error("Set PLAYWRIGHT_CLI to the installed playwright-core/lib/tools/cli-client/cli.js path")
const session = "remediation-ui-" + f.fixtureRunId
const admin = `http://${target.host}:${target.admin}`, store = `http://${target.host}:${target.store}`
// A partially submitted wizard is evidence. Do not replay its inputs or delete
// drafts to manufacture a green run; allocate a fresh tracked fixture instead.
fs.writeFileSync(path.join(privateDirectory, "ui-" + f.fixtureRunId + ".started.json"), JSON.stringify({ fixtureRunId: f.fixtureRunId, source_manifest_sha256: f.source_manifest_sha256 }), { flag: "wx" })
function command(args, timeout = 600000) {
  const result = cp.spawnSync(process.execPath, [cli, "-s=" + session, "--raw", ...args], { encoding: "utf8", timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0) throw Error("Browser CLI failed; inspect the private session locally. No credential-bearing output was copied.")
  return result.stdout
}
const template = fs.readFileSync(path.join(__dirname, "interfaces.template.js"), "utf8")
const replacements = { __FIXTURE__: f, __ADMIN_ORIGIN__: admin, __STORE_ORIGIN__: store, __HMR_ORIGIN__: `http://${target.host}:${target.hmr}`, __ADMIN_EMAIL__: env.QA_ADMIN_EMAIL, __ADMIN_PASSWORD__: env.QA_ADMIN_PASSWORD }
let script = template
for (const [key, value] of Object.entries(replacements)) script = script.replaceAll(key, JSON.stringify(value))
const temporary = path.join(privateDirectory, "browser-ui-" + f.fixtureRunId + ".js")
let result
try {
  fs.writeFileSync(temporary, script)
  command(["open", admin + "/app/login", "--browser", "chrome"], 60000)
  result = JSON.parse(command(["run-code", "--filename", temporary]))
} finally {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
}
if (result.project !== f.project || result.source_manifest_sha256 !== f.source_manifest_sha256 || !Array.isArray(result.cases)) throw Error("Malformed browser result")
fs.mkdirSync(path.dirname(destination), { recursive: true })
fs.writeFileSync(destination, JSON.stringify(result, null, 2))
const summary = result.cases.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {})
console.log(JSON.stringify({ result: destination, summary }))
process.exitCode = result.cases.length && result.cases.every((item) => item.status === "PASS") ? 0 : 1
