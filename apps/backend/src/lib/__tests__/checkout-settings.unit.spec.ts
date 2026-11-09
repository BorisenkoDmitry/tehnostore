import { CheckoutSettingsSchema } from "../../api/admin/checkout-settings/validators"
import { DEFAULT_CART_CONFIGURATION, calculateQuote } from "../texno-cart-rules"
import { regionConfiguration } from "../texno-cart"

const valid = () => ({
  expected_revision: 0,
  delivery_methods: DEFAULT_CART_CONFIGURATION.delivery_methods.map((item, order) => ({ ...item, enabled: true, order })),
  services: DEFAULT_CART_CONFIGURATION.services.map((item, order) => ({ ...item, enabled: true, order })),
})
describe("validated checkout settings", () => {
  it("preserves RUB units and all existing fixed/range/unquoted options", () => {
    const config = CheckoutSettingsSchema.parse(valid())
    expect(config.delivery_methods.find((item) => item.id === "moscow")?.price).toBe(299)
    expect(calculateQuote(config, 1000, "outside_mkad")).toMatchObject({ total: 1000, delivery_total: null, min_total: 1600, max_total: 2200, requires_confirmation: true })
  })
  it.each([
    { pricing: "fixed", price: null },
    { pricing: "range", price: 100, min: 100, max: 200 },
    { pricing: "range", price: null, min: 300, max: 200 },
    { pricing: "unconfirmed", price: null, min: 0 },
    { pricing: "fixed", price: 0.001 },
  ])("rejects ambiguous or invalid monetary pricing %j", (change) => {
    const config = valid()
    Object.assign(config.delivery_methods[0], change)
    expect(CheckoutSettingsSchema.safeParse(config).success).toBe(false)
  })
  it("rejects duplicate identifiers, no available delivery and private extras", () => {
    const config = valid()
    expect(CheckoutSettingsSchema.safeParse({ ...config, services: [config.services[0], config.services[0]] }).success).toBe(false)
    expect(CheckoutSettingsSchema.safeParse({ ...config, delivery_methods: config.delivery_methods.map((item) => ({ ...item, enabled: false })) }).success).toBe(false)
    expect(CheckoutSettingsSchema.safeParse({ ...config, actor_id: "spoofed" }).success).toBe(false)
  })
  it("excludes disabled entries and respects CMS order", () => {
    const config = valid()
    config.delivery_methods[0].enabled = false
    config.delivery_methods[2].order = 0
    config.delivery_methods[1].order = 10
    config.services[0].enabled = false
    const visible = regionConfiguration({ metadata: { texno_cart_configuration: config } })
    expect(visible.delivery_methods[0].id).toBe("pickup")
    expect(visible.delivery_methods.some((item) => item.id === "moscow")).toBe(false)
    expect(() => calculateQuote(visible, 100, "pickup", ["sim"])).toThrow()
  })
})
