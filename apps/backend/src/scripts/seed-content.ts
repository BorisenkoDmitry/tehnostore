import type { ExecArgs } from "@medusajs/framework/types"
import { seedContentWorkflow } from "../workflows/seed-content"
import { seedContentMetadataWorkflow } from "../workflows/seed-content-metadata"
import { readSeedData } from "../lib/seed-data"
import type { ContentMetadata, ContentValue } from "../modules/content/types"

export default async function seedContent({ container }: ExecArgs) {
  const content = readSeedData<{ pages: unknown[]; settings: Record<string, ContentValue> }>("content-seed.json")
  const reviews = readSeedData<{ source: string; capturedAt: string; reviews: { name: string; date: string; rating: number; text: string }[] }>("content-source-reviews.json")
  const metadata = readSeedData<Record<string, ContentMetadata>>("content-page-metadata.json")
  const brand = readSeedData<Record<string, ContentValue>>("content-brand-seed.json")
  const { result } = await seedContentWorkflow(container).run({ input: { ...content, settings: { ...content.settings, brand }, reviews } })
  container.resolve("logger").info(JSON.stringify(result))
  const { result: metadataResult } = await seedContentMetadataWorkflow(container).run({ input: metadata })
  container.resolve("logger").info(JSON.stringify(metadataResult))
}
