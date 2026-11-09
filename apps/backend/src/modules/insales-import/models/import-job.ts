import { model } from "@medusajs/framework/utils"
import InsalesImportPayload from "./import-payload"

const InsalesImportJob = model.define("insales_import_job", {
  id: model.id({ prefix: "insjob" }).primaryKey(),
  filename: model.text(),
  source_sha256: model.text(),
  has_backup: model.boolean().default(false),
  source: model.hasOne(() => InsalesImportPayload, { mappedBy: "job" }).nullable(),
  actor_id: model.text(),
  status: model.enum(["preview", "queued", "running", "completed", "review", "failed", "cancelled"]).default("preview"),
  report: model.json<Record<string, unknown>>(),
  progress: model.json<Record<string, unknown>>(),
  error: model.text().nullable(),
}).indexes([{ on: ["status", "created_at"] }])

export default InsalesImportJob
