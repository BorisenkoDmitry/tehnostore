const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, "../../..", relative)
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", outputText)(id => mocks[id] || {}, module, module.exports)
  return module.exports
}

function jar(values) {
  const entries = new Map(Object.entries(values))
  return { get: name => entries.has(name) ? { value: entries.get(name) } : undefined, delete: name => entries.delete(name) }
}
const { expireCustomerSession } = load("lib/util/customer-session.ts")

test("new visitors render without a customer auth request", async () => {
  let calls = 0
  const cookies = jar({ _medusa_cart_id: "guest-cart", _texno_cart_token: "guest-capability" })
  assert.deepEqual(await expireCustomerSession(cookies, async () => { calls++ }), [])
  assert.equal(calls, 0)
  assert.equal(cookies.get("_texno_cart_token").value, "guest-capability")
})

test("stale customer session is removed before rendering; guest cart capability is preserved", async () => {
  for (const status of [401, 403, 404]) {
    const cookies = jar({ _medusa_jwt: "old-jwt", _medusa_pending_customer: "pending", _medusa_cart_id: "cart", _texno_cart_token: "guest-capability" })
    assert.deepEqual(await expireCustomerSession(cookies, async token => { assert.equal(token, "old-jwt"); throw { status } }), ["_medusa_jwt", "_medusa_pending_customer"])
    assert.equal(cookies.get("_medusa_jwt"), undefined)
    assert.equal(cookies.get("_medusa_pending_customer"), undefined)
    assert.equal(cookies.get("_medusa_cart_id").value, "cart")
    assert.equal(cookies.get("_texno_cart_token").value, "guest-capability")
  }
})

test("valid login survives, and an auth-service outage does not delete cookies", async () => {
  for (const verify of [async () => ({ customer: { id: "customer" } }), async () => { throw { status: 500 } }, async () => { throw Error("network") }]) {
    const cookies = jar({ _medusa_jwt: "current-jwt" })
    assert.deepEqual(await expireCustomerSession(cookies, verify), [])
    assert.equal(cookies.get("_medusa_jwt").value, "current-jwt")
  }
})

test("authenticated cart read treats 401/403 as signed out, while server errors remain visible", async () => {
  let status = 401
  const cart = load("lib/data/texno-cart.ts", {
    "@lib/config": { sdk: { client: { fetch: async () => { if (status === 200) return { state: { cart: { id: "owned" } } }; throw { status } } } } },
    "next/headers": { cookies: async () => jar({}) },
    "@lib/data/cookies": {},
    "./cookies": { getCartId: async () => undefined, getAuthHeaders: async () => ({ authorization: "Bearer old-jwt" }) },
  })
  assert.equal(await cart.retrieveTexnoCart(), null)
  status = 403
  assert.equal(await cart.retrieveTexnoCart(), null)
  status = 500
  await assert.rejects(cart.retrieveTexnoCart(), error => error.status === 500)
  status = 200
  assert.equal((await cart.retrieveTexnoCart()).cart.id, "owned")
})

test("real Next middleware clears stale auth on the current render and browser for root, country and redirect routes", async () => {
  const { NextRequest, NextResponse } = require("next/server")
  const previousBackend = process.env.MEDUSA_INTERNAL_BACKEND_URL
  const previousFetch = global.fetch
  process.env.MEDUSA_INTERNAL_BACKEND_URL = "http://session-test.invalid"
  global.fetch = async () => ({ ok: true, json: async () => ({ regions: [{ id: "region", countries: [{ iso_2: "ru" }] }] }) })
  let lookups = 0
  const FakeMedusa = class {
    store = { customer: { retrieve: async (_query, headers) => { lookups++; assert.equal(headers.authorization, "Bearer old-jwt"); throw { status: 401 } } } }
  }
  try {
    const { middleware } = load("middleware.ts", {
      "@medusajs/js-sdk": { default: FakeMedusa },
      "next/server": { NextRequest, NextResponse },
      "./lib/util/customer-session": { expireCustomerSession },
    })
    for (const route of ["/", "/ru", "/account"]) {
      const request = new NextRequest("http://store.test" + route, { headers: { cookie: "_medusa_jwt=old-jwt; _medusa_cache_id=cache; _texno_cart_token=guest-capability" } })
      const response = await middleware(request)
      assert.ok([200, 307].includes(response.status))
      assert.match(response.headers.get("set-cookie"), /_medusa_jwt=;/)
      assert.equal(request.cookies.get("_medusa_jwt"), undefined)
      assert.equal(request.cookies.get("_texno_cart_token").value, "guest-capability")
      if (route !== "/account") {
        const forwarded = response.headers.get("x-middleware-request-cookie")
        assert.ok(forwarded.includes("_texno_cart_token=guest-capability"))
        assert.equal(forwarded.includes("_medusa_jwt="), false)
      }
    }
    const guest = await middleware(new NextRequest("http://store.test/ru", { headers: { cookie: "_medusa_cache_id=cache" } }))
    assert.equal(guest.status, 200)
    assert.equal(lookups, 3)
  } finally {
    global.fetch = previousFetch
    if (previousBackend === undefined) delete process.env.MEDUSA_INTERNAL_BACKEND_URL
    else process.env.MEDUSA_INTERNAL_BACKEND_URL = previousBackend
  }
})
