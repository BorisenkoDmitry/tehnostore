import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const [row] = await service.listContentSettings({ key: "site" })
  res.setHeader("Cache-Control", "no-store")
  res.json({ settings: row?.published_data ?? null })
}
