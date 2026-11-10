import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"
import { ContentArticleListQuery, type ContentArticleInputType } from "../../../../modules/content/article-validation"
import { contentArticlesWorkflow } from "../../../../workflows/content-articles"
import { readTableOrder } from "../../../../lib/admin-table-order"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = ContentArticleListQuery.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Неверные параметры списка статей")
  const { limit, offset, order } = parsed.data
  const service = req.scope.resolve<ContentModuleService>(CONTENT_MODULE)
  const [articles, count] = await service.listAndCountContentArticles({}, {
    take: limit, skip: offset, order: readTableOrder(order, ["title", "slug", "created_at", "updated_at"], "-created_at"),
    select: ["id", "title", "slug", "excerpt", "cover_image", "cover_alt", "revision", "created_at", "updated_at"],
  })
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ articles, count, limit, offset })
}

export async function POST(req: AuthenticatedMedusaRequest<ContentArticleInputType>, res: MedusaResponse) {
  const { result } = await contentArticlesWorkflow(req.scope).run({ input: { operation: "save", data: req.validatedBody } })
  res.status(201).json(result)
}
