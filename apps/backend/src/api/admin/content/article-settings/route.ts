import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"
import { ARTICLE_INDEX_SETTINGS_KEY, defaultArticleIndexSettings, type ArticleIndexSettingsInputType } from "../../../../modules/content/article-validation"
import { articleIndexSettingsWorkflow } from "../../../../workflows/article-index-settings"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const [row] = await req.scope.resolve<ContentModuleService>(CONTENT_MODULE).listContentSettings({ key: ARTICLE_INDEX_SETTINGS_KEY })
  const { expected_revision: _revision, ...defaults } = defaultArticleIndexSettings()
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ settings: { ...defaults, ...row?.data, revision: row?.revision ?? 0 } })
}
export async function POST(req: AuthenticatedMedusaRequest<ArticleIndexSettingsInputType>, res: MedusaResponse) {
  const { result } = await articleIndexSettingsWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
