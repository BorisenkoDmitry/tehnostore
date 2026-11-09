import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../../modules/content"
import ContentModuleService from "../../../../../modules/content/service"
import { contentWorkflow } from "../../../../../workflows/content"
import type { ContentPageInputType } from "../../../../../modules/content/validation"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const page = await service.retrieveContentPage(req.params.id)
  res.json({ page })
}
export async function POST(req: AuthenticatedMedusaRequest<ContentPageInputType>, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "page-save", id: req.params.id, data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "page-delete", id: req.params.id, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
