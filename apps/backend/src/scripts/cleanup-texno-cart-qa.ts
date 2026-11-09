import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { cancelOrderWorkflow, deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"

type CleanupResult = { cleaned: boolean; canceled_orders: string[]; fixture_product_id?: string }
const cleanupTexnoCartQaStep = createStep("cleanup-texno-cart-qa", async (_: Record<string, never>, { container }): Promise<StepResponse<CleanupResult>> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { handle: "texno-cart-qa-fixture-20261107" } })
  const product = products[0]
  if (!product) return new StepResponse({ cleaned: true, canceled_orders: [] })
  if (product.metadata?.texno_cart_qa !== true) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Fixture marker missing")
  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "status", "items.product_id", "payment_collections.payments.captures.id"], pagination: { take: 1000 } })
  const canceled: string[] = []
  for (const order of orders.filter((o) => o.items?.some((i) => i?.product_id === product.id))) {
    if (order.items?.some((i) => i?.product_id && i.product_id !== product.id)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Mixed real/fixture order must be reviewed manually")
    if (order.payment_collections?.some((c) => c?.payments?.some((p) => p?.captures?.length))) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Captured payment must be reviewed manually")
    if (order.status !== "canceled") await cancelOrderWorkflow(container).run({ input: { order_id: order.id } })
    canceled.push(order.id)
  }
  await deleteProductsWorkflow(container).run({ input: { ids: [product.id] } })
  const service = container.resolve(CATALOG_ATTRIBUTES_MODULE)
  const records = await service.listCatalogRecords({ source_product_id: "texno-cart-qa-20261107" })
  for (const record of records) {
    const attributes = await service.listCatalogAttributes({ record_id: record.id }, { take: 1000 })
    const variants = await service.listCatalogVariants({ record_id: record.id }, { take: 1000 })
    if (attributes.length) await service.deleteCatalogAttributes(attributes.map((a) => a.id))
    if (variants.length) await service.deleteCatalogVariants(variants.map((v) => v.id))
    await service.deleteCatalogRecords(record.id)
  }
  return new StepResponse({ cleaned: true, fixture_product_id: product.id, canceled_orders: canceled })
})
const cleanupTexnoCartQaWorkflow = createWorkflow("cleanup-texno-cart-qa", function () { return new WorkflowResponse(cleanupTexnoCartQaStep({})) })
export default async function cleanup({ container }: ExecArgs) {
  const db = new URL(process.env.DATABASE_URL!)
  if (db.hostname !== "postgres" || db.pathname !== "/texno_medusa") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Local fixture cleanup only")
  console.log(JSON.stringify((await cleanupTexnoCartQaWorkflow(container).run({ input: {} })).result))
}
