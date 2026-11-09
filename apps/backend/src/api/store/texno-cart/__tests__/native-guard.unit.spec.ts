import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  blockNativeCheckoutPayments,
  blockNativeOrderTransfer,
  guardNativeCartLine,
  guardNativeCartWrite,
  guardTexnoNativeCart,
  guardTexnoNativeOrder,
  validateNativeCheckoutPath,
} from "../native-guard"

function request(input: Record<string, unknown>, rows: Record<string, unknown[]>) {
  const graph = jest.fn(async ({ entity }: { entity: string }) => ({ data: rows[entity] ?? [] }))
  const next = jest.fn()
  const req = { params: { id: "cart_target" }, method: "GET", scope: { resolve: () => ({ graph }) }, ...input }
  return { req: req as unknown as MedusaRequest, res: {} as MedusaResponse, next, graph }
}

const owner = { actor_type: "customer", actor_id: "cus_owner" }

describe("native store checkout access", () => {
  it.each([
    { texno_checkout: true },
    { texno_checkout: "true" },
    { texno_checkout: false, texno_token_hash: "historic" },
    { texno_customer_id: "cus_owner" },
    { texno_merged_into: "cart_other" },
  ])("checks the decoded cart ID for legacy markers %j", async (metadata) => {
    const { req, res, next, graph } = request({ originalUrl: "/store/CARTS/%63art_target/" }, {
      cart: [{ id: "cart_target", metadata }],
    })
    await expect(guardTexnoNativeCart(req, res, next)).rejects.toMatchObject({ type: "not_allowed" })
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ filters: { id: "cart_target" } }))
    expect(next).not.toHaveBeenCalled()
  })

  it.each(["cart%5Ftarget", "cart/target", "cart\u0000target", "cart target", ""])("rejects an invalid decoded ID %j without lookup", async (id) => {
    const { req, res, next, graph } = request({ params: { id } }, {})
    await expect(guardTexnoNativeCart(req, res, next)).rejects.toMatchObject({ type: "invalid_data" })
    expect(graph).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it("maps a malformed escape to a client error before Express matches parameters", () => {
    const { req, res, next } = request({ path: "/%E0%A4" }, {})
    expect(() => validateNativeCheckoutPath(req, res, next)).toThrow("Неверный адрес ресурса")
    expect(next).not.toHaveBeenCalled()
  })

  it("keeps ordinary guest and owner legacy carts available", async () => {
    const guest = request({}, { cart: [{ id: "cart_target", metadata: { ucp_canceled: false } }] })
    await guardTexnoNativeCart(guest.req, guest.res, guest.next)
    expect(guest.next).toHaveBeenCalledTimes(1)
    const rows = { cart: [{ id: "cart_target", customer_id: owner.actor_id, customer: { has_account: true } }] }
    const own = request({ auth_context: owner }, rows)
    await guardTexnoNativeCart(own.req, own.res, own.next)
    expect(own.next).toHaveBeenCalledTimes(1)
    const foreign = request({ auth_context: { ...owner, actor_id: "cus_other" } }, rows)
    await expect(guardTexnoNativeCart(foreign.req, foreign.res, foreign.next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it("checks linked order protection for a completed markerless cart", async () => {
    const { req, res, next } = request({ method: "POST" }, {
      cart: [{ id: "cart_target", completed_at: "2026-11-09" }],
      order_cart: [{ order: { metadata: { texno_order: {} } } }],
    })
    await expect(guardTexnoNativeCart(req, res, next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it("accepts an item only when it belongs to the guarded cart", async () => {
    const rows = { cart: [{ id: "cart_target", items: [{ id: "cali_mine" }] }] }
    const own = request({ params: { id: "cart_target", line_id: "cali_mine" } }, rows)
    await guardNativeCartLine(own.req, own.res, own.next)
    expect(own.next).toHaveBeenCalledTimes(1)
    const foreign = request({ params: { id: "cart_target", line_id: "cali_other" } }, rows)
    await expect(guardNativeCartLine(foreign.req, foreign.res, foreign.next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it.each([
    { metadata: { texno_checkout: false } },
    { shipping_address: "ca_other" },
    { billing_address: { id: "ca_other" } },
  ])("rejects internal metadata and foreign address references %j", (validatedBody) => {
    const { req, res, next } = request({ validatedBody }, {})
    expect(() => guardNativeCartWrite(req, res, next)).toThrow()
    expect(next).not.toHaveBeenCalled()
  })

  it("permits normal native metadata and inline address data", () => {
    const { req, res, next } = request({ validatedBody: {
      metadata: { ucp_canceled: true }, shipping_address: { address_1: "Fixture" },
    } }, {})
    guardNativeCartWrite(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each(["GET", "HEAD"])("permits the matching customer to read a protected order with %s", async (method) => {
    const { req, res, next, graph } = request({ params: { id: "order_target" }, method, auth_context: owner }, {
      order: [{ customer_id: owner.actor_id, metadata: { texno_order: {}, texno_customer_id: owner.actor_id } }],
    })
    await guardTexnoNativeOrder(req, res, next)
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ filters: { id: "order_target" } }))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each([
    { method: "GET", auth_context: { ...owner, actor_id: "cus_other" } },
    { method: "GET", auth_context: { ...owner, actor_type: "user" } },
    { method: "GET" },
    { method: "POST", auth_context: owner },
  ])("does not grant native order access with %j", async (input) => {
    const { req, res, next } = request(input, {
      order: [{ customer_id: owner.actor_id, metadata: { texno_checkout: true, texno_customer_id: owner.actor_id } }],
    })
    await expect(guardTexnoNativeOrder(req, res, next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it("permits an actual legacy order owner even when checkout metadata exists only on the cart", async () => {
    const { req, res, next } = request({ auth_context: owner }, {
      order: [{ customer_id: owner.actor_id }],
      order_cart: [{ cart: { metadata: { texno_token_hash: "historic" } } }],
    })
    await guardTexnoNativeOrder(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("does not treat a matching contact email as ownership of an old guest order", async () => {
    const { req, res, next } = request({ auth_context: owner }, {
      order: [{ customer_id: "cus_guest", email: "same@example.test" }],
      order_cart: [{ cart: { metadata: { texno_token_hash: "historic" } } }],
    })
    await expect(guardTexnoNativeOrder(req, res, next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it("fails closed when the order customer and checkout owner disagree", async () => {
    const { req, res, next } = request({ auth_context: owner }, {
      order: [{ customer_id: owner.actor_id, metadata: { texno_customer_id: "cus_other" } }],
    })
    await expect(guardTexnoNativeOrder(req, res, next)).rejects.toMatchObject({ type: "not_allowed" })
  })

  it("rejects direct public payment mutations before touching any resources", () => {
    const { req, res, next, graph } = request({}, {})
    expect(() => blockNativeCheckoutPayments(req, res, next)).toThrow("Оплата доступна")
    expect(graph).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it.each(["request", "cancel"])("rejects legacy transfer %s before an old requester can receive the order", (operation) => {
    const { req, res, next, graph } = request({
      params: { id: "order_legacy" }, method: "POST", auth_context: { ...owner, actor_id: "cus_old_requester" },
      path: "/store/orders/order_legacy/transfer/" + operation,
    }, {})
    expect(() => blockNativeOrderTransfer(req, res, next)).toThrow("привязки заказа")
    expect(graph).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})
