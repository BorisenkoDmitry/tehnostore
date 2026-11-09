import { Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"
import { ContentMetadataSchema } from "../modules/content/validation"
import type { ContentMetadata } from "../modules/content/types"

const fillMetadata = (existing: ContentMetadata, source: ContentMetadata) => {
  const result = { ...existing }
  for (const [key, value] of Object.entries(source)) if (result[key] === undefined || result[key] === "") result[key] = value
  return result
}
const seedMetadataStep = createStep("seed-texno-page-metadata", async (input: Record<string, ContentMetadata>, { container }) => {
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const locking = container.resolve(Modules.LOCKING)
  const changed: string[] = []
  for (const [slug, raw] of Object.entries(input)) {
    const source = ContentMetadataSchema.parse(raw)
    const [candidate] = await service.listContentPages({ slug }, { take: 1 })
    if (!candidate) continue
    await locking.execute(`texno-content:${candidate.id}`, async () => {
      const page = await service.retrieveContentPage(candidate.id)
      // This is a one-time source migration. Later merchant edits, including
      // deliberate clearing, must not be filled again on a seed retry.
      if ((page.provenance as Record<string, unknown> | null)?.metadata_origin === "accepted-local-storefront-page-metadata") return
      const metadata = fillMetadata(page.metadata, source)
      const publishedMetadata = page.published_snapshot ? fillMetadata(page.published_snapshot.metadata, source) : null
      const draftChanged = JSON.stringify(metadata) !== JSON.stringify(page.metadata)
      const publishedChanged = page.published_snapshot && JSON.stringify(publishedMetadata) !== JSON.stringify(page.published_snapshot.metadata)
      if (!draftChanged && !publishedChanged) return
      await service.updateContentPages({
        id: page.id, metadata, revision: page.revision + 1,
        ...(publishedChanged ? { published_snapshot: { ...page.published_snapshot!, metadata: publishedMetadata!, revision: page.published_snapshot!.revision + 1 } } : {}),
        provenance: { ...(page.provenance as Record<string, unknown> ?? {}), metadata_origin: "accepted-local-storefront-page-metadata", metadata_migrated_at: new Date().toISOString() },
      })
      changed.push(slug)
    }, { timeout: 20 })
  }
  return new StepResponse({ metadata_pages_updated: changed })
})
export const seedContentMetadataWorkflow = createWorkflow("seed-texno-page-metadata", function (input: Record<string, ContentMetadata>) {
  return new WorkflowResponse(seedMetadataStep(input))
})
