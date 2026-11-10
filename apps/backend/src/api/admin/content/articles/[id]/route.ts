import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../../../../../modules/content"
import type ContentModuleService from "../../../../../modules/content/service"
import { ContentArticleDeleteQuery, type ContentArticleInputType } from "../../../../../modules/content/article-validation"
import { contentArticlesWorkflow } from "../../../../../workflows/content-articles"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const article = await req.scope.resolve<ContentModuleService>(CONTENT_MODULE).retrieveContentArticle(req.params.id)
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ article })
}

export async function POST(req: AuthenticatedMedusaRequest<ContentArticleInputType>, res: MedusaResponse) {
  const { result } = await contentArticlesWorkflow(req.scope).run({ input: { operation: "save", id: req.params.id, data: req.validatedBody } })
  res.json(result)
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = ContentArticleDeleteQuery.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Для удаления укажите текущую версию статьи")
  const { expected_revision } = parsed.data
  const { result } = await contentArticlesWorkflow(req.scope).run({ input: { operation: "delete", id: req.params.id, expected_revision } })
  res.json(result)
}
