const { spawnSync } = require("node:child_process")
const path = require("node:path")
const { createRequire } = require("node:module")

const types = new Set(["unit", "integration:http", "integration:modules"])
const type = process.argv[2]
if (!types.has(type)) throw new Error("Expected unit, integration:http or integration:modules")
const cwd = path.resolve(__dirname, "../apps/backend")
const localRequire = createRequire(path.join(cwd, "package.json"))
const result = spawnSync(process.execPath, [localRequire.resolve("jest/bin/jest"), "--runInBand", "--forceExit", ...process.argv.slice(3)], {
  cwd,
  stdio: "inherit",
  env: { ...process.env, TEST_TYPE: type, NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" ") },
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
