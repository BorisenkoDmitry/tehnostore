import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { batchVariantImagesWorkflow } from "@medusajs/medusa/core-flows"
import { safeImageUrls } from "../lib/insales"

export type InsalesVariantImagesInput = {
  product_id: string
  variants: { source_variant_id: string; image_urls: string[] }[]
}
type AddedImages = { variant_id: string; image_ids: string[] }

async function removeAdded(container: MedusaContainer, additions: AddedImages[]) {
  for (const addition of [...additions].reverse()) {
    await batchVariantImagesWorkflow(container).run({ input: { variant_id: addition.variant_id, remove: addition.image_ids } })
  }
}

const associateInsalesVariantImagesStep = createStep(
  "associate-insales-variant-images",
  async (input: InsalesVariantImagesInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product", fields: ["id", "metadata", "variants.id", "variants.metadata"], filters: { id: input.product_id } })
    const product = data[0]
    if (!product || product.metadata?.catalog_scope !== "texno" || !product.metadata?.insales_product_id) throw new Error("Variant image associations require an owned InSales product")
    if (new Set(input.variants.map((variant) => variant.source_variant_id)).size !== input.variants.length) throw new Error("Duplicate source variant image mapping")
    // Variant.images includes computed general gallery images. The reverse
    // product_image.variants relation contains only explicit junctions.
    const { data: images } = await query.graph({ entity: "product_image", fields: ["id", "url", "variants.id"], filters: { product_id: input.product_id }, pagination: { take: 10000 } })
    const byUrl = new Map(images.map((image) => [image.url, image]))
    const pending: AddedImages[] = []
    let requestedAssociations = 0
    for (const source of input.variants) {
      const variants = product.variants?.filter((variant) => variant.metadata?.insales_variant_id === source.source_variant_id) || []
      if (variants.length !== 1) throw new Error(`Unresolved source variant image mapping: ${source.source_variant_id}`)
      const variant = variants[0]
      const missing: string[] = []
      for (const url of [...new Set(source.image_urls)]) {
        if (safeImageUrls(url)[0] !== url) throw new Error("Unapproved variant image URL")
        const image = byUrl.get(url)
        if (!image) throw new Error(`Source variant image absent from its product gallery: ${source.source_variant_id}`)
        requestedAssociations++
        if (!image.variants?.some((item) => item?.id === variant.id)) missing.push(image.id)
      }
      if (missing.length) pending.push({ variant_id: variant.id, image_ids: missing })
    }
    const added: AddedImages[] = []
    try {
      for (const addition of pending) {
        await batchVariantImagesWorkflow(container).run({ input: { variant_id: addition.variant_id, add: addition.image_ids } })
        added.push(addition)
      }
    } catch (error) {
      // Before StepResponse exists, the step must undo its own partial writes.
      await removeAdded(container, added)
      throw error
    }
    return new StepResponse({ requested: requestedAssociations, added: added.reduce((sum, addition) => sum + addition.image_ids.length, 0), updated_variants: added.length }, added)
  },
  async (additions, { container }) => {
    if (additions?.length) await removeAdded(container, additions)
  }
)

export const insalesVariantImagesWorkflow = createWorkflow("insales-variant-images", function (input: InsalesVariantImagesInput) {
  const result = associateInsalesVariantImagesStep(input)
  return new WorkflowResponse(result)
})
