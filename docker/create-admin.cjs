const { readFileSync } = require("node:fs")
const { spawnSync } = require("node:child_process")

const { email, password } = JSON.parse(
  readFileSync("/credentials/admin-credentials.json", "utf8")
)
const result = spawnSync(
  "pnpm",
  ["exec", "medusa", "user", "-e", email, "-p", password],
  { encoding: "utf8" }
)

if (result.status !== 0) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`
  console.error(output.replaceAll(password, "[redacted]"))
  process.exit(result.status || 1)
}

console.log("Local administrator account created successfully.")
