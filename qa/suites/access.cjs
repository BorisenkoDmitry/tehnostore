const makeFixture = require("../lib/fixture.cjs")

// Preserves the 55 assertions of the earlier cart/order/payment regression,
// using fresh allowlisted API fixtures and a read-only scoped DB fingerprint.
module.exports = async function accessSuite(C) {
const { db, report, randomUUID, createHash, deny, check, ok, request, ar, sr, auth, runCase } = C
const customer = async label => {
  const email = `remediation-${C.runId}-${label}@example.test`
  const password = randomUUID() + "Aa1!"
  const registration = ok(await auth("/customer/emailpass/register", { email, password }), "customer registration")
  const created = ok(await sr("/customers", "POST", { email, first_name: "Synthetic " + label }, { authorization: "Bearer " + registration.token }), "customer record").customer
  C.track("customer", created.id)
  const payload = JSON.parse(Buffer.from(registration.token.split(".")[1], "base64url").toString())
  if (payload.auth_identity_id) C.track("auth_identity", payload.auth_identity_id)
  const login = ok(await auth("/customer/emailpass", { email, password }), "customer login")
  return { id: created.id, email, h: { authorization: "Bearer " + login.token } }
}
const cart = (...args) => f.cart(...args)
const order = async id => ok(await ar("/orders/" + id + "?fields=id,status,total,*items,*items.detail,*fulfillments,*payment_collections,*payment_collections.payments"), "order readback").order
let f, v, a, b, victim, other, guestA, cartB, orderA, orderB, paymentA, paymentB, legacy, legacyAccount
const enc = id => "%" + id.charCodeAt(0).toString(16) + id.slice(1)
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
async function scopedSnapshot() {
  const carts = [victim.id, other.id, guestA.id, cartB.id, legacy.id, legacyAccount.id]
  const orders = [orderA.id, orderB.id], collections = [paymentA.collection, paymentB.collection]
  const state = {}
  for (const [name, sql, ids] of [
    ["carts", "SELECT * FROM cart WHERE id=ANY($1) ORDER BY id", carts],
    ["cart_lines", "SELECT * FROM cart_line_item WHERE cart_id=ANY($1) ORDER BY id", carts],
    ["cart_address", "SELECT * FROM cart_address WHERE id IN (SELECT shipping_address_id FROM cart WHERE id=ANY($1) UNION SELECT billing_address_id FROM cart WHERE id=ANY($1)) ORDER BY id", carts],
    ["cart_order_links", "SELECT * FROM order_cart WHERE cart_id=ANY($1) ORDER BY id", carts],
    ["cart_payment_links", "SELECT * FROM cart_payment_collection WHERE cart_id=ANY($1) ORDER BY id", carts],
    ["orders", 'SELECT * FROM "order" WHERE id=ANY($1) ORDER BY id', orders],
    ["order_items", "SELECT * FROM order_item WHERE order_id=ANY($1) ORDER BY id", orders],
    ["order_lines", "SELECT * FROM order_line_item WHERE id IN (SELECT item_id FROM order_item WHERE order_id=ANY($1)) ORDER BY id", orders],
    ["order_addresses", 'SELECT * FROM order_address WHERE id IN (SELECT shipping_address_id FROM "order" WHERE id=ANY($1) UNION SELECT billing_address_id FROM "order" WHERE id=ANY($1)) ORDER BY id', orders],
    ["payment_collections", "SELECT * FROM payment_collection WHERE id=ANY($1) ORDER BY id", collections],
    ["sessions", "SELECT * FROM payment_session WHERE payment_collection_id=ANY($1) ORDER BY id", collections],
    ["payments", "SELECT * FROM payment WHERE payment_collection_id=ANY($1) ORDER BY id", collections],
    ["inventory", "SELECT * FROM inventory_level WHERE inventory_item_id IN (SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id=ANY($1)) ORDER BY id", [v]],
    ["reservations", "SELECT * FROM reservation_item WHERE inventory_item_id IN (SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id=ANY($1)) ORDER BY id", [v]]
  ]) {
    const rows = (await db.query(sql, [ids])).rows
    state[name] = { rows: rows.length, sha256: digest(rows) }
  }
  return state
}
async function deniedGroup(id, attempts) {
  const before = await scopedSnapshot()
  for (const [label, method, path, body, headers] of attempts) {
    const r = await request(path, method, body, headers)
    const leaks = Boolean(r.data.cart || r.data.order || r.data.payment_collection || r.data.payment_session)
    check("ACCESS-" + label, deny(r) && !leaks, { method, path: path.split("?")[0], http: r.status, responseContainsResource: leaks })
  }
  const after = await scopedSnapshot()
  check(id + "-DB-NO-WRITE", JSON.stringify(before) === JSON.stringify(after), { before, after })
}
async function prepare() {
  f = await makeFixture({ ...C, runId: C.runId + "-access" })
  v = f.variants[2].id
  await f.stock(v, [100, 100])
  a = await customer("access-a"); b = await customer("access-b")
  victim = await cart(v); other = await cart(v); guestA = await cart(v); cartB = await cart(v)
  ok(await sr("/texno-cart/" + cartB.id + "/claim", "POST", {}, { ...cartB.h, ...b.h }), "claim B cart")
  cartB.h = b.h
  orderA = ok(await f.checkout(guestA), "guest order A").order
  orderB = ok(await f.checkout(cartB), "customer order B").order
  paymentA = (await db.query("SELECT cp.payment_collection_id collection,ps.id session FROM cart_payment_collection cp JOIN payment_session ps ON ps.payment_collection_id=cp.payment_collection_id WHERE cp.cart_id=$1 AND ps.deleted_at IS NULL AND cp.deleted_at IS NULL", [guestA.id])).rows[0]
  paymentB = (await db.query("SELECT cp.payment_collection_id collection,ps.id session FROM cart_payment_collection cp JOIN payment_session ps ON ps.payment_collection_id=cp.payment_collection_id WHERE cp.cart_id=$1 AND ps.deleted_at IS NULL AND cp.deleted_at IS NULL", [cartB.id])).rows[0]
  legacy = ok(await sr("/carts", "POST", { region_id: f.region.id }), "legacy guest cart").cart
  legacyAccount = ok(await sr("/carts", "POST", { region_id: f.region.id }, a.h), "legacy account cart").cart
  C.track("cart", legacy.id)
  C.track("cart", legacyAccount.id)
  C.track("payment_collection", paymentA.collection)
  C.track("payment_collection", paymentB.collection)
  C.track("payment_session", paymentA.session)
  C.track("payment_session", paymentB.session)
  report.access_fixture = { carts: [victim.id, other.id, guestA.id, cartB.id, legacy.id, legacyAccount.id], orders: [orderA.id, orderB.id], customers: [a.id, b.id], variant: v }
}
async function access() {
  const line = ok(await sr("/texno-cart/" + victim.id, "GET", undefined, victim.h), "victim read").cart.items[0].id
  const shipping = ok(await ar("/shipping-options?limit=100")).shipping_options.find(option => option.metadata?.texno_delivery_id === f.pickup.id)?.id
  if (!shipping) throw Error("Missing configured native pickup option")
  const address = (await db.query("SELECT shipping_address_id FROM cart WHERE id=$1", [guestA.id])).rows[0].shipping_address_id
  const native = "/store/CARTS/" + enc(victim.id), guest = "/store/ORDERS/" + enc(orderA.id), account = "/store/ORDERS/" + enc(orderB.id)
  const own = await sr("/ORDERS/" + enc(orderB.id) + "/", "GET", undefined, b.h), head = await request(account, "HEAD", undefined, b.h), list = await sr("/orders", "GET", undefined, b.h), otherList = await sr("/orders", "GET", undefined, a.h)
  check("ACCESS-OWNER-NATIVE-ENCODED-HEAD-LIST", own.data.order?.id === orderB.id && head.status === 200 && list.data.orders?.some(o => o.id === orderB.id) && !otherList.data.orders?.some(o => o.id === orderB.id), { http: [own.status, head.status, list.status, otherList.status] })
  const legacyOwn = await sr("/CARTS/" + enc(legacyAccount.id), "GET", undefined, a.h), legacyGuest = await sr("/CARTS/" + enc(legacy.id), "POST", { metadata: { ucp_canceled: false } })
  check("ACCESS-LEGACY-COMPATIBLE", legacyOwn.status === 200 && legacyGuest.status === 200, { http: [legacyOwn.status, legacyGuest.status] })
  await deniedGroup("ACCESS-CART-ORDER", [
    ["WRONG-CAPABILITY", "GET", "/store/texno-cart/" + victim.id, undefined, other.h],
    ["NATIVE-CART-GET", "GET", "/store/carts/" + victim.id],
    ["NATIVE-CART-ENCODED-UPPER-TRAILING", "GET", native + "/?fields=id,email,*items"],
    ["NATIVE-CART-WITH-CAPABILITY", "GET", native, undefined, victim.h],
    ["NATIVE-CART-HEAD", "HEAD", native],
    ["NATIVE-ACCOUNT-CART-FOREIGN", "GET", "/store/carts/" + legacyAccount.id, undefined, b.h],
    ["NATIVE-ACCOUNT-CART-ANONYMOUS", "GET", "/store/carts/" + legacyAccount.id],
    ["NATIVE-CART-INVALID-PERCENT", "GET", "/store/carts/%XX"],
    ["NATIVE-CART-DOUBLE-ENCODED", "GET", "/store/carts/%2563" + victim.id.slice(1)],
    ["NATIVE-CART-ENCODED-SLASH", "GET", "/store/carts/" + victim.id + "%2Fcomplete"],
    ["NATIVE-CART-NUL", "GET", "/store/carts/" + victim.id + "%00"],
    ["NATIVE-CART-CONTACT", "POST", native, { email: a.email }, a.h],
    ["NATIVE-CART-OWNER-TRANSFER", "POST", native + "/customer", {}, a.h],
    ["NATIVE-CART-ITEM-ADD", "POST", native + "/line-items", { variant_id: v, quantity: 1 }],
    ["NATIVE-CART-ITEM-UPDATE", "POST", native + "/line-items/" + line, { quantity: 2 }],
    ["NATIVE-CART-ITEM-DELETE", "DELETE", native + "/line-items/" + line],
    ["NATIVE-CART-MIXED-ITEM-UPDATE", "POST", "/store/carts/" + legacy.id + "/line-items/" + enc(line), { quantity: 2 }],
    ["NATIVE-CART-MIXED-ITEM-DELETE", "DELETE", "/store/carts/" + legacy.id + "/line-items/" + enc(line)],
    ["NATIVE-CART-SHIPPING", "POST", native + "/shipping-methods", { option_id: shipping }],
    ["NATIVE-CART-PROMOTION", "POST", native + "/promotions", { promo_codes: ["COM-QA"] }],
    ["NATIVE-CART-PROMOTION-DELETE", "DELETE", native + "/promotions", { promo_codes: ["COM-QA"] }],
    ["NATIVE-CART-TAX", "POST", native + "/taxes"],
    ["NATIVE-CART-COMPLETE", "POST", native + "/complete"],
    ["NATIVE-CART-COMPLETE-REPLAY", "POST", "/store/carts/" + enc(guestA.id) + "/complete", undefined, a.h],
    ["SHIPPING-FOREIGN-LIST", "GET", "/store/SHIPPING-OPTIONS?cart_id=" + enc(victim.id)],
    ["SHIPPING-FOREIGN-CALCULATE", "POST", "/store/SHIPPING-OPTIONS/" + shipping + "/calculate", { cart_id: victim.id }],
    ["CART-FORGED-CHECKOUT-MARKER", "POST", "/store/CARTS", { region_id: f.region.id, metadata: { texno_checkout: "true" } }],
    ["CART-FORGED-OWNER-MARKER", "POST", "/store/carts/" + legacy.id, { metadata: { texno_customer_id: a.id } }],
    ["CART-MIXED-ADDRESS-CREATE", "POST", "/store/carts", { region_id: f.region.id, shipping_address: address }],
    ["CART-MIXED-ADDRESS-UPDATE", "POST", "/store/carts/" + legacy.id, { shipping_address: { id: address, address_1: "COM QA forged" } }],
    ["NATIVE-GUEST-ORDER", "GET", guest + "/?fields=id,email,*shipping_address"],
    ["NATIVE-FOREIGN-ORDER", "GET", account, undefined, a.h],
    ["NATIVE-INVALID-ORDER-ENCODING", "GET", "/store/orders/%E0%A4"],
    ["NATIVE-ORDER-TRANSFER-REQUEST", "POST", guest + "/transfer/request", {}, a.h],
    ["NATIVE-ORDER-TRANSFER-CANCEL", "POST", account + "/transfer/cancel", {}, b.h],
    ["NATIVE-ORDER-TRANSFER-ACCEPT", "POST", account + "/transfer/accept", { token: randomUUID() }],
    ["NATIVE-ORDER-TRANSFER-DECLINE", "POST", account + "/transfer/decline", { token: randomUUID() }],
    ["NATIVE-ORDER-RETURN", "POST", "/store/RETURNS", { order_id: orderA.id, items: [{ id: (await order(orderA.id)).items[0].id, quantity: 1 }] }]
  ])
  const collection = "/store/PAYMENT-COLLECTIONS", sessions = p => collection + "/" + enc(p.collection) + "/payment-sessions"
  await deniedGroup("ACCESS-PAYMENTS", [
    ["PAYMENT-CREATE-FOREIGN", "POST", collection + "/", { cart_id: victim.id }],
    ["PAYMENT-CREATE-CAPABILITY", "POST", collection, { cart_id: victim.id }, victim.h],
    ["PAYMENT-CREATE-FOREIGN-ACCOUNT", "POST", collection, { cart_id: cartB.id }, a.h],
    ["PAYMENT-CREATE-OWNER-COMPLETED", "POST", collection, { cart_id: cartB.id }, b.h],
    ["PAYMENT-CREATE-LEGACY-OWNER", "POST", collection, { cart_id: legacyAccount.id }, a.h],
    ["SESSION-CREATE-FOREIGN", "POST", sessions(paymentA), { provider_id: "pp_system_default" }, a.h],
    ["SESSION-CREATE-OWNER", "POST", sessions(paymentB), { provider_id: "pp_system_default" }, b.h],
    ["SESSION-CREATE-SMUGGLED-IDS", "POST", sessions(paymentB), { provider_id: "pp_system_default", data: { cart_id: guestA.id, payment_collection_id: paymentA.collection, payment_session_id: paymentA.session } }, b.h],
    ["SESSION-UPDATE-FOREIGN", "POST", sessions(paymentA) + "/" + enc(paymentA.session), { client_data: { probe: true } }],
    ["SESSION-UPDATE-MIXED", "POST", sessions(paymentB) + "/" + enc(paymentA.session), { client_data: { probe: true } }, b.h],
    ["SESSION-UPDATE-OWNER", "POST", sessions(paymentB) + "/" + enc(paymentB.session), { client_data: { probe: true } }, b.h],
    ["SESSION-CREATE-UNKNOWN", "POST", collection + "/pay_col_unknown/payment-sessions", { provider_id: "pp_system_default" }]
  ])
  const fakeAdmin = await request("/admin/customer-orders/orders", "GET", undefined, a.h, "auth"), noAdmin = await request("/admin/customer-orders/orders", "GET", undefined, {}, "auth")
  check("ACCESS-CUSTOMER-NOT-ADMIN", deny(fakeAdmin) && deny(noAdmin), { http: [fakeAdmin.status, noAdmin.status] })
}
await prepare()
await runCase("ACCESS-REGRESSION", access)
}
