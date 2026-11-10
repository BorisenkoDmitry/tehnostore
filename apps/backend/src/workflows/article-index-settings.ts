import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { ARTICLE_INDEX_SETTINGS_KEY, ArticleIndexSettingsInput, type ArticleIndexSettingsInputType } from "../modules/content/article-validation"

type Snapshot = { id: string; previous: Awaited<ReturnType<ContentModuleService["retrieveContentSettings"]>> | null }
export const saveArticleIndexSettingsStep = createStep("save-article-index-settings", async (input: ArticleIndexSettingsInputType, { container }) => {
  const parsed = ArticleIndexSettingsInput.safeParse(input)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Проверьте настройки страницы статей")
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const result = await container.resolve(Modules.LOCKING).execute("texno-content:article-index-settings", async () => {
    const [previous] = await service.listContentSettings({ key: ARTICLE_INDEX_SETTINGS_KEY })
    const { expected_revision, ...data } = parsed.data
    if ((previous?.revision ?? 0) !== expected_revision) throw new MedusaError(MedusaError.Types.CONFLICT, "Настройки уже изменены. Закройте окно и откройте его снова")
    const settings = previous
      ? await service.updateContentSettings({ id: previous.id, data, revision: previous.revision + 1 })
      : await service.createContentSettings({ key: ARTICLE_INDEX_SETTINGS_KEY, data, revision: 1 })
    return new StepResponse({ settings: { ...data, revision: settings.revision } }, { id: settings.id, previous: previous ?? null } as Snapshot)
  }, { timeout: 20 })
  return new StepResponse(result.output, result.compensateInput)
}, async (snapshot: Snapshot | undefined, { container }) => {
  if (!snapshot) return
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  if (!snapshot.previous) await service.deleteContentSettings(snapshot.id)
  else {
    const { created_at: _created, updated_at: _updated, deleted_at: _deleted, ...previous } = snapshot.previous
    await service.updateContentSettings(previous)
  }
})
export const articleIndexSettingsWorkflow = createWorkflow("article-index-settings", function (input: ArticleIndexSettingsInputType) {
  return new WorkflowResponse(saveArticleIndexSettingsStep(input))
})
