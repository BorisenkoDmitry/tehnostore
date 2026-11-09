import type { MedusaContainer } from "@medusajs/framework/types"
import { cartState, hashToken, privateCart } from "../texno-cart"
import { DEFAULT_CART_CONFIGURATION } from "../texno-cart-rules"

describe("completed order confirmation", () => {
  it("keeps accepted totals, delivery status, and selection after CMS tariffs change", async () => {
    const configuration = {
      delivery_methods: DEFAULT_CART_CONFIGURATION.delivery_methods.map((m) => m.id === "moscow" ? { ...m, price: null, pricing: "range", min: 600, max: 1200 } : m),
      services: DEFAULT_CART_CONFIGURATION.services.map((s) => ({ ...s, price: s.price * 10 })),
    }
    const savedQuote = { items_total: 1500, services_total: 490, delivery_total: 299, total: 2289, requires_confirmation: false }
    const cart = { id: "cart_completed", completed_at: "2026-11-07", items: [{ id: "item_goods", variant_id: "variant_saved", total: 1500 }], metadata: { texno_token_hash: "private", texno_selection: { delivery_method: "moscow", services: ["sim", "protection"] }, texno_order: { quote: savedQuote } } }
    const graph = jest.fn(async ({ entity }) => ({ data: entity === "region" ? [{ id: "reg_ru", currency_code: "rub", metadata: { texno_checkout: true, texno_cart_configuration: configuration } }] : entity === "order_cart" ? [{ order_id: "order_saved" }] : [{ id: "order_saved", total: 2289, currency_code: "rub" }] }))
    const container = { resolve: () => ({ graph, listCatalogProfiles: async () => [{ id: "profile", scope: "texno", region_id: "reg_ru", product_types: [] }] }) } as unknown as MedusaContainer
    const state = await cartState(container, cart, "cdek", [])
    expect(state.quote).toEqual({ ...savedQuote, line_availability: [] })
    expect(state.selected).toEqual({ delivery_method: "moscow", services: ["sim", "protection"] })
    expect(state.order).toMatchObject({ id: "order_saved", total: 2289 })
    expect(state.cart.metadata).toEqual({})
    expect(state.configuration.services.find((s) => s.id === "sim")!.price).toBe(2000)
  })
})

describe("account cart privacy", () => {
  const token = "original-guest-capability"
  const context = (cart: object) => ({ resolve: () => ({ graph: async () => ({ data: [cart] }) }) }) as unknown as MedusaContainer
  it("retains guest access through capability only before ownership attaches", async () => {
    const cart = { id: "cart_guest", metadata: { texno_checkout: true, texno_token_hash: hashToken(token) } }
    await expect(privateCart(context(cart), cart.id, token)).resolves.toEqual(cart)
    await expect(privateCart(context(cart), cart.id, "wrong", "cus_a")).rejects.toThrow("Корзина недоступна")
  })
  it("requires the authenticated owner after association even with original capability", async () => {
    const cart = { id: "cart_a", customer_id: "cus_a", metadata: { texno_checkout: true, texno_token_hash: hashToken(token), texno_customer_id: "cus_a" } }
    await expect(privateCart(context(cart), cart.id, token)).rejects.toThrow("только своему покупателю")
    await expect(privateCart(context(cart), cart.id, token, "cus_b")).rejects.toThrow("только своему покупателю")
    await expect(privateCart(context(cart), cart.id, "", "cus_a")).resolves.toEqual(cart)
  })
})
