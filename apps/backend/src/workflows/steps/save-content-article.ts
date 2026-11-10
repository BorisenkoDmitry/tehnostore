import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../../modules/content"
import type ContentModuleService from "../../modules/content/service"
import { ContentArticleInput } from "../../modules/content/article-validation"

export type ArticleOperation = { operation: "save" | "delete"; id?: string; data?: unknown; expected_revision?: number }
type Article = Awaited<ReturnType<ContentModuleService["retrieveContentArticle"]>>
type Snapshot = { id: string; previous: Article | null; deleted?: boolean }

// Both slug uniqueness and revision checks run inside the same lock.
export async function mutateContentArticle(input: ArticleOperation, container: MedusaContainer) {
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  return container.resolve(Modules.LOCKING).execute("texno-content:articles", async () => {
    const previous = input.id ? await service.retrieveContentArticle(input.id) : null
    if (input.operation === "delete") {
      if (!previous) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Статья не найдена")
      if (previous.revision !== input.expected_revision) throw new MedusaError(MedusaError.Types.CONFLICT, "Статья изменена. Обновите список перед удалением")
      await service.softDeleteContentArticles(previous.id)
      return new StepResponse({ id: previous.id, deleted: true }, { id: previous.id, previous, deleted: true } as Snapshot)
    }
    const parsed = ContentArticleInput.safeParse(input.data)
    if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues.map((issue) => issue.message).join("; "))
    const { expected_revision, ...data } = parsed.data
    if (previous && previous.revision !== expected_revision) throw new MedusaError(MedusaError.Types.CONFLICT, "Статья уже изменена. Закройте редактор и откройте статью снова")
    const [duplicate] = await service.listContentArticles({ slug: data.slug }, { take: 1, select: ["id"] })
    if (duplicate && duplicate.id !== previous?.id) throw new MedusaError(MedusaError.Types.CONFLICT, "Этот адрес уже занят другой статьёй")
    const article = previous
      ? await service.updateContentArticles({ id: previous.id, ...data, revision: previous.revision + 1 })
      : await service.createContentArticles({ ...data, revision: 1 })
    return new StepResponse({ article }, { id: article.id, previous } as Snapshot)
  }, { timeout: 20 })
}

export const saveContentArticleStep = createStep("save-content-article", async (input: ArticleOperation, { container }) => {
  const result = await mutateContentArticle(input, container)
  return new StepResponse(result.output, result.compensateInput)
}, async (snapshot: Snapshot | undefined, { container }) => {
  if (!snapshot) return
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  if (snapshot.deleted) await service.restoreContentArticles(snapshot.id)
  else if (snapshot.previous) {
    const { created_at: _created, updated_at: _updated, deleted_at: _deleted, ...previous } = snapshot.previous
    await service.updateContentArticles(previous)
  } else await service.deleteContentArticles(snapshot.id)
})
