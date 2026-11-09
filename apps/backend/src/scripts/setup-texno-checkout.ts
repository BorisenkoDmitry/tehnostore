import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createRegionsWorkflow, updateStoresWorkflow, createTaxRegionsWorkflow, createShippingOptionsWorkflow, createRemoteLinkStep, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"
import { DEFAULT_CART_CONFIGURATION } from "../lib/texno-cart-rules"

const linkWorkflow = createWorkflow("link-texno-checkout", function (input: any) { return new WorkflowResponse(createRemoteLinkStep(input)) })
const setupStep = createStep("setup-texno-local-checkout", async (_: Record<string, never>, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code", "metadata"] })
  let region: any = regions.find((r) => r.metadata?.texno_checkout === true)
  if (!region) region = (await createRegionsWorkflow(container).run({ input: { regions: [{ name: "Россия — TEXNO STORE", currency_code: "rub", countries: ["ru"], automatic_taxes: false, payment_providers: ["pp_system_default"], metadata: { texno_checkout: true, texno_cart_configuration: DEFAULT_CART_CONFIGURATION } }] } })).result[0]
  const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id", "supported_currencies.currency_code", "supported_currencies.is_default"] })
  const store = stores[0]
  if (!store.supported_currencies.some((c) => c?.currency_code === "rub")) await updateStoresWorkflow(container).run({ input: { selector: { id: store.id }, update: { supported_currencies: [...store.supported_currencies.filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ currency_code: c.currency_code, is_default: c.is_default })), { currency_code: "rub", is_default: false }] } } })
  const { data: taxRegions } = await query.graph({ entity: "tax_region", fields: ["id", "country_code"] })
  if (!taxRegions.some((r) => r.country_code === "ru")) await createTaxRegionsWorkflow(container).run({ input: [{ country_code: "ru", provider_id: "tp_system" }] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name", "sales_channels.id", "fulfillment_sets.id"] })
  const location: any = locations.find((l) => l.name === "TEXNO InSales source stock")
  if (!location) throw new Error("Source stock location missing")
  if (!location.sales_channels.some((c) => c.id === store.default_sales_channel_id)) await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [store.default_sales_channel_id!] } })
  const { data: sets } = await query.graph({ entity: "fulfillment_set", fields: ["id", "name", "service_zones.id"] })
  let set: any = sets.find((s) => s.name === "TEXNO Russia delivery")
  if (!set) {
    set = await container.resolve(Modules.FULFILLMENT).createFulfillmentSets({ name: "TEXNO Russia delivery", type: "shipping", service_zones: [{ name: "Россия", geo_zones: [{ type: "country", country_code: "ru" }] }] })
  }
  if (!location.fulfillment_sets.some((s) => s.id === set!.id)) await linkWorkflow(container).run({ input: [{ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_set_id: set.id } }, { [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" } }] })
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
  const profile = profiles.find((p) => p.type === "default")!
  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id", "name", "metadata"] })
  for (const method of DEFAULT_CART_CONFIGURATION.delivery_methods) {
    if (options.some((o) => o.metadata?.texno_delivery_id === method.id)) continue
    const option = { name: method.label, price_type: "flat" as const, provider_id: "manual_manual", service_zone_id: set!.service_zones[0].id, shipping_profile_id: profile.id, type: { label: method.label, description: method.pricing === "fixed" ? "Стоимость по тарифу" : "Предварительная заявка: стоимость подтверждает менеджер", code: `texno_${method.id}` }, prices: [{ currency_code: "rub", amount: method.price ?? 0 }], metadata: { texno_delivery_id: method.id, texno_pricing: method.pricing }, rules: [{ attribute: "enabled_in_store", operator: "eq" as const, value: "true" }, { attribute: "is_return", operator: "eq" as const, value: "false" }] }
    await createShippingOptionsWorkflow(container).run({ input: [option] })
  }
  return new StepResponse({ region_id: region.id, stock_location_id: location.id, channel_id: store.default_sales_channel_id })
})
const setupWorkflow = createWorkflow("setup-texno-checkout", function () { return new WorkflowResponse(setupStep({})) })
export default async function setup({ container }: ExecArgs) {
  const db = new URL(process.env.DATABASE_URL!)
  if (db.hostname !== "postgres" || db.pathname !== "/texno_medusa") throw new Error("Local database only")
  console.log(JSON.stringify((await setupWorkflow(container).run({ input: {} })).result))
}
