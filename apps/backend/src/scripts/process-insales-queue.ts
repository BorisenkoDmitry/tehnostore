import type { ExecArgs } from "@medusajs/framework/types"
import { processInsalesImportWorkflow } from "../workflows/process-insales-import"

/** Optional operator kick; the scheduled job normally processes this queue. */
export default async function processInsalesQueue({ container }: ExecArgs) {
  await processInsalesImportWorkflow(container).run({ input: {} })
}
