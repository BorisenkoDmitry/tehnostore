import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createShippingOptionsWorkflow, deleteShippingOptionsWorkflow, updateRegionsWorkflow, updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { CheckoutServicesSchema, CheckoutSettingsSchema, type CheckoutServicesInput, type CheckoutSettingsInput } from "../api/admin/checkout-settings/validators"
import { checkoutRegion } from "../lib/texno-cart"

type Input = CheckoutSettingsInput & { actor_id: string }
const checkoutSettingsLock = "texno-checkout-settings"

function settingsRevision(metadata: Record<string, unknown>, expected: number) {
  const revision = Number(metadata.texno_configuration_revision ?? 0)
  if (revision !== expected) throw new MedusaError(MedusaError.Types.CONFLICT, "Настройки уже изменены. Обновите страницу")
  return revision
}

async function saveConfiguration(container: MedusaContainer, regionId: string, previous: Record<string, unknown>, configuration: Record<string, unknown>, revision: number, actorId: string) {
  const history = Array.isArray(previous.texno_configuration_history) ? previous.texno_configuration_history : []
  await updateRegionsWorkflow(container).run({ input: { selector: { id: regionId }, update: { metadata: {
    ...previous,
    texno_cart_configuration: configuration,
    texno_configuration_revision: revision + 1,
    texno_configuration_history: [...history.slice(-49), {
      revision, actor_id: actorId, changed_at: new Date().toISOString(), configuration: previous.texno_cart_configuration,
    }],
  } } } })
}

const saveStep = createStep("save-texno-checkout-settings", async (input: Input, { container }) => {
  const { actor_id, ...body } = input
  const valid = CheckoutSettingsSchema.parse(body)
  const locking = container.resolve(Modules.LOCKING)
  const result = await locking.execute(checkoutSettingsLock, async () => {
    const region = await checkoutRegion(container)
    const previousMetadata = region.metadata ?? {}
    const revision = settingsRevision(previousMetadata, valid.expected_revision)
    if (valid.country_code && !region.countries?.some((country) => country?.iso_2 === valid.country_code)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Страна доставки должна входить в регион магазина")
    const configuration = { ...(valid.country_code ? { country_code: valid.country_code } : {}), ...(valid.default_city !== undefined ? { default_city: valid.default_city } : {}), time_zone: valid.time_zone ?? "UTC", delivery_slots: valid.delivery_slots ?? ["10:00–14:00"], delivery_methods: valid.delivery_methods, services: valid.services }
    const { data: options }: { data: any[] } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "shipping_option", fields: ["id", "name", "metadata", "service_zone_id", "shipping_profile_id", "provider_id", "prices.id", "prices.amount", "prices.currency_code", "prices.region_id"] })
    const originals: any[] = []
    const created: string[] = []
    const rollback = async () => {
      if (originals.length) await updateShippingOptionsWorkflow(container).run({ input: originals })
      if (created.length) await deleteShippingOptionsWorkflow(container).run({ input: { ids: created } })
    }
    try {
      for (const method of configuration.delivery_methods) {
        const option = options.find((item) => method.shipping_option_id ? item.id === method.shipping_option_id : item.metadata?.texno_delivery_id === method.id)
        if (method.shipping_option_id && !option) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Связанный тариф доставки недоступен")
        const prices = [{ currency_code: region.currency_code, amount: method.price ?? 0 }]
        const metadata = { ...(option?.metadata ?? {}), texno_delivery_id: method.id, texno_pricing: method.pricing, texno_enabled: method.enabled }
        if (option) {
          originals.push({ id: option.id, name: option.name, metadata: option.metadata, prices: option.prices.map((price) => ({ id: price.id, currency_code: price.currency_code, amount: Number(price.amount), ...(price.region_id ? { region_id: price.region_id } : {}) })) })
          const otherPrices = option.prices.filter((price) => price.currency_code !== region.currency_code).map((price) => ({ id: price.id, currency_code: price.currency_code, amount: Number(price.amount) }))
          const rub = option.prices.find((price) => price.currency_code === region.currency_code)
          const update = { id: option.id, name: method.label, metadata, prices: [...otherPrices, { ...prices[0], ...(rub ? { id: rub.id } : {}) }] }
          await updateShippingOptionsWorkflow(container).run({ input: [update] })
        } else {
          const template = options.find((item) => item.metadata?.texno_delivery_id)
          if (!template) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Базовая доставка не настроена")
          const create = { name: method.label, price_type: "flat" as const, service_zone_id: template.service_zone_id, shipping_profile_id: template.shipping_profile_id, provider_id: template.provider_id, prices, metadata, type: { label: method.label, description: "Тариф TEXNO STORE", code: `texno_${method.id}` }, rules: [{ attribute: "enabled_in_store", operator: "eq" as const, value: "true" }, { attribute: "is_return", operator: "eq" as const, value: "false" }] }
          const { result } = await createShippingOptionsWorkflow(container).run({ input: [create] })
          created.push(result[0].id)
        }
      }
      await saveConfiguration(container, region.id, previousMetadata, configuration, revision, actor_id)
    } catch (error) { await rollback(); throw error }
    return new StepResponse({ configuration: { ...configuration, expected_revision: revision + 1 } })
  }, { timeout: 30, expire: 120 })
  return new StepResponse(result.output)
})
export const saveCheckoutSettingsWorkflow = createWorkflow("save-texno-checkout-settings", function (input: Input) { return new WorkflowResponse(saveStep(input)) })

type ServicesInput = CheckoutServicesInput & { actor_id: string }

const saveServicesStep = createStep("save-texno-checkout-services", async (input: ServicesInput, { container }) => {
  const { actor_id, ...body } = input
  const valid = CheckoutServicesSchema.parse(body)
  const result = await container.resolve(Modules.LOCKING).execute(checkoutSettingsLock, async () => {
    const region = await checkoutRegion(container)
    const metadata = region.metadata ?? {}
    const revision = settingsRevision(metadata, valid.expected_revision)
    const previous = metadata.texno_cart_configuration
    if (!previous || typeof previous !== "object" || !("delivery_methods" in previous) || !Array.isArray(previous.delivery_methods)) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Сначала настройте доставку для оформления заказа")
    }
    await saveConfiguration(container, region.id, metadata, { ...previous, services: valid.services }, revision, actor_id)
    return { services: valid.services, expected_revision: revision + 1 }
  }, { timeout: 30, expire: 120 })
  return new StepResponse(result)
})

export const saveCheckoutServicesWorkflow = createWorkflow("save-texno-checkout-services", function (input: ServicesInput) {
  return new WorkflowResponse(saveServicesStep(input))
})
