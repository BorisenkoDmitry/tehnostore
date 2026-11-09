import type { MedusaContainer } from "@medusajs/framework/types"
import { assertPurchasable, variantAvailability } from "../texno-cart"

jest.mock("../catalog-cms", () => ({ getCatalogProfile: async () => ({ scope: "clothing", region_id: "region", currency_code: "rub" }) }))
jest.mock("../catalog-hierarchy", () => ({ publishedCategoryIds: () => new Set(["category"]) }))

const cart = { sales_channel_id: "channel", metadata: {} }
const variant = (id: string, required_quantity = 1) => ({
  id, metadata: { catalog_stock_confirmed: true, catalog_stock_confirmation_id: "proof" }, manage_inventory: true, allow_backorder: false,
  product: { status: "published", metadata: { catalog_scope: "clothing" }, categories: [{ id: "category" }], sales_channels: [{ id: "channel" }] },
  inventory_items: [{ inventory_item_id: "shared", required_quantity, inventory: { location_levels: [{ location_id: "a", stocked_quantity: 1, reserved_quantity: 0 }, { location_id: "b", stocked_quantity: 1, reserved_quantity: 0 }] } }],
})
function context(variants: any[], pickup = false) {
  return { resolve: () => ({ graph: async ({ entity }) => ({ data: entity === "product_variant" ? variants : entity === "stock_location" ? ["a", "b"].map((id) => ({ id, sales_channels: [{ id: "channel" }] })) : entity === "shipping_option" ? [{ id: "option", metadata: { texno_delivery_id: "selected" }, service_zone: { fulfillment_set: { type: pickup ? "pickup" : "shipping", location: { id: "a" } } } }] : [] }) }) } as unknown as MedusaContainer
}

describe("custom cart stock contract", () => {
  it("aggregates shared inventory across variant and kit lines", async () => {
    const container = context([variant("one"), variant("kit", 2)])
    await expect(assertPurchasable(container, cart, [{ variant_id: "one", quantity: 1 }, { variant_id: "kit", quantity: 1 }])).rejects.toThrow("общего остатка")
    await expect(assertPurchasable(container, cart, [{ variant_id: "kit", quantity: 1 }])).resolves.toBeDefined()
  })
  it("uses only the selected pickup location", async () => {
    const container = context([variant("one")], true)
    const selected = { ...cart, metadata: { texno_selection: { delivery_method: "selected" } } }
    expect((await variantAvailability(container, selected, ["one"]))[0].available_quantity).toBe(1)
    await expect(assertPurchasable(container, selected, [{ variant_id: "one", quantity: 2 }])).rejects.toThrow()
  })
  it("advertises both warehouses for delivery and honors backorder/unmanaged settings", async () => {
    const container = context([variant("one"), { ...variant("back"), allow_backorder: true }, { ...variant("unmanaged"), manage_inventory: false }])
    const selected = { ...cart, metadata: { texno_selection: { delivery_method: "selected" } } }
    const rows = await variantAvailability(container, selected, ["one", "back", "unmanaged"])
    expect(rows.map((row) => [row.variant_id, row.available_quantity, row.purchasable])).toEqual([["one", 2, true], ["back", 999, true], ["unmanaged", 999, true]])
  })
})
