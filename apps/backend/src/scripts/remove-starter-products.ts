/** Explicitly authorized cleanup of the four original starter products only. */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const confirmedStarterIds = [
  "prod_01M6RFY6ERF65FGFB00EC6SP04",
  "prod_01M6RFY6ERM6289R2KMP78HNQ1",
  "prod_01M6RFY6ERRSVBMRRE4B65XGVD",
  "prod_01M6RFY6ERT8B07S543TWA2TPR",
]
const verifiedBackupHash = "5f705124c29cd89a5d77c92a9a69db3c4f00bde46c6df33cb9c446e3030ddad4"
type BaselineProduct = {
  id: string; handle: string; title: string; description: string; status: string
  thumbnail: string | null; metadata: Record<string, unknown> | null; updated_at: string
}

export default async function removeStarterProducts({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL!)
  if (!["postgres", "localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/texno_medusa") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Starter cleanup is restricted to the local texno_medusa database")
  }
  const reportPath = process.env.INSALES_STARTER_CLEANUP_REPORT || "/tmp/insales-starter-cleanup.json"
  const baseline = JSON.parse(readFileSync(process.env.INSALES_AUDIT || "/tmp/independent-audit.json", "utf8")) as { database_before_products: BaselineProduct[] }
  const candidates = baseline.database_before_products.filter((product) => confirmedStarterIds.includes(product.id))
  if (candidates.length !== 4 || candidates.some((product) => product.metadata?.catalog_source_id || product.metadata?.insales_product_id)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Exact four starter products without source IDs are required")
  }
  const seed = readFileSync(path.join(__dirname, "../migration-scripts/initial-data-seed.ts"), "utf8")
  if (candidates.some((product) => !seed.includes(`title: "${product.title}"`) || !seed.includes(`handle: "${product.handle}"`) || !seed.includes(product.description) || !seed.includes(product.thumbnail || "invalid"))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Starter provenance differs from the original initial-data-seed.ts")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const { data: current } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "description", "status", "thumbnail", "metadata", "updated_at", "variants.id", "variants.inventory_items.inventory_item_id"],
    filters: { id: confirmedStarterIds },
  })
  for (const product of current) {
    const before = candidates.find((item) => item.id === product.id)!
    for (const key of ["handle", "title", "description", "status", "thumbnail", "metadata"] as const) {
      if (JSON.stringify(before[key]) !== JSON.stringify(product[key])) throw new MedusaError(MedusaError.Types.CONFLICT, `Starter ${product.id} changed: ${key}`)
    }
    if (new Date(before.updated_at).getTime() !== new Date(product.updated_at).getTime()) throw new MedusaError(MedusaError.Types.CONFLICT, `Starter ${product.id} was edited after the baseline`)
  }
  const orders = await container.resolve(Modules.ORDER).listOrderLineItems({ product_id: confirmedStarterIds }, { take: 10000 })
  const carts = await container.resolve(Modules.CART).listLineItems({ product_id: confirmedStarterIds }, { take: 10000 })
  const inventoryIds = [...new Set(current.flatMap((product) => product.variants?.flatMap((variant) => variant.inventory_items?.flatMap((item) => item ? [item.inventory_item_id] : []) || []) || []))]
  const reservations = inventoryIds.length ? await inventoryModule.listReservationItems({ inventory_item_id: inventoryIds }, { take: 10000 }) : []
  const report = {
    checked_at: new Date().toISOString(), policy: "Explicit user authorization: remove only the four original starter products outside the InSales assortment; retain all four source-mapped demo product IDs",
    candidates: candidates.map(({ id, handle, title }) => ({ id, handle, title })),
    active_candidates: current.map((product) => product.id),
    dependencies: { orders: orders.map((order) => order.id), carts: carts.map((cart) => cart.id), reservations: reservations.map((reservation) => reservation.id) },
    source_seed: "src/migration-scripts/initial-data-seed.ts",
    source_seed_sha256: createHash("sha256").update(seed).digest("hex"),
    backup_sha256: verifiedBackupHash,
    applied: false, soft_deleted_ids: [] as string[],
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  if (orders.length || carts.length || reservations.length) throw new MedusaError(MedusaError.Types.CONFLICT, `Starter products have order/cart/reservation dependencies; see ${reportPath}`)
  if (process.env.INSALES_STARTER_APPLY !== "1") {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Starter cleanup dry run: ${current.length} unchanged starter products, no dependencies; ${reportPath}`)
    return
  }
  const backupHash = createHash("sha256").update(readFileSync(process.env.INSALES_BACKUP || "/tmp/texno-before-insales.dump")).digest("hex")
  if (backupHash !== verifiedBackupHash) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Validated pre-import backup is missing or changed")
  if (current.length) await deleteProductsWorkflow(container).run({ input: { ids: current.map((product) => product.id) } })
  const deleted = await productModule.listProducts({ id: confirmedStarterIds }, { withDeleted: true, select: ["id", "deleted_at"] })
  if (deleted.length !== 4 || deleted.some((product) => !product.deleted_at)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Starter soft-deletion verification failed")
  report.applied = true
  report.soft_deleted_ids = deleted.map((product) => product.id)
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  await container.resolve(Modules.SEARCH).ingest({ name: "product.deleted", data: confirmedStarterIds.map((id) => ({ id })) } as never)
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`Starter cleanup complete: ${report.soft_deleted_ids.length} original products soft-deleted; ${reportPath}`)
}
