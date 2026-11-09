import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const rows = await service.listContentPages({ status: "published" }, { take: 1000, order: { slug: "ASC" } })
  const pages = rows.flatMap((row) => row.published_snapshot ? [{ slug: row.published_snapshot.slug, title: row.published_snapshot.title, metadata: row.published_snapshot.metadata, revision: row.published_snapshot.revision, published_at: row.published_at }] : [])
  res.setHeader("Cache-Control", "no-store")
  res.json({ pages, count: pages.length })
}
