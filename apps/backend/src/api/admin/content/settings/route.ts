import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
import { contentWorkflow } from "../../../../workflows/content"
import type { ContentSettingsInputType } from "../../../../modules/content/validation"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const [settings] = await service.listContentSettings({ key: "site" })
  res.json({ settings: settings ?? null })
}
export async function POST(req: AuthenticatedMedusaRequest<ContentSettingsInputType>, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "settings-save", data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
