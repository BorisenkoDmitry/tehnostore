const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

// Execute the real TS/TSX modules. The small host substitutes network and React
// hooks so these focused tests run under Node without a second browser runtime.
function load(relative, overrides = {}) {
  const file = path.resolve(__dirname, "../../..", relative)
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2021 } })
  const jsx = (type, props) => ({ type, props: props ?? {} })
  const hooks = { useState: (initial) => [initial, () => {}], useRef: (current) => ({ current }), useEffect: () => {}, cache: (fn) => fn }
  const mocks = {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "server-only": {},
    "next/navigation": { useParams: () => ({ countryCode: "ru" }), useRouter: () => ({ refresh() {} }) },
    ...overrides,
  }
  const module = { exports: {} }
  new Function("require", "module", "exports", outputText)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id]
    if (id.endsWith(".css")) return { __esModule: true, default: {} }
    return { __esModule: true, default: id, StoreIcon: "icon" }
  }, module, module.exports)
  return module.exports
}

function elements(node) {
  if (!node || typeof node !== "object") return []
  if (Array.isArray(node)) return node.flatMap(elements)
  return [node, ...elements(node.props?.children)]
}

test("F10 hidden product becomes a Next 404; unexpected backend errors remain failures", async () => {
  const missing = new Error("NEXT_NOT_FOUND")
  const backend = new Error("backend unavailable")
  let status = 404
  const { retrieveCatalogProduct } = load("lib/data/catalog-product.ts", {
    "@lib/config": { sdk: { client: { fetch: async () => { if (status === 200) return { product: { id: "visible" } }; if (status === 404) throw { status: 404 }; throw backend } } } },
    "next/navigation": { notFound: () => { throw missing } },
  })
  await assert.rejects(retrieveCatalogProduct("hidden"), (error) => error === missing)
  status = 500
  await assert.rejects(retrieveCatalogProduct("broken"), (error) => error === backend)
  status = 200
  assert.equal((await retrieveCatalogProduct("visible")).id, "visible")
})

test("F11 schema advertises live variant prices, currency and availability without historical stock", () => {
  const { buildCatalogStructuredData } = load("lib/util/catalog-structured-data.ts")
  const product = { id: "product", title: "Свитер", variants: [{ id: "m", sku: "SKU-M" }, { id: "l", sku: "SKU-L" }] }
  const catalog = { currency_code: "rub", checkout_available: true, attributes: [], variants: [
    { id: "m", price: 1950, stock_known: true, inventory_quantity: 1 },
    { id: "l", price: 2050, stock_known: true, inventory_quantity: 0 },
    { id: "unknown", price: null, stock_known: false, inventory_quantity: 10 },
  ] }
  let result = buildCatalogStructuredData(product, catalog, "http://store.test/ru/products/sweater")
  assert.equal(result.offers.length, 2)
  assert.deepEqual(result.offers.map(({ price, priceCurrency, availability }) => ({ price, priceCurrency, availability })), [
    { price: "1950.00", priceCurrency: "RUB", availability: "https://schema.org/InStock" },
    { price: "2050.00", priceCurrency: "RUB", availability: "https://schema.org/OutOfStock" },
  ])
  catalog.variants[0].price = 0
  catalog.variants[0].stock_known = false
  result = buildCatalogStructuredData(product, catalog, "http://store.test/product")
  assert.equal(result.offers[0].price, "0.00")
  assert.equal(result.offers[0].availability, "https://schema.org/OutOfStock")
  assert.equal(buildCatalogStructuredData(product, { ...catalog, checkout_available: false }, "http://store.test/product").offers, undefined)
})

test("F14 contact consent uses configured document URLs and does not invent a slug", () => {
  const EmailForm = load("modules/information/templates/contacts/email-form.tsx").default
  const tree = EmailForm({ contactEmail: "contact@example.test", documents: { privacy: "/ru/page/shop-privacy", consent: "/ru/page/shop-consent" } })
  assert.deepEqual(elements(tree).filter((node) => node.type === "a").map((node) => node.props.href), ["/ru/page/shop-consent", "/ru/page/shop-privacy", "mailto:contact@example.test"])
  const missing = EmailForm({ contactEmail: "contact@example.test", documents: {} })
  assert.equal(elements(missing).some((node) => node.props?.href?.includes("privacy-policy")), false)
})

test("F16 saved-cart choice remains actionable after clearing the active cart", async () => {
  let calls = 0
  const TexnoCart = load("modules/cart/components/texno-cart/index.tsx", {
    "@lib/data/texno-cart": { chooseSavedCart: async (id) => { calls++; assert.equal(id, "saved"); return { state: { cart: { items: [], currency_code: "rub" } } } } },
  }).default
  const state = { cart: { items: [], currency_code: "rub" }, configuration: { delivery_methods: [] }, merge_pending: { message: "Проверьте", carts: [{ id: "saved" }] } }
  const tree = TexnoCart({ initialState: state })
  assert.equal(tree.props["data-testid"], "empty-cart")
  const choice = elements(tree).find((node) => node.type === "button" && node.props.children?.includes?.("Проверить корзину "))
  assert.ok(choice, "empty-cart must retain the saved-cart selector")
  await choice.props.onClick()
  assert.equal(calls, 1)
})

