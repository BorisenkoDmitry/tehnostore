import { writeFileSync } from "node:fs"
import { loadInsalesPlan, publicDryRunReport } from "./index"

// pnpm exec ts-node --transpile-only src/lib/insales/dry-run.ts SOURCE NAVIGATION COMPARISON OUTPUT
const [sourcePath, navigationPath, comparisonPath, outputPath] = process.argv.slice(2)
if (!sourcePath || !navigationPath || !comparisonPath || !outputPath) throw new Error("Usage: dry-run.ts SOURCE NAVIGATION COMPARISON OUTPUT")
const plan = loadInsalesPlan({ sourcePath, navigationPath, comparisonPath })
writeFileSync(outputPath, `${JSON.stringify(publicDryRunReport(plan), null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify(plan.summary, null, 2))
