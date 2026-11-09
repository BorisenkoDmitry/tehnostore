import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkoutRegion } from "../../../lib/texno-cart"
import { saveCheckoutSettingsWorkflow } from "../../../workflows/checkout-settings"
import type { CheckoutSettingsInput } from "./validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const region = await checkoutRegion(req.scope)
  const configuration: any = region.metadata?.texno_cart_configuration ?? { delivery_methods: [], services: [], time_zone: "UTC", delivery_slots: ["10:00–14:00"] }
  res.json({ currency_code: region.currency_code, countries: region.countries, configuration: {
    ...configuration, expected_revision: Number(region.metadata?.texno_configuration_revision ?? 0),
    delivery_methods: configuration.delivery_methods.map((item, order) => ({ ...item, enabled: item.enabled !== false, order: item.order ?? order })),
    services: configuration.services.map((item, order) => ({ ...item, enabled: item.enabled !== false, order: item.order ?? order })),
  } })
}
export async function POST(req: AuthenticatedMedusaRequest<CheckoutSettingsInput>, res: MedusaResponse) {
  const { result } = await saveCheckoutSettingsWorkflow(req.scope).run({ input: { ...req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
