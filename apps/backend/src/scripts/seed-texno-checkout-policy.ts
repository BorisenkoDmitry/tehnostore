import type { ExecArgs } from "@medusajs/framework/types"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { checkoutRegion } from "../lib/texno-cart"
import { DEFAULT_CART_CONFIGURATION } from "../lib/texno-cart-rules"

const seedPolicyStep = createStep("seed-texno-checkout-policy", async (_: Record<string, never>, { container }) => {
  const region = await checkoutRegion(container)
  if (region.metadata?.texno_checkout !== true) throw new Error("This seed is for the TEXNO profile only")
  const current: any = region.metadata?.texno_cart_configuration
  const next = { ...current, country_code: current.country_code ?? "ru", default_city: current.default_city ?? "Москва", time_zone: current.time_zone ?? DEFAULT_CART_CONFIGURATION.time_zone, delivery_slots: current.delivery_slots ?? DEFAULT_CART_CONFIGURATION.delivery_slots, delivery_methods: current.delivery_methods.map((method) => {
    const preset = DEFAULT_CART_CONFIGURATION.delivery_methods.find((item) => item.id === method.id)
    return method.allowed_cities === undefined && preset?.allowed_cities ? { ...method, allowed_cities: preset.allowed_cities } : method
  }) }
  if (JSON.stringify(next) === JSON.stringify(current)) return new StepResponse({ changed: false })
  await updateRegionsWorkflow(container).run({ input: { selector: { id: region.id }, update: { metadata: { ...region.metadata, texno_cart_configuration: next } } } })
  return new StepResponse({ changed: true })
})
const seedPolicyWorkflow = createWorkflow("seed-texno-checkout-policy", function () { return new WorkflowResponse(seedPolicyStep({})) })
export default async function seed({ container }: ExecArgs) { console.log(JSON.stringify((await seedPolicyWorkflow(container).run({ input: {} })).result)) }
