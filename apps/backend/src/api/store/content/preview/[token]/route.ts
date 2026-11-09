import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../../../../../modules/content"
import ContentModuleService from "../../../../../modules/content/service"
import { readContentPreviewToken } from "../../../../../lib/content-preview"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = readContentPreviewToken(req.params.token)
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const page = await service.retrieveContentPage(token.id)
  if (page.revision !== token.revision) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Черновик изменён. Откройте новую ссылку предпросмотра")
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Robots-Tag", "noindex, nofollow")
  res.json({ page: { slug: page.slug, title: page.title, body: page.body, blocks: page.blocks, metadata: { ...page.metadata, noindex: true }, revision: page.revision, preview: true } })
}
