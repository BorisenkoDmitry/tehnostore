"use server"

import { sdk } from "@lib/config"
import { cookies } from "next/headers"
import { revalidateTag } from "next/cache"
import { randomUUID } from "node:crypto"
import { getAuthHeaders, getCartId, getCacheTag, setCartId } from "./cookies"
import type { CartConfiguration, CheckoutInput, OrderConfirmation, TexnoCartState } from "./texno-cart-types"
import type { HttpTypes } from "@medusajs/types"

const tokenName = "_texno_cart_token"
const stateHeaders = async () => {
  const token = (await cookies()).get(tokenName)?.value
  const auth = await getAuthHeaders()
  return token || "authorization" in auth ? { ...(token ? { "x-texno-cart-token": token } : {}), ...auth } : null
}
const refresh = async () => {
  const tag = await getCacheTag("carts")
  if (tag) revalidateTag(tag, { expire: 0 })
}
const errorMessage = (error: unknown) => {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : undefined
  const message = error instanceof Error ? error.message : ""
  if (/not enough stock|insufficient.*stock|inventory.*not available/i.test(message)) return "Нужного количества больше нет в наличии. Обновите корзину или удалите недоступный товар."
  if (status === 409 || /conflicted with another request/i.test(message)) return "Стоимость или состав корзины изменились. Обновите расчёт и повторите оформление."
  if ((status && status >= 500) || /fetch failed|failed to fetch|network|timed? ?out|aborted/i.test(message)) return "Нет связи с магазином. Ваша корзина сохранена — попробуйте ещё раз."
  return message || "Не удалось связаться с магазином. Попробуйте ещё раз."
}

export async function retrieveCartConfiguration() {
  const { configuration } = await sdk.client.fetch<{ configuration: CartConfiguration }>("/store/texno-cart/configuration", { cache: "no-store" })
  return configuration
}

export async function retrieveTexnoCart(): Promise<TexnoCartState | null> {
  const id = await getCartId()
  const headers = await stateHeaders()
  if (!headers) return null
  if (id) {
    try { return await sdk.client.fetch<TexnoCartState>(`/store/texno-cart/${encodeURIComponent(id)}`, { headers, cache: "no-store" }) }
    catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0
      if (![400, 401, 403, 404].includes(status)) throw error
    }
  }
  if (!("authorization" in headers)) return null
  try {
    return (await sdk.client.fetch<{ state: TexnoCartState | null }>("/store/texno-cart/me", { headers, cache: "no-store" })).state
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0
    if ([401, 403].includes(status)) return null
    throw error
  }
}

export async function claimTexnoCart(preferredCartId?: string) {
  const id = preferredCartId ?? await getCartId()
  const tokenHeaders = await stateHeaders()
  const authHeaders = await getAuthHeaders()
  if (!("authorization" in authHeaders)) return null
  let state: TexnoCartState | undefined
  if (id) {
    try { state = await sdk.client.fetch<TexnoCartState>(`/store/texno-cart/${encodeURIComponent(id)}/claim`, { method: "POST", headers: { ...tokenHeaders, ...authHeaders }, body: {} }) }
    catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0
      if (preferredCartId || ![400, 401, 403, 404].includes(status)) throw error
    }
  }
  state ??= await sdk.client.fetch<TexnoCartState>("/store/texno-cart/me", { method: "POST", headers: authHeaders, body: {} })
  await setCartId(state.cart.id)
  ;(await cookies()).delete(tokenName)
  for (const scope of ["carts", "orders", "customers"]) {
    const tag = await getCacheTag(scope)
    if (tag) revalidateTag(tag, { expire: 0 })
  }
  return state
}

export async function clearTexnoCartCapability() { (await cookies()).delete(tokenName) }
export async function chooseSavedCart(id: string) {
  try { return { state: await claimTexnoCart(id) } }
  catch (error) { return { error: errorMessage(error) } }
}

async function activeCart() {
  if ("authorization" in await getAuthHeaders()) return (await claimTexnoCart())!
  let state = await retrieveTexnoCart()
  if (!state || state.order || state.cart.completed_at) {
    const created = await sdk.client.fetch<TexnoCartState & { token: string }>("/store/texno-cart", { method: "POST", body: {} })
    await setCartId(created.cart.id)
    const jar = await cookies()
    jar.set(tokenName, created.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 })
    state = created
  }
  return state
}

export async function changeTexnoItem(input: { variant_id: string; quantity: number; mutation_id: string; add?: boolean }) {
  try {
    const state = await activeCart()
    const result = await sdk.client.fetch<TexnoCartState>(`/store/texno-cart/${encodeURIComponent(state.cart.id)}/items`, {
      method: "POST", headers: (await stateHeaders())!, body: { variant_id: input.variant_id, quantity: input.quantity, mutation_id: input.mutation_id, increment: input.add ?? false },
    })
    await refresh()
    return { state: result }
  } catch (error) { return { error: errorMessage(error) } }
}

export async function clearTexnoCart() {
  try {
    const state = await retrieveTexnoCart()
    const headers = await stateHeaders()
    if (!state || !headers) return { state: null }
    let result = state
    for (const item of state.cart.items ?? []) {
      result = await sdk.client.fetch<TexnoCartState>(`/store/texno-cart/${encodeURIComponent(state.cart.id)}/items`, { method: "POST", headers, body: { variant_id: item.variant_id, quantity: 0, mutation_id: randomUUID() } })
    }
    await refresh()
    return { state: result }
  } catch (error) { return { error: errorMessage(error) } }
}

export async function quoteTexnoCart(input: { delivery_method: string; services: string[] }) {
  try {
    const cart = await retrieveTexnoCart()
    const headers = await stateHeaders()
    if (!cart || !headers) return { error: "Корзина не найдена. Добавьте товары снова." }
    const services = input.services.filter((id) => cart.configuration.services.some((service) => service.id === id))
    const state = await sdk.client.fetch<TexnoCartState>(`/store/texno-cart/${encodeURIComponent(cart.cart.id)}/quote`, {
      method: "POST", headers, body: { ...input, services },
    })
    return { state, servicesRemoved: services.length < input.services.length }
  } catch (error) { return { error: errorMessage(error) } }
}

export async function checkoutTexnoCart(input: CheckoutInput) {
  try {
    let state = await retrieveTexnoCart()
    if (state?.order) return { order: state.order, quote: state.quote }
    state = await claimTexnoCart() ?? state
    const id = state?.cart.id
    const headers = await stateHeaders()
    if (!id || !headers) return { error: "Корзина не найдена. Добавьте товары снова." }
    let checkout = input
    const auth = await getAuthHeaders()
    if ("authorization" in auth) {
      const { customer } = await sdk.client.fetch<{ customer: HttpTypes.StoreCustomer }>("/store/customers/me", { headers: auth, cache: "no-store" })
      checkout = { ...input, name: input.name || [customer.first_name, customer.last_name].filter(Boolean).join(" "), phone: input.phone || customer.phone || "", email: input.email ?? customer.email }
      const digits = checkout.phone.replace(/\D/g, "")
      const update: { first_name?: string; phone?: string } = {}
      if (!customer.first_name?.trim() && checkout.name.trim().length >= 2 && checkout.name.trim().length <= 100) update.first_name = checkout.name.trim()
      if ((!customer.phone || customer.phone.replace(/\D/g, "").length < 10) && digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0")) update.phone = checkout.phone.trim()
      if (Object.keys(update).length) {
        await sdk.store.customer.update(update, {}, auth)
        const tag = await getCacheTag("customers")
        if (tag) revalidateTag(tag, { expire: 0 })
      }
    }
    const result = await sdk.client.fetch<{ order: OrderConfirmation; quote: TexnoCartState["quote"] }>(`/store/texno-cart/${encodeURIComponent(id)}/checkout`, { method: "POST", headers, body: checkout })
    await refresh()
    return result
  } catch (error) { return { error: errorMessage(error) } }
}
