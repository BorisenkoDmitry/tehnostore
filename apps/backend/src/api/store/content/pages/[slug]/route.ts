import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../../../../../modules/content"
import ContentModuleService from "../../../../../modules/content/service"
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const [row] = await service.listContentPages({ slug: req.params.slug, status: "published" }, { take: 1 })
  if (!row?.published_snapshot) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Страница не найдена")
  res.setHeader("Cache-Control", "no-store")
  res.json({ page: { ...row.published_snapshot, published_at: row.published_at } })
}
