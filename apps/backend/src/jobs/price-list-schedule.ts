import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, PriceListWorkflowEvents } from "@medusajs/framework/utils"

let lastRun = new Date(0)

export default async function refreshScheduledPrices(container: MedusaContainer) {
  const now = new Date()
  const window = { $gt: lastRun, $lte: now }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: lists } = await query.graph({
    entity: "price_list",
    fields: ["id"],
    filters: { status: "active", $or: [{ starts_at: window }, { ends_at: window }] },
  })
  if (lists.length) {
    await container.resolve(Modules.SEARCH).ingest({
      name: PriceListWorkflowEvents.UPDATED,
      data: lists.map(({ id }) => ({ id })),
    } as never)
  }
  lastRun = now
}

export const config = { name: "texno-price-list-schedule", schedule: "* * * * *" }
