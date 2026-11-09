import { model } from "@medusajs/framework/utils"
import InsalesImportJob from "./import-job"

// Large private data is isolated so polling/progress never rereads source/costs.
const InsalesImportPayload = model.define("insales_import_payload", {
  id: model.id({ prefix: "inspayload" }).primaryKey(),
  source_base64: model.text(),
  backup: model.json<Record<string, unknown>>().nullable(),
  job: model.belongsTo(() => InsalesImportJob, { mappedBy: "source" }),
})

export default InsalesImportPayload
