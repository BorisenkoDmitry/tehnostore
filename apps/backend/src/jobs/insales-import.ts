import { MedusaContainer } from "@medusajs/framework/types"
import { processInsalesImportWorkflow } from "../workflows/process-insales-import"

export default async function insalesImportJob(container: MedusaContainer) {
  await processInsalesImportWorkflow(container).run({ input: {} })
}

export const config = { name: "texno-insales-import", schedule: "* * * * *" }
