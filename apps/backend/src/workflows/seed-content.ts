import { createHash } from "node:crypto"
import { Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"
import { ContentPageInput, ContentSettingsInput, ContentReviewInput, validatePublishedPageLayout } from "../modules/content/validation"
import type { ContentValue, PageSnapshot } from "../modules/content/types"

type SeedInput = { pages: unknown[]; settings: Record<string, ContentValue>; reviews: { source: string; capturedAt: string; reviews: { name: string; date: string; rating: number; text: string }[] } }
function fillMissing(existing: Record<string, ContentValue>, initial: Record<string, ContentValue>): Record<string, ContentValue> {
  const result = { ...existing }
  for (const [key, value] of Object.entries(initial)) {
    if (!(key in result)) result[key] = value
    else if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) result[key] = fillMissing(result[key] as Record<string, ContentValue>, value)
  }
  return result
}

const seedContentStep = createStep("seed-texno-content", async (input: SeedInput, { container }) => {
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const locking = container.resolve(Modules.LOCKING)
  const counts = { pages_created: 0, pages_preserved: 0, reviews_created: 0, settings_updated: false }
  const provenance = { origin: "accepted-local-storefront", imported_at: new Date().toISOString(), seed_version: 1 }
  for (const raw of input.pages) {
    const data = ContentPageInput.parse(raw)
    validatePublishedPageLayout(data)
    await locking.execute("texno-content:create", async () => {
      const [existing] = await service.listContentPages({ slug: data.slug }, { take: 1 })
      if (existing) { counts.pages_preserved++; return }
      const snapshot: PageSnapshot = { slug: data.slug, title: data.title, body: data.body, blocks: data.blocks, metadata: data.metadata, revision: 1 }
      await service.createContentPages({ ...snapshot, status: "published", published_at: new Date(), published_snapshot: snapshot, provenance })
      counts.pages_created++
    }, { timeout: 20 })
  }
  await locking.execute("texno-content:settings", async () => {
    const data = ContentSettingsInput.parse({ data: input.settings }).data
    const [existing] = await service.listContentSettings({ key: "site" })
    if (!existing) {
      await service.createContentSettings({ key: "site", data, published_data: data, revision: 1, published_at: new Date(), provenance })
      counts.settings_updated = true
      return
    }
    const merged = fillMissing(existing.data as Record<string, ContentValue>, data)
    const published = fillMissing((existing.published_data ?? {}) as Record<string, ContentValue>, data)
    if (JSON.stringify(merged) !== JSON.stringify(existing.data) || JSON.stringify(published) !== JSON.stringify(existing.published_data)) {
      await service.updateContentSettings({ id: existing.id, data: merged, published_data: published, revision: existing.revision + 1, published_at: existing.published_at ?? new Date() })
      counts.settings_updated = true
    }
  }, { timeout: 20 })
  for (const [position, raw] of input.reviews.reviews.entries()) {
    const [day, month, year] = raw.date.split(".")
    const source_key = `source:${createHash("sha256").update(JSON.stringify(raw)).digest("hex")}`
    const [existing] = await service.listContentReviews({ source_key }, { take: 1 })
    if (existing) continue
    const data = ContentReviewInput.parse({ kind: "shop", author: raw.name, rating: raw.rating, body: raw.text, review_date: `${year}-${month}-${day}`, status: "published", position, media: [] })
    await service.createContentReviews({ ...data, source_key, provenance: { origin: "source-shop-review", source_url: input.reviews.source, captured_at: input.reviews.capturedAt, imported_at: new Date().toISOString(), original: raw } })
    counts.reviews_created++
  }
  return new StepResponse(counts)
})

export const seedContentWorkflow = createWorkflow("seed-texno-content", function (input: SeedInput) {
  return new WorkflowResponse(seedContentStep(input))
})
