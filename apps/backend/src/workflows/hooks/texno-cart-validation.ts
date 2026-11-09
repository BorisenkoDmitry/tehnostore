import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow, completeCartWorkflow, createCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { assertPurchasable } from "../../lib/texno-cart"
import { getCatalogProfile } from "../../lib/catalog-cms"

// Applies to core workflows too, including callers outside the custom UI.
createCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const ids = (input.items ?? []).map((i) => i.variant_id).filter((id): id is string => !!id)
  if (ids.length) {
    const profile = await getCatalogProfile(container)
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id", "product.metadata"], filters: { id: ids } })
    if (data.some((v) => v.product?.metadata?.catalog_scope === profile.scope)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Создайте защищённую корзину перед добавлением товара")
  }
  return new StepResponse(undefined)
})
async function guardItems(container: any, cart: any, items: { variant_id?: string; quantity: number }[]) {
  const ids = items.map((i) => i.variant_id).filter((id): id is string => !!id)
  if (!ids.length) return
  const profile = await getCatalogProfile(container)
  const { data: products } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id", "product.metadata"], filters: { id: ids } })
  const texno = products.filter((v) => v.product?.metadata?.catalog_scope === profile.scope).map((v) => v.id)
  if (!texno.length) return
  // Core add/update hooks intentionally receive a narrow cart projection, which
  // omits metadata. Retrieve the trusted context instead of treating it as absent.
  const { data: carts } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: ["id", "metadata", "currency_code", "sales_channel_id", "items.variant_id", "items.quantity"], filters: { id: cart.id } })
  const context = carts[0]
  if (!context?.metadata?.texno_checkout || context.currency_code !== profile.currency_code) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Товары оформляются в корзине региона магазина")
  const quantities = new Map<string, number>((context.items ?? []).filter((item) => item.variant_id).map((item) => [item.variant_id, Number(item.quantity)]))
  for (const item of items) if (item.variant_id) quantities.set(item.variant_id, Number(item.quantity))
  await assertPurchasable(container, context, [...quantities].filter(([, quantity]) => quantity > 0).map(([variant_id, quantity]) => ({ variant_id, quantity })))
}
addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  await guardItems(container, cart, input.items.map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) + Number(cart.items?.find((p) => p.variant_id === i.variant_id)?.quantity ?? 0) })))
  return new StepResponse(undefined)
})
updateLineItemInCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const item = cart.items.find((i) => i.id === input.item_id)
  if (item?.variant_id) await guardItems(container, cart, [{ variant_id: item.variant_id, quantity: Number(input.update.quantity ?? item.quantity) }])
  return new StepResponse(undefined)
})
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  if (cart.metadata?.texno_checkout && !cart.metadata?.texno_order?.consent) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Заполните данные заказа")
  if (!cart.completed_at) await guardItems(container, cart, cart.items)
  return new StepResponse(undefined)
})
