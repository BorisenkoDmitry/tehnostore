import { calculateQuote, DEFAULT_CART_CONFIGURATION, validateCheckout } from "../texno-cart-rules"
import { assertToken, hashToken } from "../texno-cart"

const valid = { name: "Проверка", phone: "+7 (999) 111-22-33", city: "Москва", delivery_method: "moscow", address: { street: "Тестовая", metro: "Тестовая", house: "1" }, delivery_date: "2026-11-08", delivery_slot: "10:00–14:00", payment_preference: "cash", services: [], consent: true }
const now = new Date("2026-11-07T09:00:00Z")
describe("server checkout rules", () => {
  it("uses RUB units and only opt-in service IDs", () => {
    expect(calculateQuote(DEFAULT_CART_CONFIGURATION, 3200, "moscow", ["application"])).toEqual({ items_total: 3200, services_total: 390, delivery_total: 299, total: 3889, requires_confirmation: false })
    expect(calculateQuote(DEFAULT_CART_CONFIGURATION, 3200, "pickup", []).services_total).toBe(0)
  })
  it("keeps a range and unknown CDEK separate from free pickup", () => {
    expect(calculateQuote(DEFAULT_CART_CONFIGURATION, 3200, "transport", [])).toMatchObject({ total: 3200, delivery_total: null, min_total: 3600, max_total: 4000, requires_confirmation: true })
    expect(calculateQuote(DEFAULT_CART_CONFIGURATION, 3200, "cdek", [])).toMatchObject({ total: 3200, delivery_total: null, requires_confirmation: true })
    expect(calculateQuote(DEFAULT_CART_CONFIGURATION, 3200, "pickup", [])).toMatchObject({ total: 3200, delivery_total: 0, requires_confirmation: false })
  })
  it.each([["missing", []], ["moscow", ["tampered"]], ["moscow", ["sim", "sim"]]])("rejects invalid IDs and repeated services", (method, services) => {
    expect(() => calculateQuote(DEFAULT_CART_CONFIGURATION, 1000, method as string, services as string[])).toThrow()
  })
  it("accepts a genuinely omitted email and normalizes a real phone", () => {
    expect(validateCheckout(valid, DEFAULT_CART_CONFIGURATION, now)).toMatchObject({ email: undefined, phone: "+79991112233" })
    expect(validateCheckout({ ...valid, phone: "8 999 111 22 33" }, DEFAULT_CART_CONFIGURATION, now).phone).toBe("+79991112233")
    expect(validateCheckout({ ...valid, phone: "9991112233" }, DEFAULT_CART_CONFIGURATION, now).phone).toBe("+79991112233")
  })
  it("requires address/metro only where relevant", () => {
    expect(() => validateCheckout({ ...valid, address: {} }, DEFAULT_CART_CONFIGURATION, now)).toThrow()
    expect(() => validateCheckout({ ...valid, city: "Казань", delivery_method: "transport", address: {} }, DEFAULT_CART_CONFIGURATION, now)).not.toThrow()
    expect(() => validateCheckout({ ...valid, city: "Казань" }, DEFAULT_CART_CONFIGURATION, now)).toThrow()
  })
  it.each([{ phone: "123" }, { email: "bad" }, { consent: false }, { delivery_date: "2026-11-06" }, { delivery_date: "2026-11-31" }, { delivery_slot: "09:00–10:00" }, { payment_preference: "paid" }])("rejects invalid checkout data", (change) => {
    expect(() => validateCheckout({ ...valid, ...change }, DEFAULT_CART_CONFIGURATION, now)).toThrow()
  })
  it("uses Moscow clock and rejects elapsed slots", () => {
    expect(() => validateCheckout({ ...valid, delivery_date: "2026-11-07", delivery_slot: "10:00–14:00" }, DEFAULT_CART_CONFIGURATION, new Date("2026-11-07T12:00:00Z"))).toThrow()
  })
  it("denies missing, foreign, and malformed capability tokens", () => {
    const cart = { metadata: { texno_token_hash: hashToken("owner") } }
    expect(() => assertToken(cart, "owner")).not.toThrow()
    for (const token of ["", "foreign", "a".repeat(999)]) expect(() => assertToken(cart, token)).toThrow()
    expect(() => assertToken({ metadata: {} }, "owner")).toThrow()
  })
})
