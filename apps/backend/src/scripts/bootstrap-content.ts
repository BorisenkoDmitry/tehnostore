import { readFile, stat } from "node:fs/promises"
import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"
import { ContentBrandSchema, ContentPageInput, ContentSettingsInput, validatePublishedPageLayout } from "../modules/content/validation"
import { contentWorkflow } from "../workflows/content"

/** Generic explicit bootstrap: imports no TEXNO data, reviews or company details. */
export default async function bootstrapContent({ container }: ExecArgs) {
  const filename = process.env.CMS_BOOTSTRAP_FILE
  if (!filename) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Set CMS_BOOTSTRAP_FILE to your own CMS JSON payload")
  if ((await stat(filename)).size > 10 * 1024 * 1024) throw new MedusaError(MedusaError.Types.INVALID_DATA, "CMS payload exceeds 10 MB")
  const payload = JSON.parse(await readFile(filename, "utf8")) as { settings: unknown; pages: unknown[]; backup_reference?: string; unpublish_others?: boolean }
  const settings = ContentSettingsInput.parse({ data: payload.settings }).data
  ContentBrandSchema.parse(settings.brand)
  if (!Array.isArray(payload.pages) || payload.pages.length > 1000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supply pages as an array with at most 1000 entries")
  const pages = payload.pages.map((page) => ContentPageInput.parse(page))
  pages.forEach(validatePublishedPageLayout)
  if (new Set(pages.map((page) => page.slug)).size !== pages.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Page slugs must be unique")
  const service = container.resolve<ContentModuleService>(CONTENT_MODULE)
  const existingPages = await service.listContentPages({}, { take: 10000 })
  const [existingSettings] = await service.listContentSettings({ key: "site" })
  const preview = { pages: pages.map((page) => page.slug), settings_sections: Object.keys(settings), unpublish_others: payload.unpublish_others === true, preview_only: process.env.CMS_BOOTSTRAP_PREVIEW === "1" }
  if (!preview.preview_only && (existingPages.length || existingSettings) && !payload.backup_reference?.trim()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Before replacing an existing CMS, take a fresh backup, verify isolated restore and supply backup_reference")
  container.resolve("logger").info(JSON.stringify(preview))
  if (preview.preview_only) return
  const saved: string[] = []
  for (const page of pages) {
    const existing = existingPages.find((candidate) => candidate.slug === page.slug)
    const { result } = await contentWorkflow(container).run({ input: { operation: "page-save", id: existing?.id, data: { ...page, expected_revision: existing?.revision } } })
    saved.push((result.page as { id: string }).id)
  }
  for (const id of saved) await contentWorkflow(container).run({ input: { operation: "page-publish", id } })
  await contentWorkflow(container).run({ input: { operation: "settings-save", data: { data: settings, expected_revision: existingSettings?.revision } } })
  await contentWorkflow(container).run({ input: { operation: "settings-publish" } })
  if (payload.unpublish_others === true) for (const previous of existingPages) {
    if (!pages.some((page) => page.slug === previous.slug) && previous.status === "published") await contentWorkflow(container).run({ input: { operation: "page-unpublish", id: previous.id } })
  }
  container.resolve("logger").info(JSON.stringify({ pages_published: saved.length, settings_published: true, existing_products_prices_stock_untouched: true }))
}
