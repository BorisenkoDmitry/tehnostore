import { createHash, randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"
import { ContentLeadInput, ContentLeadUpdate, ContentPageInput, ContentReviewInput, ContentSettingsInput, validatePublishedPageLayout } from "../modules/content/validation"
import type { ContentValue, PageSnapshot } from "../modules/content/types"

type Input = { operation: "page-save" | "page-publish" | "page-unpublish" | "page-delete" | "settings-save" | "settings-publish" | "review-save" | "review-delete" | "lead-create" | "lead-update" | "lead-delete"; id?: string; data?: unknown; actor_id?: string }
type Snapshot = { entity: "page" | "settings" | "review" | "lead"; id?: string; previous: ({ id: string } & Record<string, unknown>) | null; deleted?: boolean }
const fail = (message: string) => { throw new MedusaError(MedusaError.Types.INVALID_DATA, message) }
const assertRevision = (current: number, expected?: number) => {
  if (expected !== undefined && current !== expected) throw new MedusaError(MedusaError.Types.CONFLICT, "Данные уже изменены. Перезагрузите редактор перед сохранением")
}

async function validateReferences(container: MedusaContainer, value: ContentValue) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const refs: { kind: string; value: string }[] = []
  const collect = (node: ContentValue) => {
    if (Array.isArray(node)) { node.forEach(collect); return }
    if (!node || typeof node !== "object") return
    for (const [key, item] of Object.entries(node)) {
      if (typeof item === "string" && item && (key === "page_slug" || key.endsWith("_slug"))) refs.push({ kind: "page", value: item })
      if (typeof item === "string" && item && key === "category_id") refs.push({ kind: "product_category", value: item })
      if (typeof item === "string" && item && key === "product_id") refs.push({ kind: "product", value: item })
      if (Array.isArray(item) && key === "product_ids") item.forEach((id) => { if (typeof id === "string") refs.push({ kind: "product", value: id }) })
      collect(item)
    }
  }
  collect(value)
  for (const ref of refs) {
    if (ref.kind === "page") {
      const [page] = await service.listContentPages({ slug: ref.value, status: "published" }, { take: 1 })
      if (!page?.published_snapshot) fail(`Страница «${ref.value}» не опубликована`)
    } else {
      const { data } = await query.graph({ entity: ref.kind, fields: ["id"], filters: { id: ref.value } })
      if (!data.length) fail(`Ссылка на отсутствующий объект: ${ref.value}`)
    }
  }
}

export const saveContentStep = createStep("save-texno-content", async (input: Input, { container }): Promise<StepResponse<Record<string, unknown>, Snapshot | null>> => {
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const locking = container.resolve(Modules.LOCKING)
  const leadLock = input.operation === "lead-create" ? `lead:${createHash("sha256").update(String((input.data as { email?: string })?.email ?? "").toLowerCase()).digest("hex")}` : undefined
  const result = await locking.execute(`texno-content:${leadLock ?? (input.operation.startsWith("settings") ? "settings" : input.id ?? "create")}`, async () => {
    if (input.operation.startsWith("page-")) {
      const previous = input.id ? await service.retrieveContentPage(input.id) : null
      if (input.operation === "page-delete") {
        if (previous) await service.softDeleteContentPages(previous.id)
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ id: input.id, deleted: true }, { entity: "page", previous, deleted: true })
      }
      if (input.operation === "page-save") {
        const { expected_revision, ...data } = ContentPageInput.parse(input.data)
        if (previous) {
          assertRevision(previous.revision, expected_revision)
          const provenance = (previous.provenance ?? {}) as Record<string, unknown>
          if ((previous.published_snapshot || provenance.first_published_slug) && previous.slug !== data.slug) fail("После публикации адрес страницы постоянный. Создайте новую страницу для нового адреса")
        }
        const page = previous
          ? await service.updateContentPages({ id: previous.id, ...data, revision: previous.revision + 1 })
          : await service.createContentPages({ ...data, status: "draft", revision: 1 })
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ page }, { entity: "page", id: page.id, previous })
      }
      if (!previous) fail("Страница не найдена")
      if (input.operation === "page-publish") {
        const data = ContentPageInput.parse(previous)
        try { validatePublishedPageLayout(data) } catch (error) { fail((error as Error).message) }
        await validateReferences(container, data.blocks as unknown as ContentValue)
        const snapshot: PageSnapshot = { slug: data.slug, title: data.title, body: data.body, blocks: data.blocks, metadata: data.metadata, revision: previous!.revision }
        const page = await service.updateContentPages({ id: previous!.id, status: "published", published_snapshot: snapshot, published_at: new Date(), provenance: { ...(previous!.provenance as Record<string, unknown> ?? {}), first_published_slug: previous!.slug } })
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ page }, { entity: "page", id: page.id, previous })
      }
      const page = await service.updateContentPages({ id: previous!.id, status: "draft", published_snapshot: null, published_at: null, provenance: { ...(previous!.provenance as Record<string, unknown> ?? {}), ...(previous!.published_snapshot ? { first_published_slug: previous!.slug } : {}) } })
      return new StepResponse<Record<string, unknown>, Snapshot | null>({ page }, { entity: "page", id: page.id, previous })
    }
    if (input.operation.startsWith("settings-")) {
      const [previous] = await service.listContentSettings({ key: "site" })
      if (input.operation === "settings-publish") {
        if (!previous) fail("Сначала сохраните настройки")
        const { data } = ContentSettingsInput.parse(previous)
        await validateReferences(container, data)
        const settings = await service.updateContentSettings({ id: previous!.id, published_data: data, published_at: new Date() })
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ settings }, { entity: "settings", id: settings.id, previous })
      }
      const { data, expected_revision } = ContentSettingsInput.parse(input.data)
      if (previous) assertRevision(previous.revision, expected_revision)
      const settings = previous
        ? await service.updateContentSettings({ id: previous.id, data, revision: previous.revision + 1 })
        : await service.createContentSettings({ key: "site", data, revision: 1 })
      return new StepResponse<Record<string, unknown>, Snapshot | null>({ settings }, { entity: "settings", id: settings.id, previous: previous ?? null })
    }
    if (input.operation.startsWith("review-")) {
      const previous = input.id ? await service.retrieveContentReview(input.id) : null
      if (input.operation === "review-delete") {
        if (previous) await service.softDeleteContentReviews(previous.id)
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ id: input.id, deleted: true }, { entity: "review", previous, deleted: true })
      }
      const data = ContentReviewInput.parse(input.data)
      if (data.product_id) await validateReferences(container, { product_id: data.product_id })
      const review = previous
        ? await service.updateContentReviews({ id: previous.id, ...data })
        : await service.createContentReviews({ source_key: `manual:${randomUUID()}`, ...data, provenance: { origin: "admin", actor_id: input.actor_id ?? null } })
      if ((previous?.product_id ?? null) !== data.product_id) {
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const entry = (product_id: string) => ({ [Modules.PRODUCT]: { product_id }, [CONTENT_MODULE]: { content_review_id: review.id } })
        try {
          if (previous?.product_id) await link.dismiss(entry(previous.product_id))
          if (data.product_id) await link.create(entry(data.product_id))
        } catch (error) {
          if (previous) {
            const { created_at: _created, updated_at: _updated, deleted_at: _deleted, ...snapshot } = previous
            await service.updateContentReviews(snapshot)
            if (previous.product_id) await link.create(entry(previous.product_id))
          } else await service.deleteContentReviews(review.id)
          throw error
        }
      }
      return new StepResponse<Record<string, unknown>, Snapshot | null>({ review }, { entity: "review", id: review.id, previous })
    }
    if (input.operation === "lead-create") {
      const { website: _honeypot, ...data } = ContentLeadInput.parse(input.data)
      const [previous] = await service.listContentLeads({ request_key: data.request_key })
      if (previous) {
        if (previous.email !== data.email || previous.name !== data.name || previous.message !== data.message || (previous.phone ?? "") !== (data.phone ?? "")) throw new MedusaError(MedusaError.Types.CONFLICT, "Идентификатор обращения уже использован")
        return new StepResponse<Record<string, unknown>, Snapshot | null>({ received: true }, null)
      }
      const [, count] = await service.listAndCountContentLeads({ email: data.email, created_at: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }, { take: 1 })
      if (count >= 5) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "За последний час уже отправлено несколько обращений. Попробуйте позже")
      const lead = await service.createContentLeads({ ...data, phone: data.phone || null })
      return new StepResponse<Record<string, unknown>, Snapshot | null>({ received: true }, { entity: "lead", id: lead.id, previous: null })
    }
    const previous = await service.retrieveContentLead(input.id!)
    if (input.operation === "lead-delete") {
      await service.softDeleteContentLeads(previous.id)
      return new StepResponse<Record<string, unknown>, Snapshot | null>({ id: previous.id, deleted: true }, { entity: "lead", previous, deleted: true })
    }
    const lead = await service.updateContentLeads({ id: previous.id, ...ContentLeadUpdate.parse(input.data) })
    return new StepResponse<Record<string, unknown>, Snapshot | null>({ lead }, { entity: "lead", id: lead.id, previous })
  }, { timeout: 20 })
  return new StepResponse(result.output, result.compensateInput)
}, async (snapshot, { container }) => {
  if (!snapshot) return
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const names = { page: "ContentPages", settings: "ContentSettings", review: "ContentReviews", lead: "ContentLeads" } as const
  const name = names[snapshot.entity]
  const actions = service as unknown as Record<string, (data: unknown) => Promise<unknown>>
  if (snapshot.deleted && snapshot.previous) await actions[`restore${name}`](snapshot.previous.id)
  else if (snapshot.previous) {
    const { created_at: _created, updated_at: _updated, deleted_at: _deleted, ...data } = snapshot.previous
    await actions[`update${name}`](data)
  } else if (snapshot.id) await actions[`delete${name}`](snapshot.id)
})

export const contentWorkflow = createWorkflow("texno-content", function (input: Input) {
  const result = saveContentStep(input)
  return new WorkflowResponse(result)
})
