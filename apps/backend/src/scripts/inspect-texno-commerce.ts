import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function inspect({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const entities: Record<string, string[]> = {
    region: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
    store: ["id", "default_sales_channel_id", "supported_currencies.currency_code"],
    stock_location: ["id", "name", "sales_channels.id", "fulfillment_sets.id"],
    fulfillment_set: ["id", "name", "service_zones.id", "service_zones.geo_zones.*"],
    shipping_option: ["id", "name", "provider_id", "shipping_profile_id", "service_zone_id", "prices.*"],
    tax_region: ["id", "country_code", "provider_id"],
  }
  for (const [entity, fields] of Object.entries(entities)) {
    try { console.log(JSON.stringify({ entity, ...(await query.graph({ entity, fields })) })) }
    catch (error) { console.log(JSON.stringify({ entity, error: String(error) })) }
  }
}
