import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INSALES_IMPORT_MODULE } from "../../../../modules/insales-import"
import InsalesImportModuleService from "../../../../modules/insales-import/service"
import { publicImportJob } from "../../../../lib/insales-admin"
import { saveInsalesImportJobWorkflow } from "../../../../workflows/insales-admin"
import type { ActionInsalesImportInput } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<InsalesImportModuleService>(INSALES_IMPORT_MODULE)
  res.json({ job: publicImportJob(await service.retrieveInsalesImportJob(req.params.id) as unknown as Record<string, unknown>) })
}

export async function POST(req: AuthenticatedMedusaRequest<ActionInsalesImportInput>, res: MedusaResponse) {
  const { result } = await saveInsalesImportJobWorkflow(req.scope).run({ input: { id: req.params.id, action: req.validatedBody.action, actor_id: req.auth_context.actor_id } })
  res.json({ job: result })
}
