import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../../../../modules/content"
import ContentModuleService from "../../../../modules/content/service"
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const kind = req.query.kind === "product" ? "product" : "shop"
  const product_id = typeof req.query.product_id === "string" ? req.query.product_id : undefined
  if (kind === "product" && !product_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите товар")
  if (product_id) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { id: product_id, status: "published" } })
    if (!data.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не найден")
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const [rows, count] = await service.listAndCountContentReviews({ status: "published", kind, ...(product_id ? { product_id } : {}) }, { take: limit, skip: offset, order: { position: "ASC", review_date: "DESC" } })
  const reviews = rows.map(({ id, kind, product_id, author, rating, body, media, review_date, position }) => ({ id, kind, product_id, author, rating, body, media, review_date, position }))
  res.setHeader("Cache-Control", "no-store")
  res.json({ reviews, count })
}
