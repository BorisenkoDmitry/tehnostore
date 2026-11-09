import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
import { contentWorkflow } from "../../../../workflows/content"
import type { ContentPageInputType } from "../../../../modules/content/validation"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const order = readTableOrder(req.query.order, ["title", "slug", "status", "created_at", "updated_at"], "-updated_at")
  const [pages, count] = await service.listAndCountContentPages({}, { take: limit, skip: offset, order })
  res.json({ pages, count })
}
export async function POST(req: AuthenticatedMedusaRequest<ContentPageInputType>, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "page-save", data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.status(201).json(result)
}
import { readTableOrder } from "../../../../lib/admin-table-order"
