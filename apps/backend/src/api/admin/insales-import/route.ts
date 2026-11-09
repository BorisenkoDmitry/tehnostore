import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INSALES_IMPORT_MODULE } from "../../../modules/insales-import"
import InsalesImportModuleService from "../../../modules/insales-import/service"
import { publicImportJob } from "../../../lib/insales-admin"
import { readTableOrder } from "../../../lib/admin-table-order"
import { saveInsalesImportJobWorkflow } from "../../../workflows/insales-admin"
import type { CreateInsalesImportInput } from "./validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<InsalesImportModuleService>(INSALES_IMPORT_MODULE)
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 50)))
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0))
  const order = readTableOrder(req.query.order, ["filename", "status", "created_at"], "-created_at")
  const [jobs, count] = await service.listAndCountInsalesImportJobs({}, { take: limit, skip: offset, order, select: ["id", "filename", "source_sha256", "actor_id", "status", "progress", "error", "created_at", "updated_at"] })
  res.json({ jobs, count })
}

export async function POST(req: AuthenticatedMedusaRequest<CreateInsalesImportInput>, res: MedusaResponse) {
  const { result } = await saveInsalesImportJobWorkflow(req.scope).run({ input: { ...req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.status(201).json({ job: publicImportJob(result) })
}
