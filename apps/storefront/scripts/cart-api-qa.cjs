// Local, non-completing API checks. This harness never creates an order.
const fs = require("node:fs")
const path = require("node:path")
const { randomUUID } = require("node:crypto")

const commerceRoot = path.resolve(__dirname, "../../..")
try { process.loadEnvFile(path.join(commerceRoot, ".env")) } catch {}
const base = "http://localhost:9000"
const publicKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
if (!publicKey) throw new Error("Publishable key is required in the local environment")
const output = { generated_at: new Date().toISOString(), safety: "No checkout completion, no stock consumption, no payments or notifications", checks: [] }
const check = (name, condition, evidence) => output.checks.push({ name, status: condition ? "PASS" : "FAIL", evidence })
const request = async (route, { method = "GET", body, token } = {}) => {
  const response = await fetch(base + route, {
    method,
    headers: { "content-type": "application/json", "x-publishable-api-key": publicKey, ...(token ? { "x-texno-cart-token": token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}
const forbidden = response => [401, 403, 404].includes(response.status) || (response.status === 400 && /недоступна|защищённую корзину|недоступен/i.test(String(response.data.message ?? "")) && !response.data.cart)

async function main() {
  const created = await request("/store/texno-cart", { method: "POST", body: {} })
  check("create isolated guest RUB cart", created.status === 200 && created.data.cart?.currency_code === "rub" && typeof created.data.token === "string", { status: created.status, currency: created.data.cart?.currency_code })
  if (!created.data.cart?.id || !created.data.token) throw new Error("Cart creation unavailable")
  const { cart, token, configuration } = created.data
  const route = `/store/texno-cart/${cart.id}`
  output.cart_id = cart.id
  const owner = await request(route, { token })
  check("owner can read own cart", owner.status === 200 && owner.data.cart?.id === cart.id, { status: owner.status })
  for (const [label, attacker] of [["missing token", undefined], ["incorrect token", "cart-qa-invalid-token"]]) {
    const other = await request(route, { token: attacker })
    check(`${label} cannot read cart`, forbidden(other), { status: other.status })
    const mutate = await request(`${route}/items`, { method: "POST", token: attacker, body: { variant_id: "variant_cart_qa_missing", quantity: 1, mutation_id: randomUUID() } })
    check(`${label} cannot mutate cart`, forbidden(mutate), { status: mutate.status })
  }
  const nativeRead = await request(`/store/carts/${cart.id}`)
  check("native cart endpoint cannot bypass custom ownership", forbidden(nativeRead), { status: nativeRead.status })
  const invalidVariant = await request(`${route}/items`, { method: "POST", token, body: { variant_id: "variant_cart_qa_missing", quantity: 1, mutation_id: randomUUID() } })
  check("missing variant rejected", [400, 404].includes(invalidVariant.status), { status: invalidVariant.status })
  for (const quantity of [-1, 0.5, 10000]) {
    const response = await request(`${route}/items`, { method: "POST", token, body: { variant_id: "variant_cart_qa_missing", quantity, mutation_id: randomUUID() } })
    check(`invalid quantity ${quantity} rejected`, [400, 422].includes(response.status), { status: response.status })
  }
  const tamper = await request(`${route}/items`, { method: "POST", token, body: { variant_id: "variant_cart_qa_missing", quantity: 1, unit_price: 1, mutation_id: randomUUID() } })
  check("client supplied unit price rejected by request schema", [400, 422].includes(tamper.status) && /unit_price|unrecognized|unknown key/i.test(String(tamper.data.message ?? "")), { status: tamper.status, message: tamper.data.message })
  check("nine shipping methods and six opt-in services from backend", configuration?.delivery_methods?.length === 9 && configuration?.services?.length === 6, { methods: configuration?.delivery_methods?.map(method => ({ id: method.id, price: method.price, pricing: method.pricing, min: method.min, max: method.max })), services: configuration?.services?.map(service => ({ id: service.id, price: service.price })) })
  const expectedServices = { sim: 200, activation: 190, protection: 290, apple_id: 790, warranty: 490, application: 390 }
  check("service tariffs match reference", configuration?.services?.every(service => expectedServices[service.id] === service.price), configuration?.services?.map(service => ({ id: service.id, price: service.price })))
  const invalidService = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "none", services: ["cart-qa-injected-service"] } })
  check("unknown service rejected", [400, 422].includes(invalidService.status), { status: invalidService.status })
  const duplicateService = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "none", services: ["sim", "sim"] } })
  check("duplicate service rejected", [400, 422].includes(duplicateService.status), { status: duplicateService.status })
  const invalidDelivery = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "cart-qa-injected-shipping", services: [] } })
  check("unknown shipping method rejected", [400, 422].includes(invalidDelivery.status), { status: invalidDelivery.status })
  const final = await request(route, { token })
  check("invalid operations leave cart empty", final.status === 200 && final.data.cart?.items?.length === 0, { status: final.status, item_count: final.data.cart?.items?.length })
  const fixtures = await request("/store/products?handle=texno-cart-qa-fixture-20261107&fields=id,handle,variants.id,variants.title")
  const fixture = fixtures.data.products?.[0]
  if (!fixture) {
    output.checks.push({ name: "fixture stock/idempotency checks", status: "NOTCHECKED", evidence: "Dedicated QA fixture unavailable" })
    return
  }
  const black = fixture.variants.find(variant => variant.title === "Чёрный")
  const white = fixture.variants.find(variant => variant.title === "Белый")
  const unknown = fixture.variants.find(variant => variant.title === "Неизвестный остаток")
  const mutate = (variant, quantity, mutation_id = randomUUID(), extras = {}) => request(`${route}/items`, { method: "POST", token, body: { variant_id: variant.id, quantity, mutation_id, ...extras } })
  if (!black || !white || !unknown) throw new Error("Dedicated fixture variants incomplete")
  const nativeBulk = await request("/store/carts", { method: "POST", body: { region_id: cart.region_id, items: [{ variant_id: black.id, quantity: 1 }] } })
  check("native bulk cart creation cannot bypass TEXNO purchase guard", nativeBulk.status === 400 && !nativeBulk.data.cart && /корзин|TEXNO/i.test(String(nativeBulk.data.message ?? "")), { status: nativeBulk.status, message: nativeBulk.data.message })
  const unknownAdd = await mutate(unknown, 1)
  check("unknown stock variant cannot be added server-side", unknownAdd.status === 400 && /наличие|наличии/i.test(String(unknownAdd.data.message)), { status: unknownAdd.status, message: unknownAdd.data.message })
  const addId = randomUUID()
  const added = await mutate(black, 1, addId)
  check("fixture add uses server RUB price", added.status === 200 && added.data.cart?.items?.[0]?.unit_price === 1500 && added.data.cart?.items?.[0]?.quantity === 1, { status: added.status, message: added.data.message, lines: added.data.cart?.items?.map(item => ({ quantity: item.quantity, unit_price: item.unit_price })) })
  const repeated = await mutate(black, 1, addId)
  check("same mutation UUID retry leaves one unit", repeated.status === 200 && repeated.data.cart?.items?.filter(item => item.variant_id === black.id).length === 1 && repeated.data.cart.items.find(item => item.variant_id === black.id)?.quantity === 1, { status: repeated.status, message: repeated.data.message })
  const incrementId = randomUUID()
  const increment = await mutate(black, 1, incrementId, { increment: true })
  const incrementReplay = await mutate(black, 1, incrementId, { increment: true })
  check("increment retry with same UUID does not duplicate quantity", increment.status === 200 && incrementReplay.status === 200 && incrementReplay.data.cart?.items?.find(item => item.variant_id === black.id)?.quantity === 2, { first_status: increment.status, retry_status: incrementReplay.status, quantity: incrementReplay.data.cart?.items?.find(item => item.variant_id === black.id)?.quantity })
  await mutate(black, 1)
  const concurrent = await Promise.all([mutate(black, 1, randomUUID(), { increment: true }), mutate(black, 1, randomUUID(), { increment: true })])
  const afterConcurrent = await request(route, { token })
  check("concurrent increments serialize without lost updates", concurrent.every(response => response.status === 200) && afterConcurrent.data.cart?.items?.find(item => item.variant_id === black.id)?.quantity === 3, { statuses: concurrent.map(response => response.status), quantity: afterConcurrent.data.cart?.items?.find(item => item.variant_id === black.id)?.quantity })
  const concurrentOver = await Promise.all([mutate(black, 1, randomUUID(), { increment: true }), mutate(black, 1, randomUUID(), { increment: true })])
  check("concurrent increments beyond stock are both rejected", concurrentOver.every(response => response.status === 400), { statuses: concurrentOver.map(response => response.status) })
  await mutate(black, 1)
  const tamperedReal = await mutate(black, 1, randomUUID(), { unit_price: 1 })
  check("valid fixture cannot supply a client unit price", tamperedReal.status === 400 && /unit_price|unrecognized/i.test(String(tamperedReal.data.message)), { status: tamperedReal.status })
  const overStock = await mutate(black, 4)
  check("stock3 rejects requested quantity4", overStock.status === 400, { status: overStock.status, message: overStock.data.message })
  const second = await mutate(white, 1)
  check("different actual variants remain separate lines", second.status === 200 && second.data.cart?.items?.length === 2 && new Set(second.data.cart.items.map(item => item.variant_id)).size === 2, { status: second.status, message: second.data.message })
  const quoted = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "moscow", services: ["sim", "activation"] } })
  check("quote uses server item/service/shipping sums", quoted.status === 200 && quoted.data.quote?.items_total === 3200 && quoted.data.quote?.services_total === 390 && quoted.data.quote?.delivery_total === 299 && quoted.data.quote?.total === 3889, { status: quoted.status, quote: quoted.data.quote })
  const range = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "outside_mkad", services: [] } })
  check("range quote remains preliminary with no fake exact delivery", range.status === 200 && range.data.quote?.delivery_total === null && range.data.quote?.requires_confirmation === true && range.data.quote?.min_total === 3800 && range.data.quote?.max_total === 4400, { status: range.status, quote: range.data.quote })
  const cdek = await request(`${route}/quote`, { method: "POST", token, body: { delivery_method: "cdek", services: [] } })
  check("CDEK is uncalculated rather than guaranteed zero", cdek.status === 200 && cdek.data.quote?.delivery_total === null && cdek.data.quote?.requires_confirmation === true, { status: cdek.status, quote: cdek.data.quote })
  const nativeWrite = await request(`/store/carts/${cart.id}/line-items`, { method: "POST", body: { variant_id: black.id, quantity: 1 } })
  check("native cart mutation cannot bypass custom access", forbidden(nativeWrite), { status: nativeWrite.status })
  await mutate(black, 0)
  const removed = await mutate(white, 0)
  check("all fixture lines can be removed leaving empty cart", removed.status === 200 && removed.data.cart?.items?.length === 0, { status: removed.status, item_count: removed.data.cart?.items?.length })
}

main().catch(error => { output.error = error.message; process.exitCode = 1 }).finally(() => {
  output.summary = output.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  fs.writeFileSync(path.join(commerceRoot, "output/cart-qa-api.json"), JSON.stringify(output, null, 2))
  console.log(JSON.stringify({ summary: output.summary, ...(output.error ? { error: output.error } : {}) }))
})
