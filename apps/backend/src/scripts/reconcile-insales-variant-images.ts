import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadInsalesPlan } from "../lib/insales"
import { insalesVariantImagesWorkflow } from "../workflows/insales-variant-images"

/** Reconciles only explicit selected source variant images, never general gallery images. */
export default async function reconcileInsalesVariantImages({ container }: ExecArgs) {
  const db = new URL(process.env.DATABASE_URL!)
  if (!["postgres", "localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/texno_medusa") throw new Error("Variant image reconciliation is restricted to the local texno_medusa database")
  const backupManifest = JSON.parse(readFileSync(process.env.INSALES_BACKUP_MANIFEST || "/tmp/insales-backup-manifest.json", "utf8"))
  const backupBytes = readFileSync(process.env.INSALES_BACKUP_FILE || "/tmp/texno-before-insales.dump")
  const backupHash = createHash("sha256").update(backupBytes).digest("hex")
  if (!backupManifest.restore_verified || backupManifest.database !== "texno_medusa" || backupManifest.sha256 !== backupHash || backupManifest.bytes !== backupBytes.length) throw new Error("Verified backup archive/restore manifest mismatch")
  const plan = loadInsalesPlan({ sourcePath: process.env.INSALES_CSV || "/tmp/insales-source.csv", navigationPath: `${process.cwd()}/src/scripts/data/catalog-navigation.json`, comparisonPath: process.env.INSALES_COMPARISON })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata", "variants.id", "variants.metadata"], pagination: { take: 10000 } })
  const selected = plan.products.filter((product) => product.variants.some((variant) => variant.imageUrls.length))
  const mapping = selected.map((source) => {
    const matches = products.filter((product) => product.metadata?.insales_product_id === source.sourceProductId)
    if (matches.length !== 1 || matches[0].metadata?.catalog_scope !== "texno" || matches[0].metadata?.insales_source_sha256 !== plan.sourceSha256) throw new Error(`Unowned/ambiguous source product image mapping: ${source.sourceProductId}`)
    return { source, product: matches[0] }
  })
  const passes: { requested: number; added: number; updatedVariants: number }[] = []
  for (let pass = 0; pass < 2; pass++) {
    const counts = { requested: 0, added: 0, updatedVariants: 0 }
    for (const { source, product } of mapping) {
      const { result } = await insalesVariantImagesWorkflow(container).run({ input: { product_id: product.id, variants: source.variants.map((variant) => ({ source_variant_id: variant.sourceVariantId, image_urls: variant.imageUrls })) } })
      counts.requested += result.requested
      counts.added += result.added
      counts.updatedVariants += result.updated_variants
    }
    passes.push(counts)
    if (pass === 1 && counts.added) throw new Error("Second variant image pass unexpectedly wrote new associations")
  }
  let verified = 0
  for (const { source, product } of mapping) {
    const { data: images } = await query.graph({ entity: "product_image", fields: ["id", "url", "variants.id"], filters: { product_id: product.id }, pagination: { take: 10000 } })
    for (const sourceVariant of source.variants) {
      const variant = product.variants?.find((variant) => variant.metadata?.insales_variant_id === sourceVariant.sourceVariantId)
      if (!variant) throw new Error(`Missing verification source variant: ${sourceVariant.sourceVariantId}`)
      for (const url of sourceVariant.imageUrls) {
        if (!images.find((image) => image.url === url)?.variants?.some((item) => item?.id === variant.id)) throw new Error(`Missing explicit source image association: ${sourceVariant.sourceVariantId}`)
        verified++
      }
    }
  }
  const report = { source_sha256: plan.sourceSha256, products: mapping.length, passes, explicit_associations_verified: verified, passed: verified === passes[0].requested && passes[1].added === 0 }
  writeFileSync("/tmp/insales-variant-images-report.json", JSON.stringify(report, null, 2))
  console.log(`InSales variant image associations: ${JSON.stringify(report)}`)
}
