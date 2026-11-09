import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../../modules/content"
import ContentModuleService from "../../../../../modules/content/service"
import { contentWorkflow } from "../../../../../workflows/content"
import type { ContentLeadUpdateType } from "../../../../../modules/content/validation"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ lead: await service.retrieveContentLead(req.params.id) })
}
export async function POST(req: AuthenticatedMedusaRequest<ContentLeadUpdateType>, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "lead-update", id: req.params.id, data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "lead-delete", id: req.params.id, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
