import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CartConfiguration, calculateQuote, stockProvenanceKnown } from "./texno-cart-rules"
import { getCatalogProfile } from "./catalog-cms"
import { publishedCategoryIds } from "./catalog-hierarchy"

export const cartFields = ["id", "customer_id", "customer.has_account", "currency_code", "region_id", "sales_channel_id", "completed_at", "email", "metadata", "subtotal", "total", "item_total", "shipping_total", "items.*", "items.variant.id", "items.variant.title", "items.variant.metadata", "items.variant.product.id", "items.variant.product.handle", "items.variant.product.title", "items.variant.product.thumbnail", "items.variant.options.value", "items.variant.options.option.title", "shipping_address.*", "shipping_methods.*", "payment_collection.id", "payment_collection.amount", "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.status"]
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")
export const newCartToken = () => randomBytes(32).toString("hex")
export function assertToken(cart: any, token: string) {
  const saved = String(cart.metadata?.texno_token_hash ?? "")
  const candidate = hashToken(token ?? "")
  if (!saved || saved.length !== candidate.length || !timingSafeEqual(Buffer.from(saved), Buffer.from(candidate))) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина недоступна")
}
export async function checkoutRegion(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const profile = await getCatalogProfile(container)
  const { data } = await query.graph({ entity: "region", fields: ["id", "currency_code", "metadata", "countries.iso_2"], filters: { id: profile.region_id } })
  const region = data[0]
  if (!region) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Рублёвая корзина ещё не настроена")
  return region
}
export function regionConfiguration(region: any): CartConfiguration {
  const value = region.metadata?.texno_cart_configuration
  if (!value || !Array.isArray(value.delivery_methods) || !Array.isArray(value.services)) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Настройки оформления недоступны")
  for (const service of value.services) if (!Number.isFinite(service.price) || service.price < 0) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Неверная цена услуги")
  const visible = (items: any[]) => items.filter((item) => item.enabled !== false).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
  return { ...value, currency_code: region.currency_code, country_code: value.country_code || region.countries?.[0]?.iso_2, delivery_methods: visible(value.delivery_methods), services: visible(value.services) }
}
export async function privateCart(container: MedusaContainer, id: string, token?: string, customerId?: string): Promise<any> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cart", fields: cartFields, filters: { id } })
  const cart = data[0]
  if (!cart || cart.metadata?.texno_checkout !== true) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Корзина не найдена")
  if (token !== undefined || customerId !== undefined) {
    const owner = cart.metadata?.texno_customer_id || (cart.customer?.has_account ? cart.customer_id : undefined)
    if (owner) {
      if (!customerId || customerId !== owner || cart.customer_id !== owner) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Корзина доступна только своему покупателю")
    } else assertToken(cart, token ?? "")
  }
  return cart
}

export async function customerCarts(container: MedusaContainer, customerId: string, channelIds: string[]) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const active: any[] = []
  for (let offset = 0; ; offset += 100) {
    const { data }: { data: any[] } = await query.graph({ entity: "cart", fields: ["id", "customer_id", "completed_at", "created_at", "sales_channel_id", "metadata"], filters: { customer_id: customerId, completed_at: null }, pagination: { take: 100, skip: offset, order: { created_at: "ASC" } } })
    active.push(...data.filter((cart) => cart.metadata?.texno_checkout === true && cart.metadata?.texno_customer_id === customerId && !cart.metadata?.texno_merged_into && channelIds.includes(cart.sales_channel_id)))
    if (data.length < 100) break
  }
  return active.sort((a, b) => String(b.metadata?.texno_primary_at ?? "").localeCompare(String(a.metadata?.texno_primary_at ?? "")) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id))
}
export async function customerCartState(container: MedusaContainer, customerId: string, channelIds: string[]) {
  const carts = await customerCarts(container, customerId, channelIds)
  if (!carts.length) return null
  const cart = await privateCart(container, carts[0].id, "", customerId)
  return cartState(container, cart)
}

export async function cartStockLocations(container: MedusaContainer, cart: any) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "sales_channels.id"] })
  const allowed = locations.filter((location) => location.sales_channels?.some((channel) => channel?.id === cart.sales_channel_id)).map((location) => location.id)
  const method = cart.metadata?.texno_selection?.delivery_method
  if (!method) return new Set(allowed)
  const { data: options }: { data: any[] } = await query.graph({ entity: "shipping_option", fields: ["id", "metadata", "service_zone.fulfillment_set.type", "service_zone.fulfillment_set.location.id"] })
  const option = options.find((item) => item.metadata?.texno_delivery_id === method)
  if (option?.service_zone?.fulfillment_set?.type !== "pickup") return new Set(allowed)
  const selected = option.service_zone.fulfillment_set.location?.id
  return new Set(allowed.filter((id) => id === selected))
}

export async function variantAvailability(container: MedusaContainer, cart: any, ids: string[]) {
  if (!ids.length) return []
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const profile = await getCatalogProfile(container)
  const { data: variants }: { data: any[] } = await query.graph({ entity: "product_variant", fields: ["id", "metadata", "manage_inventory", "allow_backorder", "product.id", "product.status", "product.metadata", "product.categories.id", "product.categories.is_active", "product.categories.is_internal", "product.categories.metadata", "product.sales_channels.id", "catalog_variant.source_data", "inventory_items.required_quantity", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity", "inventory_items.inventory.location_levels.location_id"], filters: { id: ids } })
  const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "is_active", "is_internal", "metadata"], pagination: { take: 1000 } })
  const published = publishedCategoryIds(categories, profile.scope)
  const allowedLocations = await cartStockLocations(container, cart)
  return ids.map((id) => {
    const variant = variants.find((v) => v.id === id)
    let reason: string | undefined
    let quantity = 0
    if (!variant || variant.product?.status !== "published" || !variant.product.sales_channels?.some((c) => c.id === cart.sales_channel_id)) reason = "Товар недоступен в магазине"
    else if (variant.product.metadata?.catalog_scope !== profile.scope || !variant.product.categories?.some((category) => published.has(category.id))) reason = "Товар снят с публикации в каталоге"
    else if (!variant.manage_inventory || variant.allow_backorder) quantity = 999
    else if (!stockProvenanceKnown(variant)) reason = "Наличие уточняется"
    else {
      quantity = Math.min(...(variant.inventory_items ?? []).map((i) => Math.floor((i.inventory?.location_levels ?? []).filter((l) => allowedLocations.has(l.location_id)).reduce((sum, l) => sum + Number(l.stocked_quantity) - Number(l.reserved_quantity), 0) / Number(i.required_quantity || 1))))
      if (!Number.isFinite(quantity) || quantity < 1) { quantity = 0; reason = "Нет в наличии" }
    }
    return { variant_id: id, available_quantity: Math.max(0, Math.min(quantity, 999)), purchasable: !reason, ...(reason ? { reason } : {}) }
  })
}
export async function assertPurchasable(container: MedusaContainer, cart: any, quantities: { variant_id: string; quantity: number }[]) {
  const availability = await variantAvailability(container, cart, quantities.map((q) => q.variant_id))
  for (const item of quantities) {
    const available = availability.find((a) => a.variant_id === item.variant_id)!
    if (!available.purchasable || item.quantity > available.available_quantity) throw new MedusaError(MedusaError.Types.INVALID_DATA, available.reason ?? `Доступно не более ${available.available_quantity} шт.`)
  }
  // Several variants (including kits) can consume the same inventory item.
  // The native reservation module repeats this check under database row locks;
  // this validation supplies an early, consistent cart/quote error only.
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants }: { data: any[] } = await query.graph({ entity: "product_variant", fields: ["id", "manage_inventory", "allow_backorder", "inventory_items.inventory_item_id", "inventory_items.required_quantity", "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"], filters: { id: quantities.map((item) => item.variant_id) } })
  const allowed = await cartStockLocations(container, cart)
  const demand = new Map<string, { quantity: number; available: number }>()
  for (const item of quantities) {
    const variant = variants.find((row) => row.id === item.variant_id)
    if (!variant?.manage_inventory || variant.allow_backorder) continue
    for (const component of variant.inventory_items ?? []) {
      const current = demand.get(component.inventory_item_id) ?? { quantity: 0, available: (component.inventory?.location_levels ?? []).filter((level) => allowed.has(level.location_id)).reduce((sum, level) => sum + Number(level.stocked_quantity) - Number(level.reserved_quantity), 0) }
      current.quantity += Number(item.quantity) * Number(component.required_quantity ?? 1)
      demand.set(component.inventory_item_id, current)
    }
  }
  if ([...demand.values()].some((item) => item.quantity > item.available)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Недостаточно общего остатка для выбранных вариантов")
  return availability
}
export function productItemsTotal(cart: any) { return (cart.items ?? []).filter((i) => i.variant_id).reduce((sum, i) => sum + Number(i.total ?? Number(i.unit_price) * Number(i.quantity)), 0) }
export async function cartState(container: MedusaContainer, cart: any, method?: string, services?: string[]) {
  const configuration = regionConfiguration(await checkoutRegion(container))
  const selected = cart.metadata?.texno_selection ?? {}
  const selection = cart.completed_at
    ? { delivery_method: selected.delivery_method, services: selected.services ?? [] }
    : { delivery_method: method ?? (configuration.delivery_methods.some((item) => item.id === selected.delivery_method) ? selected.delivery_method : undefined), services: services ?? (selected.services ?? []).filter((id) => configuration.services.some((item) => item.id === id)) }
  let quote
  // An order's accepted quote is immutable. Later CMS tariff/service edits must
  // not rewrite the delivery warning or historical confirmation amounts.
  try { quote = cart.completed_at && cart.metadata?.texno_order?.quote ? cart.metadata.texno_order.quote : calculateQuote(configuration, productItemsTotal(cart), selection.delivery_method, selection.services) }
  catch (error) { throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message) }
  const availability = cart.completed_at ? [] : await variantAvailability(container, { ...cart, metadata: { ...cart.metadata, texno_selection: selection } }, cart.items.filter((i) => i.variant_id).map((i) => i.variant_id))
  const { data: links } = cart.completed_at ? await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order_cart", fields: ["order_id"], filters: { cart_id: cart.id } }) : { data: [] }
  let order: Record<string, unknown> | undefined
  if (links[0]?.order_id) {
    const { data: orders } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["id", "display_id", "total", "currency_code", "payment_status"], filters: { id: links[0].order_id } })
    order = orders[0]
  }
  const safeCart = { ...cart, metadata: {}, payment_collection: undefined, items: cart.items.filter((i) => i.variant_id).map((i) => ({ ...i, metadata: {}, variant: i.variant ? { ...i.variant, metadata: undefined } : undefined })) }
  const active = !cart.completed_at && cart.metadata?.texno_customer_id ? await customerCarts(container, cart.metadata.texno_customer_id, [cart.sales_channel_id]) : []
  const merge_pending = active.length > 1 ? { message: String(cart.metadata?.texno_merge_issue || "Для объединения проверьте наличие и количество товаров."), carts: active.map((item) => ({ id: item.id })) } : undefined
  return { cart: safeCart, configuration, selected: selection, quote: { ...quote, line_availability: availability }, ...(order ? { order } : {}), ...(merge_pending ? { merge_pending } : {}) }
}
