import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../../../modules/content"
import ContentModuleService from "../../../../../../modules/content/service"
import { createContentPreviewToken } from "../../../../../../lib/content-preview"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const page = await service.retrieveContentPage(req.params.id)
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ token: createContentPreviewToken(page.id, page.revision), expires_in: 900, page: { slug: page.slug, title: page.title, body: page.body, blocks: page.blocks, metadata: page.metadata, revision: page.revision, preview: true } })
}
