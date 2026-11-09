const makeFixture = require("../lib/fixture.cjs")

const isRejected = response => [400, 403, 409, 422].includes(response.status)
const numberSum = (rows, key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)
const equalCounters = rows => rows.length > 0 && rows.every(row => Number(row.reserved) === Number(row.actual_reserved))
const nonnegative = rows => rows.every(row => Number(row.stocked) >= 0 && Number(row.reserved) >= 0 && Number(row.available) >= 0)

module.exports = async function inventory(C) {
  // Each case gets independent products/inventory. No earlier failed checkout
  // or reservation can contaminate a later scenario or another test run.
  const fixture = suffix => makeFixture({ ...C, runId: `${C.runId}-${suffix}` })
  const order = async id => C.ok(await C.ar(`/orders/${id}?fields=id,status,total,payment_status,fulfillment_status,metadata,*items,*items.detail,*fulfillments,*fulfillments.items,*payment_collections,*payment_collections.payments,*payment_collections.payments.captures,*payment_collections.payments.refunds`), "order readback").order
  const linkedOrders = async carts => (await C.db.query("SELECT cart_id,order_id FROM order_cart WHERE cart_id=ANY($1) AND deleted_at IS NULL ORDER BY cart_id,order_id", [carts])).rows
  const reservations = async variantIds => (await C.db.query("SELECT id,line_item_id,inventory_item_id,location_id,quantity::text quantity FROM reservation_item WHERE deleted_at IS NULL AND inventory_item_id IN (SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id=ANY($1) AND deleted_at IS NULL) ORDER BY id", [variantIds])).rows
  const rowFingerprint = rows => JSON.stringify(rows)
  const assertOrderCreated = (response, id) => {
    C.check(id, response.status === 200 && !!response.data.order?.id, { http: response.status })
    return C.ok(response, id).order || (() => { throw Error("Missing order in checkout response") })()
  }
  const fulfill = async (orderId, lineId, quantity, locationId) => {
    const before = new Set((await order(orderId)).fulfillments.map(item => item.id))
    const response = await C.ar(`/orders/${orderId}/fulfillments`, "POST", { items: [{ id: lineId, quantity }], location_id: locationId, no_notification: true })
    C.check("Native fulfillment accepted", response.status === 200, { http: response.status, quantity, location_id: locationId })
    C.ok(response, "fulfillment")
    const current = await order(orderId)
    const created = current.fulfillments.filter(item => !before.has(item.id))
    created.forEach(item => C.track("fulfillment", item.id))
    C.check("Fulfillment creates exactly one row", created.length === 1)
    if (created.length !== 1) throw Error("Expected one new fulfillment")
    return created[0]
  }

  await C.runCase("F1 shared inventory stock one rejects combined demand", async () => {
    const f = await fixture("shared-one"), [a, b] = f.variants
    await f.stock(a.id, [1, 0])
    const cart = await f.cart(a.id, 1)
    const before = await f.levels([a.id])
    const second = await f.item(cart, b.id, 1)
    let rejected = isRejected(second)
    if (second.status >= 200 && second.status < 300) {
      const checkout = await f.checkout(cart)
      rejected = isRejected(checkout)
    }
    const after = await f.levels([a.id]), links = await linkedOrders([cart.id])
    C.check("F1 aggregate A+B demand rejected", rejected, { add_http: second.status })
    C.check("F1 rejection creates no order", links.length === 0, { linked_orders: links.length })
    C.check("F1 rejection leaves stock/reservations unchanged", rowFingerprint(before) === rowFingerprint(after), { before, after })
  })

  await C.runCase("F1 shared inventory stock two accepts both variants", async () => {
    const f = await fixture("shared-two"), [a, b] = f.variants
    await f.stock(a.id, [2, 0])
    const cart = await f.cart(a.id, 1)
    C.ok(await f.item(cart, b.id, 1), "add second shared variant")
    const response = await f.checkout(cart), created = assertOrderCreated(response, "F1 shared stock two checkout")
    const levels = await f.levels([a.id]), rows = await reservations([a.id])
    C.check("F1 both shared variants reserve exactly two inventory units", rows.length === 2 && numberSum(rows, "quantity") === 2, { reservations: rows })
    C.check("F1 shared inventory counters agree", equalCounters(levels) && nonnegative(levels) && numberSum(levels, "reserved") === 2, { levels })
    C.check("F1 successful checkout has one cart-order link", (await linkedOrders([cart.id])).filter(row => row.order_id === created.id).length === 1)
  })

  await C.runCase("F2 delivery uses stock one plus one and partial fulfillment", async () => {
    const f = await fixture("split"), variant = f.variants[2]
    await f.stock(variant.id, [1, 1])
    const cart = await f.cart(variant.id, 2)
    const created = assertOrderCreated(await f.checkout(cart, f.delivery.id), "F2 delivery 1+1 checkout")
    const rows = await reservations([variant.id]), reserved = await f.levels([variant.id])
    C.check("F2 delivery reserves one unit at each location", rows.length === 2 && new Set(rows.map(row => row.location_id)).size === 2 && rows.every(row => Number(row.quantity) === 1), { reservations: rows })
    C.check("F2 initial counters match reservation rows", equalCounters(reserved) && numberSum(reserved, "stocked") === 2 && numberSum(reserved, "reserved") === 2, { levels: reserved })
    const line = (await order(created.id)).items.find(item => item.variant_id === variant.id)
    if (!line) throw Error("Missing split inventory order line")
    for (const [index, location] of f.locations.entries()) {
      await fulfill(created.id, line.id, 1, location.id)
      const levels = await f.levels([variant.id]), remainder = 1 - index
      C.check(`F2 partial fulfillment ${index + 1} consumes physical stock once`, numberSum(levels, "stocked") === remainder && numberSum(levels, "reserved") === remainder && equalCounters(levels) && nonnegative(levels), { levels })
    }
    C.check("F2 complete physical consumption leaves no reservations", (await reservations([variant.id])).length === 0)
  })

  await C.runCase("F2 pickup obeys selected source", async () => {
    const f = await fixture("pickup"), variant = f.variants[2]
    const options = C.ok(await C.ar("/shipping-options?limit=100")).shipping_options
    const option = options.find(item => item.metadata?.texno_delivery_id === f.pickup.id)
    const selected = option && f.locations.find(location => location.fulfillment_sets?.some(set => set.service_zones?.some(zone => zone.id === (option.service_zone_id || option.service_zone?.id))))
    if (!selected) throw Error("Cannot resolve configured pickup source from native fulfillment relations")
    await f.stock(variant.id, [1, 1])
    const cart = await f.cart(variant.id, 2), before = await f.levels([variant.id])
    const q = await f.quote(cart, f.pickup.id)
    let response = q
    if (q.status === 200) response = await C.sr(`/texno-cart/${cart.id}/checkout`, "POST", f.checkoutBody(q.data.quote.total, f.pickup.id), cart.h)
    C.check("F2 pickup cannot consume another location", isRejected(response), { http: response.status, selected_location: selected.id })
    const after = await f.levels([variant.id])
    C.check("F2 rejected pickup leaves both sources unchanged", rowFingerprint(before) === rowFingerprint(after), { before, after })
    C.check("F2 rejected pickup creates no order", (await linkedOrders([cart.id])).length === 0)
  })

  await C.runCase("F4 invalid reservation quantities have no side effects", async () => {
    const f = await fixture("negative"), variant = f.variants[0], location = f.locations[0]
    await f.stock(variant.id, [5, 0])
    const before = await f.levels([variant.id]), rowsBefore = await reservations([variant.id])
    const negative = await C.ar("/reservations", "POST", { inventory_item_id: f.inventory.id, location_id: location.id, quantity: -1, description: "Synthetic negative validation" })
    if (negative.data.reservation?.id) C.track("reservation", negative.data.reservation.id)
    C.check("F4 negative reservation create returns validation error", negative.status === 400, { http: negative.status })
    C.check("F4 negative create changes no counters or reservation rows", rowFingerprint(before) === rowFingerprint(await f.levels([variant.id])) && rowFingerprint(rowsBefore) === rowFingerprint(await reservations([variant.id])))
    const valid = C.ok(await C.ar("/reservations", "POST", { inventory_item_id: f.inventory.id, location_id: location.id, quantity: 1, description: "Synthetic positive validation" })).reservation
    C.track("reservation", valid.id)
    const positive = await f.levels([variant.id]), positiveRows = await reservations([variant.id])
    C.check("F4 positive reservation accepted", Number(valid.quantity) === 1 && equalCounters(positive))
    const update = await C.ar(`/reservations/${valid.id}`, "POST", { quantity: -2 })
    C.check("F4 negative reservation update returns validation error", update.status === 400, { http: update.status })
    C.check("F4 negative update changes no counters or reservation rows", rowFingerprint(positive) === rowFingerprint(await f.levels([variant.id])) && rowFingerprint(positiveRows) === rowFingerprint(await reservations([variant.id])))
    C.ok(await C.ar(`/reservations/${valid.id}`, "DELETE"), "delete exact valid reservation")
    C.check("F4 native reservation deletion releases exact quantity", numberSum(await f.levels([variant.id]), "reserved") === numberSum(before, "reserved"))
  })

  await C.runCase("F15 partial fulfillment from another location preserves counters", async () => {
    const f = await fixture("cross-location"), variant = f.variants[2]
    await f.stock(variant.id, [10, 10])
    const cart = await f.cart(variant.id, 2), created = assertOrderCreated(await f.checkout(cart), "F15 setup guest order")
    const held = await reservations([variant.id])
    if (!held.length || new Set(held.map(row => row.location_id)).size !== 1) throw Error("Expected concentrated initial reservation for cross-location test")
    const source = held[0].location_id, other = f.locations.find(location => location.id !== source)
    const line = (await order(created.id)).items.find(item => item.variant_id === variant.id)
    const before = await f.levels([variant.id])
    await fulfill(created.id, line.id, 1, other.id)
    const after = await f.levels([variant.id]), remaining = await reservations([variant.id])
    C.check("F15 cached reserved equals actual rows after cross-location partial fulfillment", equalCounters(after), { before, after, reservations: remaining })
    C.check("F15 exactly one physical unit consumed at chosen source", Number(after.find(row => row.location_id === other.id).stocked) === 9 && Number(after.find(row => row.location_id === source).stocked) === 10 && numberSum(after, "reserved") === 1 && numberSum(remaining, "quantity") === 1)
    const delayed = await f.levels([variant.id])
    C.check("F15 independent subsequent query retains invariant", equalCounters(delayed) && rowFingerprint(after) === rowFingerprint(delayed), { levels: delayed })
  })

  await C.runCase("F1 simultaneous carts share one inventory unit", async () => {
    const f = await fixture("race"), [a, b] = f.variants
    await f.stock(a.id, [1, 0])
    const first = await f.cart(a.id, 1), second = await f.cart(b.id, 1)
    const q1 = C.ok(await f.quote(first)), q2 = C.ok(await f.quote(second))
    // Both quotes are ready before either checkout begins. These are separate
    // HTTP transactions and cart locks targeting the same inventory row.
    const results = await Promise.all([first, second].map((cart, index) => C.sr(`/texno-cart/${cart.id}/checkout`, "POST", f.checkoutBody([q1, q2][index].quote.total), cart.h)))
    results.forEach(response => { if (response.data.order?.id) C.track("order", response.data.order.id) })
    const successes = results.filter(response => response.status === 200 && response.data.order?.id)
    C.check("F1 concurrent shared inventory yields exactly one order", successes.length === 1 && results.filter(isRejected).length === 1, { http: results.map(response => response.status) })
    const links = await linkedOrders([first.id, second.id]), levels = await f.levels([a.id])
    C.check("F1 concurrent requests create one durable cart-order relation", links.length === 1, { linked_orders: links.length })
    C.check("F1 concurrent reservation never oversells", numberSum(levels, "reserved") === 1 && numberSum(levels, "stocked") === 1 && equalCounters(levels) && nonnegative(levels), { levels })
  })

  await C.runCase("F9 native and custom completion require payment and delivery", async () => {
    const f = await fixture("complete-unpaid"), variant = f.variants[2]
    await f.stock(variant.id, [2, 0])
    const cart = await f.cart(variant.id, 1), created = assertOrderCreated(await f.checkout(cart), "F9 guest offline-payment order creation remains allowed")
    const before = await order(created.id), levelsBefore = await f.levels([variant.id])
    C.check("F9 offline guest order starts unpaid", !["captured", "paid"].includes(before.payment_status))
    const custom = await C.ar(`/customer-orders/orders/${created.id}/status`, "POST", { action: "complete" })
    const native = await C.ar(`/orders/${created.id}/complete`, "POST", {})
    const after = await order(created.id)
    C.check("F9 custom unpaid completion denied", isRejected(custom), { http: custom.status })
    C.check("F9 native unpaid completion denied", isRejected(native), { http: native.status })
    C.check("F9 completion refusal preserves order and inventory", before.status === after.status && after.status !== "completed" && before.payment_status === after.payment_status && rowFingerprint(levelsBefore) === rowFingerprint(await f.levels([variant.id])))
  })

  await C.runCase("F9 paid delivered order completes and repeats safely", async () => {
    const f = await fixture("complete-valid"), variant = f.variants[2]
    await f.stock(variant.id, [2, 0])
    const cart = await f.cart(variant.id, 1), created = assertOrderCreated(await f.checkout(cart), "F9 positive order setup")
    const initial = await order(created.id), payment = initial.payment_collections.flatMap(collection => collection.payments || [])[0]
    if (!payment) throw Error("No authorized system payment for positive completion")
    // Native default payment fields omit provider_id. Request it explicitly;
    // an absent projection field is not proof of a non-system payment.
    const details = C.ok(await C.ar(`/payments/${payment.id}?fields=id,provider_id,payment_collection_id,payment_session_id,amount,currency_code`)).payment
    if (details.provider_id !== "pp_system_default") throw Error("Manual capture guard: only pp_system_default is allowed")
    C.ok(await C.ar(`/payments/${payment.id}/capture`, "POST", {}), "record synthetic manual system payment")
    const undelivered = await C.ar(`/orders/${created.id}/complete`, "POST", {})
    C.check("F9 paid but undelivered native completion denied", isRejected(undelivered), { http: undelivered.status })
    const line = initial.items.find(item => item.variant_id === variant.id)
    const fulfillment = await fulfill(created.id, line.id, 1, f.locations[0].id)
    const endpoint = `/orders/${created.id}/fulfillments/${fulfillment.id}`
    C.ok(await C.ar(endpoint + "/shipments", "POST", { items: [{ id: line.id, quantity: 1 }], no_notification: true }), "mark synthetic shipment")
    C.ok(await C.ar(endpoint + "/mark-as-delivered", "POST", { no_notification: true }), "mark synthetic delivery")
    const ready = await order(created.id)
    C.check("F9 positive fixture is fully paid and delivered", ready.payment_status === "captured" && Number(ready.items.find(item => item.id === line.id).detail.delivered_quantity) === 1)
    const completed = await C.ar(`/orders/${created.id}/complete`, "POST", {})
    const replay = await C.ar(`/customer-orders/orders/${created.id}/status`, "POST", { action: "complete" })
    C.check("F9 native complete plus custom repeat succeeds", completed.status === 200 && replay.status === 200 && (await order(created.id)).status === "completed", { http: [completed.status, replay.status] })
    C.check("F9 completed order retains correct physical/reserved balances", numberSum(await f.levels([variant.id]), "stocked") === 1 && numberSum(await f.levels([variant.id]), "reserved") === 0)
  })
}
